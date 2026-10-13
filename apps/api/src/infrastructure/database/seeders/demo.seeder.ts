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
  LEGACY_TENANT_ADMIN_ROLE,
  TENANT_SYSTEM_ROLES,
} from '../../../modules/access/system-roles';
import { Holiday } from '../../../modules/hrm/attendance/entities/holiday.entity';
import { ShiftAssignment } from '../../../modules/hrm/attendance/entities/shift-assignment.entity';
import { Shift } from '../../../modules/hrm/attendance/entities/shift.entity';
import { EmployeeDocument } from '../../../modules/hrm/employees/entities/employee-document.entity';
import { Employee } from '../../../modules/hrm/employees/entities/employee.entity';
import { EmploymentHistory } from '../../../modules/hrm/employees/entities/employment-history.entity';
import { LeaveType } from '../../../modules/hrm/leaves/entities/leave-type.entity';
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
  if (options.seedSuperAdmin !== false) {
    await seedSuperAdminUser(masterDs, options);
  }
  const membership = await seedAdminMembership(
    masterDs,
    tenantDs,
    options.tenantId,
    adminUser,
  );
  const org = await seedOrganization(tenantDs);
  if (options.seedEmployees !== false) {
    await seedEmployees(tenantDs, masterDs, options.tenantId, org, adminUser.id);
  }
  await seedAttendanceLeaveDefaults(tenantDs);

  logger.log(
    `Tenant seed complete (membership=${membership.id}, company=${options.companyName ?? 'Demo'})`,
  );
}

/** @deprecated use seedTenantData */
export const seedDemoData = seedTenantData;

/**
 * Starter permission *definitions* for a new tenant library.
 * Not role grants — Company Admin assigns these to HR/Manager/Employee.
 */
const STARTER_PERMISSION_DEFINITIONS = [
  { key: 'employee.read', label: 'View employees' },
  { key: 'employee.write', label: 'Manage employees' },
  { key: 'attendance.read', label: 'View attendance' },
  { key: 'attendance.approve', label: 'Approve attendance' },
  { key: 'leave.read', label: 'View leave' },
  { key: 'leave.approve', label: 'Approve leave' },
  { key: 'payroll.view', label: 'View payroll' },
  { key: 'payroll.generate', label: 'Generate payroll' },
  { key: 'payroll.approve.hr', label: 'Approve payroll (HR)' },
  { key: 'payroll.approve.ceo', label: 'Approve payroll (CEO)' },
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
    const isNew = !role;
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
      continue;
    }

    // New HR / Manager / Employee roles start with zero grants.
    // Existing custom grants assigned by Company Admin are preserved.
    if (isNew) {
      await rpRepo.delete({ roleId: role.id });
    }
  }

  // One-time strip of previously hardcoded default grants (legacy catalog seeds).
  await stripLegacyDefaultGrants(tenantDs);
}

async function stripLegacyDefaultGrants(tenantDs: DataSource) {
  const roleRepo = tenantDs.getRepository(Role);
  const rpRepo = tenantDs.getRepository(RolePermission);

  const legacyEmployeeKeys = [
    'employee.read',
    'attendance.read',
    'leave.read',
  ];
  const legacyHrKeys = [
    'employee.read',
    'employee.write',
    'attendance.read',
    'attendance.approve',
    'leave.read',
    'leave.approve',
    'payroll.view',
    'payroll.generate',
    'payroll.approve.hr',
    'roles.manage',
    'tenant.settings',
  ];

  async function clearIfExactLegacy(roleKey: string, keys: string[]) {
    const role = await roleRepo.findOne({ where: { key: roleKey } });
    if (!role) return;
    const links = await rpRepo.find({
      where: { roleId: role.id },
      relations: { permission: true },
    });
    if (links.length === 0) return;
    const current = new Set(links.map((l) => l.permission.key));
    if (current.size !== keys.length) return;
    if (!keys.every((k) => current.has(k))) return;
    await rpRepo.remove(links);
    logger.log(`Cleared legacy default grants from role ${roleKey}`);
  }

  await clearIfExactLegacy('employee', legacyEmployeeKeys);
  await clearIfExactLegacy('hr_manager', legacyHrKeys);
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

async function seedSuperAdminUser(
  masterDs: DataSource,
  options: DemoSeederOptions,
) {
  const userRepo = masterDs.getRepository(User);
  const membershipRepo = masterDs.getRepository(TenantMembership);
  const email = 'superadmin@demo.com';
  const passwordHash = await bcrypt.hash(options.adminPassword, 10);

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

  let membership = await membershipRepo.findOne({
    where: { userId: user.id, tenantId: options.tenantId },
  });
  if (!membership) {
    await membershipRepo.save(
      membershipRepo.create({
        userId: user.id,
        tenantId: options.tenantId,
        status: MembershipStatus.ACTIVE,
      }),
    );
  } else if (membership.status !== MembershipStatus.ACTIVE) {
    membership.status = MembershipStatus.ACTIVE;
    await membershipRepo.save(membership);
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
  const membershipRepo = masterDs.getRepository(TenantMembership);
  const roleRepo = tenantDs.getRepository(Role);
  const mrRepo = tenantDs.getRepository(MembershipRole);

  const hrRole = await roleRepo.findOne({ where: { key: 'hr_manager' } });
  const empRole = await roleRepo.findOne({ where: { key: 'employee' } });

  const passwordHash = await bcrypt.hash('admin', 10);

  async function ensureLinkedUser(
    email: string,
    fullName: string,
    role: Role | null,
  ) {
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
    return user;
  }

  const aishaUser = await ensureLinkedUser(
    'aisha.khan@demo.com',
    'Aisha Khan',
    hrRole,
  );
  const bilalUser = await ensureLinkedUser(
    'bilal.ahmed@demo.com',
    'Bilal Ahmed',
    empRole,
  );

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
      userId: aishaUser.id,
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
      userId: bilalUser.id,
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

  const engineers = [
    {
      code: 'EMP-004',
      first: 'Sara',
      last: 'Malik',
      email: 'sara.malik@demo.com',
      phone: '+92-300-4444444',
      salary: '160000.00',
      cnic: '42101-4444444-4',
    },
    {
      code: 'EMP-005',
      first: 'Hassan',
      last: 'Raza',
      email: 'hassan.raza@demo.com',
      phone: '+92-300-5555555',
      salary: '155000.00',
      cnic: '42101-5555555-5',
    },
  ];

  for (const row of engineers) {
    await employeeRepo.save(
      employeeRepo.create({
        employeeCode: row.code,
        firstName: row.first,
        lastName: row.last,
        email: row.email,
        phone: row.phone,
        userId: null,
        branchId: org.ho.id,
        departmentId: org.eng.id,
        designationId: org.swe.id,
        employmentTypeId: org.fullTime.id,
        employmentStatusId: org.active.id,
        reportingToId: engLeadEmp.id,
        dateOfJoining: '2022-02-01',
        basicSalary: row.salary,
        cnic: row.cnic,
      }),
    );
  }

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
