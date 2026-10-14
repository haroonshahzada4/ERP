/**
 * Central SaaS module / feature catalog.
 * Keys are stable entitlement identifiers (Master DB).
 * RBAC permission keys remain separate in each tenant DB.
 */
export type CatalogFeatureDef = {
  key: string;
  name: string;
  description?: string;
  dependsOn?: string;
  /** Tenant RBAC permission keys typically required to use this feature. */
  permissions: string[];
};

export type CatalogModuleDef = {
  key: string;
  name: string;
  description?: string;
  features: CatalogFeatureDef[];
};

export const PLATFORM_CATALOG: CatalogModuleDef[] = [
  {
    key: 'hrm',
    name: 'HRM',
    description: 'Human resources management',
    features: [
      {
        key: 'hrm.employees',
        name: 'Employees',
        description: 'People records and organization structure',
        permissions: ['employee.read', 'employee.write'],
      },
      {
        key: 'hrm.attendance',
        name: 'Attendance',
        description: 'Shifts, check-in/out, timesheets, reports (no GPS)',
        dependsOn: 'hrm.employees',
        permissions: [
          'attendance.create',
          'attendance.read',
          'attendance.update',
          'attendance.import',
          'attendance.export',
          'attendance.report.read',
          'attendance.approve',
        ],
      },
      {
        key: 'hrm.leave',
        name: 'Leave',
        description: 'Leave types, balances, approvals',
        dependsOn: 'hrm.employees',
        permissions: ['leave.read', 'leave.approve'],
      },
      {
        key: 'hrm.payroll',
        name: 'Payroll',
        description: 'Compensation runs and payslips',
        dependsOn: 'hrm.employees',
        permissions: [
          'payroll.view',
          'payroll.generate',
          'payroll.approve.hr',
          'payroll.approve.ceo',
        ],
      },
      {
        key: 'hrm.recruitment',
        name: 'Recruitment',
        description: 'Jobs and applications',
        permissions: ['recruitment.read', 'recruitment.write'],
      },
    ],
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Accounting and payments',
    features: [
      {
        key: 'finance.accounts',
        name: 'Accounts',
        permissions: [],
      },
      {
        key: 'finance.payments',
        name: 'Payments',
        dependsOn: 'finance.accounts',
        permissions: [],
      },
      {
        key: 'finance.reports',
        name: 'Reports',
        dependsOn: 'finance.accounts',
        permissions: [],
      },
    ],
  },
  {
    key: 'crm',
    name: 'CRM',
    description: 'Customer relationship management',
    features: [
      { key: 'crm.leads', name: 'Leads', permissions: [] },
      { key: 'crm.customers', name: 'Customers', permissions: [] },
      {
        key: 'crm.deals',
        name: 'Deals',
        dependsOn: 'crm.customers',
        permissions: [],
      },
    ],
  },
];

export const PLAN_DEFINITIONS = [
  {
    slug: 'starter',
    name: 'Starter',
    description: 'Core HR for small teams',
    priceMonthlyCents: 4900,
    featureKeys: ['hrm.employees', 'hrm.attendance', 'hrm.leave'],
  },
  {
    slug: 'growth',
    name: 'Growth',
    description: 'HR with payroll',
    priceMonthlyCents: 9900,
    featureKeys: [
      'hrm.employees',
      'hrm.attendance',
      'hrm.leave',
      'hrm.payroll',
      'hrm.recruitment',
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Full suite',
    priceMonthlyCents: 24900,
    featureKeys: PLATFORM_CATALOG.flatMap((m) => m.features.map((f) => f.key)),
  },
] as const;

/** Default plan slug assigned when a tenant is provisioned. */
export const DEFAULT_PLAN_SLUG = 'growth';

/** Map feature key → permission keys for support-access grants. */
export function permissionsForFeatures(featureKeys: string[]) {
  const set = new Set<string>();
  for (const mod of PLATFORM_CATALOG) {
    for (const feat of mod.features) {
      if (featureKeys.includes(feat.key)) {
        for (const p of feat.permissions) set.add(p);
      }
    }
  }
  return [...set];
}
