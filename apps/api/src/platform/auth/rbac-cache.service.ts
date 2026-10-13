import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';

export type CachedRbac = {
  roles: string[];
  permissions: string[];
  isPlatformAdmin: boolean;
};

/**
 * Versioned RBAC cache.
 * Invalidate by bumping tenant version — no key scans required.
 */
@Injectable()
export class RbacCacheService {
  private readonly logger = new Logger(RbacCacheService.name);
  private readonly memory = new Map<string, { ver: string; value: CachedRbac }>();
  private readonly memoryVersions = new Map<number, number>();
  private readonly ttlSeconds = 60;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  async get(tenantId: number, userId: number): Promise<CachedRbac | null> {
    const ver = await this.version(tenantId);
    const key = this.entryKey(tenantId, userId, ver);

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) return JSON.parse(raw) as CachedRbac;
      } catch (err) {
        this.logger.warn(`Redis get failed: ${(err as Error).message}`);
      }
    }

    const local = this.memory.get(key);
    return local?.value ?? null;
  }

  async set(tenantId: number, userId: number, value: CachedRbac): Promise<void> {
    const ver = await this.version(tenantId);
    const key = this.entryKey(tenantId, userId, ver);
    this.memory.set(key, { ver, value });

    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
      } catch (err) {
        this.logger.warn(`Redis set failed: ${(err as Error).message}`);
      }
    }
  }

  async invalidateTenant(tenantId: number): Promise<void> {
    const next = (this.memoryVersions.get(tenantId) ?? 0) + 1;
    this.memoryVersions.set(tenantId, next);

    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(`rbac:${tenantId}:`)) this.memory.delete(key);
    }

    if (this.redis) {
      try {
        await this.redis.incr(this.versionKey(tenantId));
      } catch (err) {
        this.logger.warn(`Redis invalidate failed: ${(err as Error).message}`);
      }
    }
  }

  private async version(tenantId: number): Promise<string> {
    if (this.redis) {
      try {
        const v = await this.redis.get(this.versionKey(tenantId));
        if (v) return v;
        return '0';
      } catch {
        // fall through to memory
      }
    }
    return String(this.memoryVersions.get(tenantId) ?? 0);
  }

  private versionKey(tenantId: number) {
    return `rbac:ver:${tenantId}`;
  }

  private entryKey(tenantId: number, userId: number, ver: string) {
    return `rbac:${tenantId}:${userId}:v${ver}`;
  }
}
