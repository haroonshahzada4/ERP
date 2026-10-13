import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createTenantDataSource,
  TenantDbConnectionInput,
} from './tenant-data-source.factory';

type CachedTenantPool = {
  dataSource: DataSource;
  lastUsedAt: number;
};

const MAX_CACHED_TENANTS = 20;
const IDLE_TTL_MS = 10 * 60 * 1000;

/**
 * Bounded cache of tenant DataSources.
 * Never mutates a global connection URL — each tenant gets its own DataSource.
 */
@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly pools = new Map<number, CachedTenantPool>();

  async getOrCreate(
    tenantId: number,
    input: TenantDbConnectionInput,
  ): Promise<DataSource> {
    const existing = this.pools.get(tenantId);
    if (existing?.dataSource.isInitialized) {
      existing.lastUsedAt = Date.now();
      return existing.dataSource;
    }

    await this.evictIdle();

    if (this.pools.size >= MAX_CACHED_TENANTS) {
      await this.evictOldest();
    }

    const dataSource = createTenantDataSource(input);
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    this.pools.set(tenantId, { dataSource, lastUsedAt: Date.now() });
    this.logger.log(`Tenant DataSource ready: ${tenantId} -> ${input.database}`);
    return dataSource;
  }

  async ping(tenantId: number): Promise<boolean> {
    const cached = this.pools.get(tenantId);
    if (!cached?.dataSource.isInitialized) {
      return false;
    }
    await cached.dataSource.query('SELECT 1');
    cached.lastUsedAt = Date.now();
    return true;
  }

  getCachedTenantIds(): number[] {
    return [...this.pools.keys()];
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.pools.values()].map(async ({ dataSource }) => {
        if (dataSource.isInitialized) {
          await dataSource.destroy();
        }
      }),
    );
    this.pools.clear();
  }

  private async evictIdle() {
    const now = Date.now();
    for (const [tenantId, pool] of this.pools) {
      if (now - pool.lastUsedAt > IDLE_TTL_MS) {
        if (pool.dataSource.isInitialized) {
          await pool.dataSource.destroy();
        }
        this.pools.delete(tenantId);
        this.logger.debug(`Evicted idle tenant pool ${tenantId}`);
      }
    }
  }

  private async evictOldest() {
    let oldestId: number | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [tenantId, pool] of this.pools) {
      if (pool.lastUsedAt < oldestAt) {
        oldestAt = pool.lastUsedAt;
        oldestId = tenantId;
      }
    }
    if (oldestId === undefined) return;
    const pool = this.pools.get(oldestId);
    if (pool?.dataSource.isInitialized) {
      await pool.dataSource.destroy();
    }
    this.pools.delete(oldestId);
  }
}
