import { ForbiddenException, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { TenantDomain } from '../../platform/tenants/entities/tenant-domain.entity';
import { TenantStatus } from '../../platform/tenants/entities/tenant.entity';
import { tenantContextStorage } from './tenant-context';

/**
 * Resolve tenant from the request Host binding to a verified domain row.
 * Never trusts client-provided tenant IDs or email.
 * X-Tenant-Host is only a local-dev proxy aid and still must match a verified domain.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantDomain)
    private readonly domains: Repository<TenantDomain>,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (this.isTenantlessPath(req)) {
      return next();
    }

    if (req.headers['x-tenant-id'] || req.query.tenantId || req.query.tenant_id) {
      throw new ForbiddenException('Client-provided tenant id is not allowed');
    }

    const host = this.resolveHost(req);
    if (!host) {
      throw new NotFoundException('Tenant host required');
    }

    const domain = await this.domains.findOne({
      where: { host, isVerified: true },
      relations: { tenant: true },
    });

    if (!domain || domain.tenant.status !== TenantStatus.ACTIVE) {
      throw new NotFoundException('Unknown or inactive tenant');
    }

    return tenantContextStorage.run(
      {
        tenantId: domain.tenantId,
        tenantSlug: domain.tenant.slug,
        host,
      },
      () => next(),
    );
  }

  /**
   * Paths that may run without a company subdomain:
   * health, platform login/refresh, and apex platform admin APIs
   * (except host-bound `.../current/...` routes).
   */
  private isTenantlessPath(req: Request) {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const normalized = path.replace(/\/+$/, '') || '/';

    if (
      normalized === '/api/v1' ||
      normalized === '/api/v1/health' ||
      normalized.startsWith('/api/v1/health/')
    ) {
      return true;
    }

    if (
      normalized === '/api/v1/auth/platform/login' ||
      normalized === '/api/v1/auth/platform/refresh' ||
      normalized.endsWith('/auth/platform/login') ||
      normalized.endsWith('/auth/platform/refresh')
    ) {
      return true;
    }

    // Apex platform admin APIs — not host-bound "current" snapshots.
    if (normalized.startsWith('/api/v1/platform/')) {
      if (normalized.includes('/current/')) {
        return false;
      }
      // entitlements/current is host-bound
      if (normalized.endsWith('/entitlements/current')) {
        return false;
      }
      return true;
    }

    return false;
  }

  private resolveHost(req: Request): string | null {
    const requestHost = (req.hostname ?? '').split(':')[0].toLowerCase();
    const isLoopback =
      !requestHost ||
      requestHost === 'localhost' ||
      requestHost === '127.0.0.1';

    if (!isLoopback) {
      return requestHost;
    }

    const isProd = this.config.get<string>('nodeEnv') === 'production';
    if (isProd) {
      return null;
    }

    const headerHost = String(req.headers['x-tenant-host'] ?? '')
      .split(':')[0]
      .toLowerCase()
      .trim();

    if (!headerHost || headerHost === 'localhost' || headerHost === '127.0.0.1') {
      return null;
    }

    return headerHost;
  }
}
