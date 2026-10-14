/** Platform-level virtual role (User.isPlatformAdmin). */
export const SUPER_ADMIN_ROLE = 'super_admin';

/** Tenant-scoped system roles. Only company_admin has implicit full access. */
export const COMPANY_ADMIN_ROLE = 'company_admin';

export const HR_MANAGER_ROLE = 'hr_manager';
export const MANAGER_ROLE = 'manager';
export const EMPLOYEE_ROLE = 'employee';

export const TENANT_SYSTEM_ROLES = [
  { key: COMPANY_ADMIN_ROLE, name: 'Company Admin' },
  { key: HR_MANAGER_ROLE, name: 'HR' },
  { key: MANAGER_ROLE, name: 'Manager' },
  { key: EMPLOYEE_ROLE, name: 'Employee' },
] as const;

/**
 * No hardcoded grants for HR / Manager / Employee.
 * Only Company Admin has implicit full tenant access (`tenant:*`).
 * All other roles receive permissions only via dynamic RBAC assignment.
 */
export const SYSTEM_ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {};

/** Legacy key migrated to company_admin on seed. */
export const LEGACY_TENANT_ADMIN_ROLE = 'tenant_admin';

/**
 * Wildcards:
 * - `platform:*` = Super Admin (platform administration only — NOT tenant data)
 * - `tenant:*` = Company Admin (all RBAC permissions inside current tenant)
 * - `*` = legacy full wildcard (treated as platform-only going forward)
 */
export const FULL_ACCESS_PERMISSION = '*';
export const PLATFORM_FULL_ACCESS_PERMISSION = 'platform:*';
export const TENANT_FULL_ACCESS_PERMISSION = 'tenant:*';

export const PLATFORM_PERMISSION_KEYS = [
  PLATFORM_FULL_ACCESS_PERMISSION,
  'platform.tenants',
  'platform.plans',
  'platform.subscriptions',
  'platform.features',
  'platform.audit',
  'platform.support',
  'platform.settings',
  'platform.analytics',
] as const;

export function isCompanyAdminRole(roleKey: string) {
  return roleKey === COMPANY_ADMIN_ROLE || roleKey === LEGACY_TENANT_ADMIN_ROLE;
}

export function isPlatformPermissionKey(key: string) {
  return (
    key === FULL_ACCESS_PERMISSION ||
    key === PLATFORM_FULL_ACCESS_PERMISSION ||
    key.startsWith('platform.')
  );
}

/** Platform Super Admin / platform:* — never grants tenant data access by itself. */
export function hasPlatformAccess(input: {
  permissions?: string[];
  roles?: string[];
  isPlatformAdmin?: boolean;
}) {
  if (input.isPlatformAdmin) return true;
  if (input.roles?.includes(SUPER_ADMIN_ROLE)) return true;
  if (input.permissions?.includes(PLATFORM_FULL_ACCESS_PERMISSION)) return true;
  if (input.permissions?.includes(FULL_ACCESS_PERMISSION)) return true;
  return false;
}

/** Company Admin / tenant:* within the current tenant. */
export function hasTenantFullAccess(input: {
  permissions?: string[];
  roles?: string[];
}) {
  if (input.permissions?.includes(TENANT_FULL_ACCESS_PERMISSION)) return true;
  if (input.roles?.some(isCompanyAdminRole)) return true;
  return false;
}

/** @deprecated Use hasPlatformAccess — `*` no longer implies tenant data access. */
export function hasFullAccess(input: {
  permissions?: string[];
  roles?: string[];
  isPlatformAdmin?: boolean;
}) {
  return hasPlatformAccess(input);
}

export function hasPermission(
  input: {
    permissions?: string[];
    roles?: string[];
    isPlatformAdmin?: boolean;
  },
  permissionKey: string,
) {
  if (isPlatformPermissionKey(permissionKey)) {
    return (
      hasPlatformAccess(input) || !!input.permissions?.includes(permissionKey)
    );
  }
  // Tenant-scoped permission — platform admin does NOT auto-pass.
  if (hasTenantFullAccess(input)) return true;
  return !!input.permissions?.includes(permissionKey);
}
