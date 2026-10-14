import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus } from '../../platform/tenants/entities/tenant.entity';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';

describe('TenantResolverMiddleware security', () => {
  const domains = { findOne: jest.fn() };
  let middleware: TenantResolverMiddleware;

  beforeEach(() => {
    jest.resetAllMocks();
    middleware = new TenantResolverMiddleware(
      domains as never,
      {
        get: (key: string) => (key === 'nodeEnv' ? 'development' : undefined),
      } as unknown as ConfigService,
    );
  });

  it('rejects client-provided tenant id headers/query', async () => {
    await expect(
      middleware.use(
        {
          headers: { 'x-tenant-id': 'evil' },
          query: {},
          hostname: 'demo.localhost',
          originalUrl: '/api/v1/auth/login',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves tenant only via verified domain mapping', async () => {
    domains.findOne.mockResolvedValue({
      tenantId: 't1',
      tenant: { slug: 'demo', status: TenantStatus.ACTIVE },
    });
    const next = jest.fn();

    await middleware.use(
      {
        headers: {},
        query: {},
        hostname: 'demo.localhost',
        originalUrl: '/api/v1/auth/login',
      } as never,
      {} as never,
      next,
    );

    expect(domains.findOne).toHaveBeenCalledWith({
      where: { host: 'demo.localhost', isVerified: true },
      relations: { tenant: true },
    });
    expect(next).toHaveBeenCalled();
  });

  it('does not trust unknown X-Tenant-Host values (no domain row)', async () => {
    domains.findOne.mockResolvedValue(null);

    await expect(
      middleware.use(
        {
          headers: { 'x-tenant-host': 'evil.localhost' },
          query: {},
          hostname: 'localhost',
          originalUrl: '/api/v1/auth/login',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks X-Tenant-Host fallback in production on loopback', async () => {
    const prod = new TenantResolverMiddleware(
      domains as never,
      {
        get: (key: string) => (key === 'nodeEnv' ? 'production' : undefined),
      } as unknown as ConfigService,
    );

    await expect(
      prod.use(
        {
          headers: { 'x-tenant-host': 'demo.localhost' },
          query: {},
          hostname: 'localhost',
          originalUrl: '/api/v1/auth/login',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(domains.findOne).not.toHaveBeenCalled();
  });

  it('does not silently default to demo.localhost when host is missing', async () => {
    await expect(
      middleware.use(
        {
          headers: {},
          query: {},
          hostname: 'localhost',
          originalUrl: '/api/v1/auth/login',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(domains.findOne).not.toHaveBeenCalled();
  });

  it('rejects suspended and non-active tenants', async () => {
    domains.findOne.mockResolvedValue({
      tenantId: 't1',
      tenant: { slug: 'demo', status: TenantStatus.SUSPENDED },
    });

    await expect(
      middleware.use(
        {
          headers: {},
          query: {},
          hostname: 'demo.localhost',
          originalUrl: '/api/v1/auth/login',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('skips tenant resolution for platform Super Admin login', async () => {
    const next = jest.fn();
    await middleware.use(
      {
        headers: {},
        query: {},
        hostname: 'localhost',
        originalUrl: '/api/v1/auth/platform/login',
      } as never,
      {} as never,
      next,
    );
    expect(domains.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('skips tenant resolution for apex platform admin APIs', async () => {
    const next = jest.fn();
    await middleware.use(
      {
        headers: {},
        query: {},
        hostname: 'localhost',
        originalUrl: '/api/v1/platform/tenants',
      } as never,
      {} as never,
      next,
    );
    expect(domains.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('still requires host for platform current/* routes', async () => {
    await expect(
      middleware.use(
        {
          headers: {},
          query: {},
          hostname: 'localhost',
          originalUrl: '/api/v1/platform/tenants/current/branding',
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('skips tenant resolution for health probes', async () => {
    const next = jest.fn();
    await middleware.use(
      {
        headers: {},
        query: {},
        hostname: 'localhost',
        originalUrl: '/api/v1/health/ready',
      } as never,
      {} as never,
      next,
    );
    expect(domains.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
