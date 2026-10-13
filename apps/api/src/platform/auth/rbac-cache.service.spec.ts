import { RbacCacheService } from './rbac-cache.service';

describe('RbacCacheService', () => {
  it('returns cached value until tenant invalidation', async () => {
    const cache = new RbacCacheService(null);
    const value = {
      roles: ['employee'],
      permissions: ['employee.read'],
      isPlatformAdmin: false,
    };

    await cache.set('t1', 'u1', value);
    await expect(cache.get('t1', 'u1')).resolves.toEqual(value);

    await cache.invalidateTenant('t1');
    await expect(cache.get('t1', 'u1')).resolves.toBeNull();
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
    await cache.set('t1', 'u1', {
      roles: ['hr_manager'],
      permissions: [],
      isPlatformAdmin: false,
    });
    expect(redis.set).toHaveBeenCalled();

    await cache.invalidateTenant('t1');
    expect(redis.incr).toHaveBeenCalledWith('rbac:ver:t1');
    await expect(cache.get('t1', 'u1')).resolves.toBeNull();
  });
});
