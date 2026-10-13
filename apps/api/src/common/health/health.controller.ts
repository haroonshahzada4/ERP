import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantConnectionManager } from '../../infrastructure/database/tenant-connection.manager';
import { RedisHealthService } from '../../infrastructure/redis/redis-health.service';
import { Public } from '../decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly redisHealth: RedisHealthService,
    private readonly tenantConnections: TenantConnectionManager,
    @InjectDataSource() private readonly masterDs: DataSource,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return {
      status: 'ok',
      service: 'erp-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (master DB + demo tenant + redis)' })
  async ready() {
    const checks: Record<string, { status: string; detail?: string }> = {};

    try {
      await this.masterDs.query('SELECT 1');
      checks.masterDb = { status: 'ok' };
    } catch (error) {
      checks.masterDb = {
        status: 'error',
        detail: error instanceof Error ? error.message : 'master db error',
      };
    }

    const cachedTenants = this.tenantConnections.getCachedTenantIds();
    if (cachedTenants.length === 0) {
      checks.demoTenantDb = {
        status: 'error',
        detail: 'no tenant pools cached yet',
      };
    } else {
      try {
        const ok = await this.tenantConnections.ping(cachedTenants[0]);
        checks.demoTenantDb = {
          status: ok ? 'ok' : 'error',
          detail: `tenantId=${cachedTenants[0]}`,
        };
      } catch (error) {
        checks.demoTenantDb = {
          status: 'error',
          detail: error instanceof Error ? error.message : 'tenant db error',
        };
      }
    }

    checks.redis = await this.redisHealth.check();

    const hardFail =
      checks.masterDb.status !== 'ok' || checks.demoTenantDb.status !== 'ok';

    const payload = {
      status: hardFail ? 'not_ready' : 'ready',
      phase: '1',
      checks,
      timestamp: new Date().toISOString(),
      redisRequired: this.config.get<boolean>('redis.enabled'),
    };

    if (hardFail) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
