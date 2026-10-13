import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  Gauge,
  Headphones,
  LayoutDashboard,
  Package,
  Settings2,
  Shield,
  ToggleLeft,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  /** Master-DB feature entitlement key. */
  feature?: string;
};

export type NavSection = { title: string; items: NavItem[] };

export const workspaceNav: NavSection[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'HRM',
    items: [
      {
        to: '/organization',
        label: 'Organization',
        icon: BriefcaseBusiness,
        feature: 'hrm.employees',
      },
      {
        to: '/employees',
        label: 'Employees',
        icon: Users,
        feature: 'hrm.employees',
      },
      {
        to: '/attendance',
        label: 'Attendance',
        icon: CalendarDays,
        feature: 'hrm.attendance',
      },
      {
        to: '/leaves',
        label: 'Leaves',
        icon: CalendarRange,
        feature: 'hrm.leave',
      },
      {
        to: '/payroll',
        label: 'Payroll',
        icon: Wallet,
        feature: 'hrm.payroll',
      },
      {
        to: '/recruitment',
        label: 'Recruitment',
        icon: BriefcaseBusiness,
        feature: 'hrm.recruitment',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        to: '/roles',
        label: 'Roles & Access',
        icon: Shield,
        permission: 'roles.manage',
      },
      {
        to: '/settings',
        label: 'Company Settings',
        icon: Settings2,
        permission: 'tenant.settings',
      },
      {
        to: '/support-inbox',
        label: 'Support requests',
        icon: Headphones,
        permission: 'tenant.settings',
      },
    ],
  },
];

export const platformNav: NavSection[] = [
  {
    title: 'Platform',
    items: [
      { to: '/platform', label: 'Overview', icon: Gauge },
      { to: '/platform/tenants', label: 'Tenants', icon: Building2 },
      { to: '/platform/plans', label: 'Plans & subscriptions', icon: CreditCard },
      { to: '/platform/catalog', label: 'Module catalog', icon: Package },
      {
        to: '/platform/features',
        label: 'Tenant features',
        icon: ToggleLeft,
      },
      { to: '/platform/support', label: 'Support access', icon: Headphones },
      { to: '/platform/audit', label: 'Audit logs', icon: ClipboardList },
      { to: '/platform/health', label: 'System health', icon: Activity },
      { to: '/platform/settings', label: 'Platform settings', icon: BookOpen },
    ],
  },
];

const titles: [string, string][] = [
  ['/platform/tenants', 'Tenants'],
  ['/platform/plans', 'Plans & subscriptions'],
  ['/platform/catalog', 'Module catalog'],
  ['/platform/features', 'Tenant features'],
  ['/platform/support', 'Support access'],
  ['/platform/audit', 'Audit logs'],
  ['/platform/health', 'System health'],
  ['/platform/settings', 'Platform settings'],
  ['/platform', 'Platform overview'],
  ['/support-inbox', 'Support requests'],
  ['/employees', 'Employees'],
  ['/organization', 'Organization'],
  ['/attendance', 'Attendance'],
  ['/leaves', 'Leaves'],
  ['/payroll', 'Payroll'],
  ['/recruitment', 'Recruitment'],
  ['/roles', 'Roles & Access'],
  ['/settings', 'Company Settings'],
];

export function pageTitle(pathname: string) {
  if (pathname === '/') return 'Dashboard';
  return titles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? '';
}
