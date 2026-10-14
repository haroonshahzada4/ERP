import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PermissionsGuard } from '../../platform/auth/guards/permissions.guard';
import { JwtStrategy } from '../../platform/auth/jwt.strategy';
import { MembershipStatus } from '../../platform/auth/entities/tenant-membership.entity';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';
import { tenantContextStorage } from './tenant-context';
import { TenantStatus } from '../../platform/tenants/entities/tenant.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Cross-tenant isolation matrix (unit-level).
 * Direct API / spoofed-header cases that must never leak Tenant B data.
 */
describe('Tenant isolation matrix', () => {
  const domains = { findOne: jest.fn() };
  const middleware = new TenantResolverMiddleware(
    domains as never,
    {
      get: (key: string) => (key === 'nodeEnv' ? 'development' : undefined),
    } as unknown as ConfigService,
  );

  it('rejects spoofed x-tenant-id header', async () => {
    await expect(
      middleware.use(
        {
          headers: { 'x-tenant-id': '2' },
          query: {},
          hostname: 'demo.localhost',
          originalUrl: '/api/v1/employees',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects Tenant A JWT on Tenant B host', async () => {
    const users = { findOne: jest.fn() };
    const sessions = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    };
    const memberships = { findOne: jest.fn() };
    const rbac = { getForUser: jest.fn() };
    const support = { getActiveGrant: jest.fn() };
    const strategy = new JwtStrategy(
      { getOrThrow: () => 'secret' } as unknown as ConfigService,
      users as never,
      sessions as never,
      memberships as never,
      rbac as never,
      support as never,
    );

    await expect(
      tenantContextStorage.run(
        { tenantId: 2, tenantSlug: 'horizon', host: 'horizon.localhost' },
        () =>
          strategy.validate({} as never, {
            sub: 1,
            tid: 1,
            sid: 1,
            typ: 'access',
            aud: 'tenant',
          }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown host (no verified domain)', async () => {
    domains.findOne.mockResolvedValue(null);
    await expect(
      middleware.use(
        {
          headers: {},
          query: {},
          hostname: 'evil.localhost',
          originalUrl: '/api/v1/employees',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects suspended tenant host', async () => {
    domains.findOne.mockResolvedValue({
      tenantId: 1,
      tenant: { slug: 'demo', status: TenantStatus.SUSPENDED },
    });
    await expect(
      middleware.use(
        {
          headers: {},
          query: {},
          hostname: 'demo.localhost',
          originalUrl: '/api/v1/employees',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it('platform token cannot read employees without support grant perms', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['employee.read'] : undefined,
      ),
    };
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              audience: 'platform',
              isPlatformAdmin: true,
              permissions: ['platform:*'],
              roles: ['super_admin'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).toThrow(ForbiddenException);
  });

  it('active membership path still works for matching host+tid', async () => {
    const users = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'a@demo.com',
        fullName: 'A',
        isActive: true,
        isPlatformAdmin: false,
      }),
    };
    const sessions = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        userId: 1,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    };
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        userId: 1,
        tenantId: 1,
        status: MembershipStatus.ACTIVE,
      }),
    };
    const rbac = {
      getForUser: jest.fn().mockResolvedValue({
        roles: ['company_admin'],
        permissions: ['tenant:*'],
        isPlatformAdmin: false,
      }),
    };
    const support = { getActiveGrant: jest.fn() };
    const strategy = new JwtStrategy(
      { getOrThrow: () => 'secret' } as unknown as ConfigService,
      users as never,
      sessions as never,
      memberships as never,
      rbac as never,
      support as never,
    );

    const user = await tenantContextStorage.run(
      { tenantId: 1, tenantSlug: 'demo', host: 'demo.localhost' },
      () =>
        strategy.validate({} as never, {
          sub: 1,
          tid: 1,
          sid: 1,
          typ: 'access',
          aud: 'tenant',
        }),
    );
    expect(user.tenantId).toBe(1);
    expect(user.audience).toBe('tenant');
  });
});
