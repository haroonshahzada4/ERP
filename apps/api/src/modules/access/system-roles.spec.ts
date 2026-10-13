import {
  hasPermission,
  hasPlatformAccess,
  hasTenantFullAccess,
  PLATFORM_FULL_ACCESS_PERMISSION,
  TENANT_FULL_ACCESS_PERMISSION,
} from './system-roles';

describe('system-roles wildcards', () => {
  it('platform:* does not grant tenant data permissions', () => {
    const platformAdmin = {
      isPlatformAdmin: true,
      permissions: [PLATFORM_FULL_ACCESS_PERMISSION],
      roles: ['super_admin'],
    };
    expect(hasPlatformAccess(platformAdmin)).toBe(true);
    expect(hasPermission(platformAdmin, 'platform.tenants')).toBe(true);
    expect(hasPermission(platformAdmin, 'employee.read')).toBe(false);
    expect(hasPermission(platformAdmin, 'payroll.view')).toBe(false);
    expect(hasTenantFullAccess(platformAdmin)).toBe(false);
  });

  it('tenant:* grants tenant permissions but not platform keys alone', () => {
    const companyAdmin = {
      permissions: [TENANT_FULL_ACCESS_PERMISSION],
      roles: ['company_admin'],
    };
    expect(hasPermission(companyAdmin, 'employee.read')).toBe(true);
    expect(hasPermission(companyAdmin, 'roles.manage')).toBe(true);
    expect(hasPlatformAccess(companyAdmin)).toBe(false);
  });

  it('HR with only assigned grants has no defaults', () => {
    const hr = { permissions: ['employee.read'], roles: ['hr_manager'] };
    expect(hasPermission(hr, 'employee.read')).toBe(true);
    expect(hasPermission(hr, 'employee.write')).toBe(false);
    expect(hasPermission(hr, 'payroll.view')).toBe(false);
  });

  it('support-style grant can add temporary tenant permissions for platform admin', () => {
    const withSupport = {
      isPlatformAdmin: true,
      permissions: [PLATFORM_FULL_ACCESS_PERMISSION, 'employee.read'],
      roles: ['super_admin'],
    };
    expect(hasPermission(withSupport, 'employee.read')).toBe(true);
    expect(hasPermission(withSupport, 'employee.write')).toBe(false);
  });
});
