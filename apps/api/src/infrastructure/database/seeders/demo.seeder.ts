import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { CompanySettings } from '../../../modules/access/entities/company-settings.entity';
import { MembershipRole } from '../../../modules/access/entities/membership-role.entity';
import { Permission } from '../../../modules/access/entities/permission.entity';
import { RolePermission } from '../../../modules/access/entities/role-permission.entity';
import { Role } from '../../../modules/access/entities/role.entity';
import {
  COMPANY_ADMIN_ROLE,
  EMPLOYEE_ROLE,
  HR_MANAGER_ROLE,
  LEGACY_TENANT_ADMIN_ROLE,
  MANAGER_ROLE,
  SYSTEM_ROLE_DEFAULT_PERMISSIONS,
  TENANT_SYSTEM_ROLES,
} from '../../../modules/access/system-roles';
import { Holiday } from '../../../modules/hrm/attendance/entities/holiday.entity';
import { ShiftAssignment } from '../../../modules/hrm/attendance/entities/shift-assignment.entity';
import { Shift } from '../../../modules/hrm/attendance/entities/shift.entity';
import { EmployeeDocument } from '../../../modules/hrm/employees/entities/employee-document.entity';
import { Employee } from '../../../modules/hrm/employees/entities/employee.entity';
import { EmploymentHistory } from '../../../modules/hrm/employees/entities/employment-history.entity';
import { LeaveType } from '../../../modules/hrm/leaves/entities/leave-type.entity';
import { Compensation } from '../../../modules/hrm/payroll/entities/compensation.entity';
import { TaxSlab } from '../../../modules/hrm/payroll/entities/tax-slab.entity';
import { Branch } from '../../../modules/hrm/organization/entities/branch.entity';
import { Department } from '../../../modules/hrm/organization/entities/department.entity';
import { Designation } from '../../../modules/hrm/organization/entities/designation.entity';
import { DocumentType } from '../../../modules/hrm/organization/entities/document-type.entity';
import { EmploymentStatus } from '../../../modules/hrm/organization/entities/employment-status.entity';
import { EmploymentType } from '../../../modules/hrm/organization/entities/employment-type.entity';
import {
  MembershipStatus,
  TenantMembership,
} from '../../../platform/auth/entities/tenant-membership.entity';
import { User } from '../../../platform/auth/entities/user.entity';

export type DemoSeederOptions = {
  tenantId: number;
  adminEmail: string;
  adminPassword: string;
  companyName?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  themeMode?: 'dark' | 'light';
  logoUrl?: string | null;
  seedEmployees?: boolean;
  seedSuperAdmin?: boolean;
};

const logger = new Logger('DemoSeeder');

async function upsertByCode<T extends { code: string; id: number }>(
  repo: {
    findOne: (opts: { where: { code: string } }) => Promise<T | null>;
    create: (data: object) => T;
    save: (entity: T) => Promise<T>;
  },
  data: { code: string } & Record<string, unknown>,
) {
  const existing = await repo.findOne({ where: { code: data.code } });
  if (existing) return existing;
  return repo.save(repo.create(data));
}

/**
 * Idempotent tenant bootstrap (RBAC + company branding + optional employees).
 */
export async function seedTenantData(
  masterDs: DataSource,
  tenantDs: DataSource,
  options: DemoSeederOptions,
) {
  await seedCompany(tenantDs, options);
  await seedRbac(tenantDs);
  const adminUser = await seedAdminUser(masterDs, options);
  // Legacy: only seed Super Admin user when explicitly requested; never grant membership.
  if (options.seedSuperAdmin === true) {
    await ensurePlatformSuperAdmin(masterDs, options.adminPassword);
  }
  const membership = await seedAdminMembership(
    masterDs,
    tenantDs,
    options.tenantId,
    adminUser,
  );
  const org = await seedOrganization(tenantDs);
  await ensureDemoRoleUsers(tenantDs, masterDs, options.tenantId);
  if (options.seedEmployees !== false) {
    await seedEmployees(tenantDs, masterDs, options.tenantId, org, adminUser.id);
  }
  await seedAttendanceLeaveDefaults(tenantDs);
  await seedPayrollDefaults(tenantDs);

  logger.log(
    `Tenant seed complete (membership=${membership.id}, company=${options.companyName ?? 'Demo'})`,
  );
}

/** @deprecated use seedTenantData */
export const seedDemoData = seedTenantData;

/**
 * Starter permission *definitions* for a new tenant library.
 * System roles receive default grants via SYSTEM_ROLE_DEFAULT_PERMISSIONS.
 */
const STARTER_PERMISSION_DEFINITIONS = [
  { key: 'employee.read', label: 'View employees' },
  { key: 'employee.write', label: 'Manage employees' },
  { key: 'attendance.create', label: 'Check in / check out' },
  { key: 'attendance.read', label: 'View attendance' },
  { key: 'attendance.update', label: 'Edit attendance records' },
  { key: 'attendance.import', label: 'Import attendance' },
  { key: 'attendance.export', label: 'Export attendance' },
  { key: 'attendance.report.read', label: 'View attendance reports' },
  { key: 'attendance.approve', label: 'Approve attendance corrections' },
  { key: 'leave.read', label: 'View leave' },
  { key: 'leave.approve', label: 'Approve leave' },
  { key: 'payroll.view', label: 'View payroll' },
  { key: 'payroll.generate', label: 'Generate payroll' },
  { key: 'payroll.approve.hr', label: 'Approve payroll (HR)' },
  { key: 'payroll.approve.ceo', label: 'Approve payroll (CEO)' },
  { key: 'recruitment.read', label: 'View recruitment' },
  { key: 'recruitment.write', label: 'Manage recruitment' },
  { key: 'roles.manage', label: 'Manage roles' },
  { key: 'tenant.settings', label: 'Manage tenant settings' },
] as const;

async function seedCompany(tenantDs: DataSource, options: DemoSeederOptions) {
  const repo = tenantDs.getRepository(CompanySettings);
  const existing = await repo.find({ take: 1, order: { createdAt: 'ASC' } });
  const payload = {
    name: options.companyName ?? 'Demo Company',
    timezone: 'Asia/Karachi',
    fiscalYearStartMonth: 7,
    logoUrl: options.logoUrl ?? null,
    brandPrimary: options.brandPrimary ?? '#1ecf8a',
    brandSecondary: options.brandSecondary ?? '#149a66',
    themeMode: options.themeMode ?? 'dark',
  };

  if (!existing[0]) {
    await repo.save(repo.create(payload));
    return;
  }

  const row = existing[0];
  row.name = payload.name;
  row.logoUrl = payload.logoUrl;
  row.brandPrimary = payload.brandPrimary;
  row.brandSecondary = payload.brandSecondary;
  row.themeMode = payload.themeMode;
  await repo.save(row);
}

async function seedRbac(tenantDs: DataSource) {
  const permissionRepo = tenantDs.getRepository(Permission);
  const roleRepo = tenantDs.getRepository(Role);
  const rpRepo = tenantDs.getRepository(RolePermission);

  // Tenant-scoped permission library (dynamic rows). No role grants here.
  for (const item of STARTER_PERMISSION_DEFINITIONS) {
    if (!(await permissionRepo.findOne({ where: { key: item.key } }))) {
      await permissionRepo.save(
        permissionRepo.create({
          key: item.key,
          label: item.label,
          description: null,
        }),
      );
    }
  }

  // Migrate legacy tenant_admin → company_admin
  const legacy = await roleRepo.findOne({
    where: { key: LEGACY_TENANT_ADMIN_ROLE },
  });
  if (legacy) {
    legacy.key = COMPANY_ADMIN_ROLE;
    legacy.name = 'Company Admin';
    legacy.isSystem = true;
    await roleRepo.save(legacy);
  }

  for (const seed of TENANT_SYSTEM_ROLES) {
    let role = await roleRepo.findOne({ where: { key: seed.key } });
    if (!role) {
      role = await roleRepo.save(
        roleRepo.create({
          key: seed.key,
          name: seed.name,
          isSystem: true,
        }),
      );
    } else if (role.name !== seed.name || !role.isSystem) {
      role.name = seed.name;
      role.isSystem = true;
      role = await roleRepo.save(role);
    }

    if (seed.key === COMPANY_ADMIN_ROLE) {
      // Scope-based full access — do not store grant rows.
      await rpRepo.delete({ roleId: role.id });
    }
  }

  await ensureSystemRoleDefaultGrants(tenantDs);
}

/** Sync default permission grants onto HR / Manager / Employee system roles. */
async function ensureSystemRoleDefaultGrants(tenantDs: DataSource) {
  const permissionRepo = tenantDs.getRepository(Permission);
  const roleRepo = tenantDs.getRepository(Role);
  const rpRepo = tenantDs.getRepository(RolePermission);

  for (const [roleKey, permKeys] of Object.entries(
    SYSTEM_ROLE_DEFAULT_PERMISSIONS,
  )) {
    const role = await roleRepo.findOne({ where: { key: roleKey } });
    if (!role) continue;

    const desired = new Set(permKeys);
    const existing = await rpRepo.find({
      where: { roleId: role.id },
      relations: { permission: true },
    });
    const have = new Set(existing.map((l) => l.permission.key));

    for (const link of existing) {
      if (!desired.has(link.permission.key)) {
        await rpRepo.remove(link);
      }
    }

    for (const key of desired) {
      if (have.has(key)) continue;
      const perm = await permissionRepo.findOne({ where: { key } });
      if (!perm) continue;
      await rpRepo.save(
        rpRepo.create({ roleId: role.id, permissionId: perm.id }),
      );
    }
  }

  logger.log('System role default permissions synced (HR / Manager / Employee)');
}

async function seedAdminUser(masterDs: DataSource, options: DemoSeederOptions) {
  const userRepo = masterDs.getRepository(User);
  const email = options.adminEmail.toLowerCase();
  let user = await userRepo.findOne({ where: { email } });
  const passwordHash = await bcrypt.hash(options.adminPassword, 10);

  if (!user) {
    user = await userRepo.save(
      userRepo.create({
        email,
        fullName: 'Company Admin',
        passwordHash,
        isActive: true,
        isPlatformAdmin: false,
      }),
    );
  } else {
    user.passwordHash = passwordHash;
    user.fullName = user.fullName || 'Company Admin';
    user.isActive = true;
    user.isPlatformAdmin = false;
    user = await userRepo.save(user);
  }
  return user;
}

/**
 * Ensure Platform Super Admin exists with isPlatformAdmin=true and
 * **no** tenant memberships (support grants are the only path into tenant data).
 */
export async function ensurePlatformSuperAdmin(
  masterDs: DataSource,
  adminPassword: string,
) {
  const userRepo = masterDs.getRepository(User);
  const membershipRepo = masterDs.getRepository(TenantMembership);
  const email = 'superadmin@demo.com';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  let user = await userRepo.findOne({ where: { email } });
  if (!user) {
    user = await userRepo.save(
      userRepo.create({
        email,
        fullName: 'Super Admin',
        passwordHash,
        isActive: true,
        isPlatformAdmin: true,
      }),
    );
  } else {
    user.passwordHash = passwordHash;
    user.isActive = true;
    user.isPlatformAdmin = true;
    user = await userRepo.save(user);
  }

  // Revoke any legacy auto-memberships from earlier seeds.
  const memberships = await membershipRepo.find({ where: { userId: user.id } });
  for (const m of memberships) {
    if (m.status !== MembershipStatus.REVOKED) {
      m.status = MembershipStatus.REVOKED;
      await membershipRepo.save(m);
    }
  }

  return user;
}

async function seedAdminMembership(
  masterDs: DataSource,
  tenantDs: DataSource,
  tenantId: number,
  user: User,
) {
  const membershipRepo = masterDs.getRepository(TenantMembership);
  let membership = await membershipRepo.findOne({
    where: { userId: user.id, tenantId },
  });
  if (!membership) {
    membership = await membershipRepo.save(
      membershipRepo.create({
        userId: user.id,
        tenantId,
        status: MembershipStatus.ACTIVE,
      }),
    );
  } else if (membership.status !== MembershipStatus.ACTIVE) {
    membership.status = MembershipStatus.ACTIVE;
    membership = await membershipRepo.save(membership);
  }

  const role = await tenantDs
    .getRepository(Role)
    .findOne({ where: { key: COMPANY_ADMIN_ROLE } });
  if (role) {
    const mrRepo = tenantDs.getRepository(MembershipRole);
    if (
      !(await mrRepo.findOne({
        where: { membershipId: membership.id, roleId: role.id },
      }))
    ) {
      await mrRepo.save(
        mrRepo.create({
          membershipId: membership.id,
          userId: user.id,
          roleId: role.id,
        }),
      );
    }
  }

  return membership;
}

async function seedOrganization(tenantDs: DataSource) {
  const branchRepo = tenantDs.getRepository(Branch);
  const deptRepo = tenantDs.getRepository(Department);
  const desigRepo = tenantDs.getRepository(Designation);
  const typeRepo = tenantDs.getRepository(EmploymentType);
  const statusRepo = tenantDs.getRepository(EmploymentStatus);
  const docTypeRepo = tenantDs.getRepository(DocumentType);

  const ho = await upsertByCode(branchRepo, {
    code: 'HO-KHI',
    name: 'Head Office - Karachi',
    city: 'Karachi',
    isActive: true,
  });
  const lhr = await upsertByCode(branchRepo, {
    code: 'BR-LHR',
    name: 'Lahore Branch',
    city: 'Lahore',
    isActive: true,
  });

  const hr = await upsertByCode(deptRepo, {
    code: 'HR',
    name: 'Human Resources',
    branchId: ho.id,
    isActive: true,
  });
  const eng = await upsertByCode(deptRepo, {
    code: 'ENG',
    name: 'Engineering',
    branchId: ho.id,
    isActive: true,
  });
  const fin = await upsertByCode(deptRepo, {
    code: 'FIN',
    name: 'Finance',
    branchId: ho.id,
    isActive: true,
  });
  const sales = await upsertByCode(deptRepo, {
    code: 'SAL',
    name: 'Sales',
    branchId: lhr.id,
    isActive: true,
  });

  const ceo = await upsertByCode(desigRepo, {
    code: 'CEO',
    name: 'Chief Executive Officer',
    isActive: true,
  });
  const hrMgr = await upsertByCode(desigRepo, {
    code: 'HR-MGR',
    name: 'HR Manager',
    isActive: true,
  });
  const engLead = await upsertByCode(desigRepo, {
    code: 'ENG-LEAD',
    name: 'Engineering Lead',
    isActive: true,
  });
  const swe = await upsertByCode(desigRepo, {
    code: 'SWE',
    name: 'Software Engineer',
    isActive: true,
  });
  const acct = await upsertByCode(desigRepo, {
    code: 'ACCT',
    name: 'Accountant',
    isActive: true,
  });
  const salesExec = await upsertByCode(desigRepo, {
    code: 'SAL-EXE',
    name: 'Sales Executive',
    isActive: true,
  });

  const fullTime = await upsertByCode(typeRepo, {
    code: 'FULL_TIME',
    name: 'Full-time',
    isActive: true,
  });
  await upsertByCode(typeRepo, {
    code: 'CONTRACT',
    name: 'Contract',
    isActive: true,
  });
  await upsertByCode(typeRepo, {
    code: 'INTERN',
    name: 'Intern',
    isActive: true,
  });

  const active = await upsertByCode(statusRepo, {
    code: 'ACTIVE',
    name: 'Active',
    isActive: true,
  });
  await upsertByCode(statusRepo, {
    code: 'PROBATION',
    name: 'Probation',
    isActive: true,
  });
  await upsertByCode(statusRepo, {
    code: 'RESIGNED',
    name: 'Resigned',
    isActive: true,
  });

  async function upsertDocType(data: {
    code: string;
    name: string;
    isRequired: boolean;
  }) {
    const existing = await docTypeRepo.findOne({ where: { code: data.code } });
    if (existing) return existing;
    return docTypeRepo.save(docTypeRepo.create(data));
  }

  const cnicType = await upsertDocType({
    code: 'CNIC',
    name: 'CNIC / National ID',
    isRequired: true,
  });
  await upsertDocType({
    code: 'CONTRACT',
    name: 'Employment Contract',
    isRequired: true,
  });
  await upsertDocType({
    code: 'RESUME',
    name: 'Resume',
    isRequired: false,
  });

  return {
    ho,
    lhr,
    hr,
    eng,
    fin,
    sales,
    ceo,
    hrMgr,
    engLead,
    swe,
    acct,
    salesExec,
    fullTime,
    active,
    cnicType: cnicType as DocumentType,
  };
}

/**
 * Demo logins for each system role (idempotent — safe on every boot).
 * Password for all: admin
 */
async function ensureDemoRoleUsers(
  tenantDs: DataSource,
  masterDs: DataSource,
  tenantId: number,
) {
  const userRepo = masterDs.getRepository(User);
  const membershipRepo = masterDs.getRepository(TenantMembership);
  const roleRepo = tenantDs.getRepository(Role);
  const mrRepo = tenantDs.getRepository(MembershipRole);
  const employeeRepo = tenantDs.getRepository(Employee);
  const passwordHash = await bcrypt.hash('admin', 10);

  const demos: Array<{
    email: string;
    fullName: string;
    roleKey: string;
    employeeEmail?: string;
  }> = [
    {
      email: 'aisha.khan@demo.com',
      fullName: 'Aisha Khan',
      roleKey: HR_MANAGER_ROLE,
      employeeEmail: 'aisha.khan@demo.com',
    },
    {
      email: 'sara.malik@demo.com',
      fullName: 'Sara Malik',
      roleKey: MANAGER_ROLE,
      employeeEmail: 'sara.malik@demo.com',
    },
    {
      email: 'bilal.ahmed@demo.com',
      fullName: 'Bilal Ahmed',
      roleKey: EMPLOYEE_ROLE,
      employeeEmail: 'bilal.ahmed@demo.com',
    },
  ];

  for (const demo of demos) {
    const role = await roleRepo.findOne({ where: { key: demo.roleKey } });
    let user = await userRepo.findOne({ where: { email: demo.email } });
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          email: demo.email,
          fullName: demo.fullName,
          passwordHash,
          isActive: true,
          isPlatformAdmin: false,
        }),
      );
    }

    let membership = await membershipRepo.findOne({
      where: { userId: user.id, tenantId },
    });
    if (!membership) {
      membership = await membershipRepo.save(
        membershipRepo.create({
          userId: user.id,
          tenantId,
          status: MembershipStatus.ACTIVE,
        }),
      );
    } else if (membership.status !== MembershipStatus.ACTIVE) {
      membership.status = MembershipStatus.ACTIVE;
      await membershipRepo.save(membership);
    }

    if (role) {
      const existing = await mrRepo.findOne({
        where: { membershipId: membership.id, roleId: role.id },
      });
      if (!existing) {
        await mrRepo.save(
          mrRepo.create({
            membershipId: membership.id,
            userId: user.id,
            roleId: role.id,
          }),
        );
      }
    }

    if (demo.employeeEmail) {
      const emp = await employeeRepo.findOne({
        where: { email: demo.employeeEmail },
      });
      if (emp && emp.userId !== user.id) {
        emp.userId = user.id;
        await employeeRepo.save(emp);
      }
    }
  }

  logger.log(
    'Demo role users ready: aisha (HR), sara (Manager), bilal (Employee)',
  );
}

async function seedEmployees(
  tenantDs: DataSource,
  masterDs: DataSource,
  tenantId: number,
  org: Awaited<ReturnType<typeof seedOrganization>>,
  adminUserId: number,
) {
  const employeeRepo = tenantDs.getRepository(Employee);
  if ((await employeeRepo.count()) > 0) {
    logger.log('Employees already seeded — skipping dummy employees');
    return;
  }

  const historyRepo = tenantDs.getRepository(EmploymentHistory);
  const docRepo = tenantDs.getRepository(EmployeeDocument);
  const userRepo = masterDs.getRepository(User);
  const passwordHash = await bcrypt.hash('admin', 10);

  async function stubUser(email: string, fullName: string) {
    let user = await userRepo.findOne({ where: { email } });
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          email,
          fullName,
          passwordHash,
          isActive: true,
          isPlatformAdmin: false,
        }),
      );
    }
    return user;
  }

  // ensureDemoRoleUsers (after this) assigns roles/memberships.
  const aisha = await stubUser('aisha.khan@demo.com', 'Aisha Khan');
  const bilal = await stubUser('bilal.ahmed@demo.com', 'Bilal Ahmed');
  const sara = await stubUser('sara.malik@demo.com', 'Sara Malik');

  const ceoEmp = await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-001',
      firstName: 'Omar',
      lastName: 'Siddiqui',
      email: 'omar.siddiqui@demo.com',
      phone: '+92-300-1111111',
      userId: adminUserId,
      branchId: org.ho.id,
      departmentId: org.hr.id,
      designationId: org.ceo.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: null,
      dateOfJoining: '2018-01-15',
      basicSalary: '450000.00',
      cnic: '42101-1111111-1',
    }),
  );

  const hrEmp = await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-002',
      firstName: 'Aisha',
      lastName: 'Khan',
      email: 'aisha.khan@demo.com',
      phone: '+92-300-2222222',
      userId: aisha.id,
      branchId: org.ho.id,
      departmentId: org.hr.id,
      designationId: org.hrMgr.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: ceoEmp.id,
      dateOfJoining: '2019-03-01',
      basicSalary: '220000.00',
      cnic: '42101-2222222-2',
    }),
  );

  const engLeadEmp = await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-003',
      firstName: 'Bilal',
      lastName: 'Ahmed',
      email: 'bilal.ahmed@demo.com',
      phone: '+92-300-3333333',
      userId: bilal.id,
      branchId: org.ho.id,
      departmentId: org.eng.id,
      designationId: org.engLead.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: ceoEmp.id,
      dateOfJoining: '2020-06-10',
      basicSalary: '280000.00',
      cnic: '42101-3333333-3',
    }),
  );

  await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-004',
      firstName: 'Sara',
      lastName: 'Malik',
      email: 'sara.malik@demo.com',
      phone: '+92-300-4444444',
      userId: sara.id,
      branchId: org.ho.id,
      departmentId: org.eng.id,
      designationId: org.swe.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: engLeadEmp.id,
      dateOfJoining: '2022-02-01',
      basicSalary: '160000.00',
      cnic: '42101-4444444-4',
    }),
  );

  await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-005',
      firstName: 'Hassan',
      lastName: 'Raza',
      email: 'hassan.raza@demo.com',
      phone: '+92-300-5555555',
      userId: null,
      branchId: org.ho.id,
      departmentId: org.eng.id,
      designationId: org.swe.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: engLeadEmp.id,
      dateOfJoining: '2022-02-01',
      basicSalary: '155000.00',
      cnic: '42101-5555555-5',
    }),
  );

  await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-006',
      firstName: 'Nida',
      lastName: 'Farooq',
      email: 'nida.farooq@demo.com',
      phone: '+92-300-6666666',
      userId: null,
      branchId: org.ho.id,
      departmentId: org.fin.id,
      designationId: org.acct.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: ceoEmp.id,
      dateOfJoining: '2021-09-20',
      basicSalary: '140000.00',
      cnic: '42101-6666666-6',
    }),
  );

  await employeeRepo.save(
    employeeRepo.create({
      employeeCode: 'EMP-007',
      firstName: 'Usman',
      lastName: 'Ali',
      email: 'usman.ali@demo.com',
      phone: '+92-300-7777777',
      userId: null,
      branchId: org.lhr.id,
      departmentId: org.sales.id,
      designationId: org.salesExec.id,
      employmentTypeId: org.fullTime.id,
      employmentStatusId: org.active.id,
      reportingToId: hrEmp.id,
      dateOfJoining: '2023-01-05',
      basicSalary: '120000.00',
      cnic: '35202-7777777-7',
    }),
  );

  await historyRepo.save([
    historyRepo.create({
      employeeId: engLeadEmp.id,
      title: 'Promoted to Engineering Lead',
      notes: 'Took ownership of product engineering squad.',
      effectiveFrom: '2023-07-01',
      effectiveTo: null,
    }),
    historyRepo.create({
      employeeId: hrEmp.id,
      title: 'Joined as HR Manager',
      notes: 'Hired to build HR operations.',
      effectiveFrom: '2019-03-01',
      effectiveTo: null,
    }),
  ]);

  await docRepo.save(
    docRepo.create({
      employeeId: ceoEmp.id,
      documentTypeId: org.cnicType.id,
      fileName: 'omar-cnic.pdf',
      storageKey: `demo/employees/${ceoEmp.id}/cnic.pdf`,
    }),
  );

  logger.log('Seeded 7 employees + history/documents');
}

/** Default shifts, holidays, leave types, and Jul–Jun leave session. */
async function seedAttendanceLeaveDefaults(tenantDs: DataSource) {
  const shiftRepo = tenantDs.getRepository(Shift);
  const assignmentRepo = tenantDs.getRepository(ShiftAssignment);
  const holidayRepo = tenantDs.getRepository(Holiday);
  const leaveTypeRepo = tenantDs.getRepository(LeaveType);
  const employeeRepo = tenantDs.getRepository(Employee);

  const general = await upsertByCode(shiftRepo, {
    code: 'GEN',
    name: 'General',
    startTime: '09:00:00',
    endTime: '18:00:00',
    graceMinutes: 15,
    isOvernight: false,
    isActive: true,
  });
  await upsertByCode(shiftRepo, {
    code: 'MORNING',
    name: 'Morning',
    startTime: '08:00:00',
    endTime: '16:00:00',
    graceMinutes: 10,
    isOvernight: false,
    isActive: true,
  });
  await upsertByCode(shiftRepo, {
    code: 'NIGHT',
    name: 'Night',
    startTime: '22:00:00',
    endTime: '06:00:00',
    graceMinutes: 15,
    isOvernight: true,
    isActive: true,
  });

  const year = new Date().getFullYear();
  const holidaySeeds = [
    { holidayDate: `${year}-08-14`, name: 'Independence Day', isOptional: false },
    { holidayDate: `${year}-12-25`, name: 'Christmas Day', isOptional: false },
  ];
  for (const h of holidaySeeds) {
    const existing = await holidayRepo.findOne({
      where: { holidayDate: h.holidayDate },
    });
    if (!existing) await holidayRepo.save(holidayRepo.create(h));
  }

  const employees = await employeeRepo.find({ select: ['id'] });
  const today = new Date().toISOString().slice(0, 10);
  for (const emp of employees) {
    const has = await assignmentRepo.findOne({
      where: { employeeId: emp.id },
    });
    if (!has) {
      await assignmentRepo.save(
        assignmentRepo.create({
          employeeId: emp.id,
          shiftId: general.id,
          effectiveFrom: today,
          effectiveTo: null,
        }),
      );
    }
  }

  await upsertByCode(leaveTypeRepo, {
    code: 'AL',
    name: 'Annual Leave',
    isPaid: true,
    allowHalfDay: true,
    maxDaysPerYear: '14',
    isActive: true,
  });
  await upsertByCode(leaveTypeRepo, {
    code: 'SL',
    name: 'Sick Leave',
    isPaid: true,
    allowHalfDay: true,
    maxDaysPerYear: '10',
    isActive: true,
  });
  await upsertByCode(leaveTypeRepo, {
    code: 'CL',
    name: 'Casual Leave',
    isPaid: true,
    allowHalfDay: true,
    maxDaysPerYear: '8',
    isActive: true,
  });
  await upsertByCode(leaveTypeRepo, {
    code: 'UL',
    name: 'Unpaid Leave',
    isPaid: false,
    allowHalfDay: true,
    maxDaysPerYear: '30',
    isActive: true,
  });

  logger.log(`Attendance/leave defaults ready (shift=${general.code})`);
}

/** Default tax slabs + base compensation for employees missing one. */
async function seedPayrollDefaults(tenantDs: DataSource) {
  const taxRepo = tenantDs.getRepository(TaxSlab);
  if ((await taxRepo.count()) === 0) {
    await taxRepo.save([
      taxRepo.create({
        name: 'Nil',
        fromCents: 0,
        toCents: 100_000,
        rateBps: 0,
        sortOrder: 1,
      }),
      taxRepo.create({
        name: '5%',
        fromCents: 100_000,
        toCents: 300_000,
        rateBps: 500,
        sortOrder: 2,
      }),
      taxRepo.create({
        name: '10%',
        fromCents: 300_000,
        toCents: null,
        rateBps: 1000,
        sortOrder: 3,
      }),
    ]);
  }

  const empRepo = tenantDs.getRepository(Employee);
  const compRepo = tenantDs.getRepository(Compensation);
  const employees = await empRepo.find();
  const today = new Date().toISOString().slice(0, 10);
  for (const emp of employees) {
    const existing = await compRepo.findOne({
      where: { employeeId: emp.id },
    });
    if (existing) continue;
    await compRepo.save(
      compRepo.create({
        employeeId: emp.id,
        baseCents: 500_000,
        currency: 'USD',
        effectiveFrom: today,
        effectiveTo: null,
      }),
    );
  }
  logger.log('Payroll defaults ready (tax slabs + base compensations)');
}
