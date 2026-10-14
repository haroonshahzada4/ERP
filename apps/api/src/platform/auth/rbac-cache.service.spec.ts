import { RbacCacheService } from './rbac-cache.service';

describe('RbacCacheService', () => {
  it('returns cached value until tenant invalidation', async () => {
    const cache = new RbacCacheService(null);
    const value = {
      roles: ['employee'],
      permissions: ['employee.read'],
      isPlatformAdmin: false,
    };

    await cache.set(1, 1, value);
    await expect(cache.get(1, 1)).resolves.toEqual(value);

    await cache.invalidateTenant(1);
    await expect(cache.get(1, 1)).resolves.toBeNull();
  });

  it('uses redis when available and bumps version on invalidate', async () => {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      incr: jest.fn(async (k: string) => {
        const next = String(Number(store.get(k) ?? '0') + 1);
        store.set(k, next);
        return Number(next);
      }),
    };

    const cache = new RbacCacheService(redis as never);
    await cache.set(1, 1, {
      roles: ['hr_manager'],
      permissions: [],
      isPlatformAdmin: false,
    });
    expect(redis.set).toHaveBeenCalled();

    await cache.invalidateTenant(1);
    expect(redis.incr).toHaveBeenCalledWith('rbac:ver:1');
    await expect(cache.get(1, 1)).resolves.toBeNull();
  });
});
