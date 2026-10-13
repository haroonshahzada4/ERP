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
    // Platform Super Admin login has no company subdomain.
    if (this.isTenantlessPath(req)) {
      return next();
    }

    // Reject explicit client tenant id headers/query — never authorize from these.
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

  private isTenantlessPath(req: Request) {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    return (
      path === '/api/v1/auth/platform/login' ||
      path.endsWith('/auth/platform/login') ||
      path === '/api/v1/health' ||
      path.startsWith('/api/v1/health/') ||
      path === '/api/v1' ||
      path === '/api/v1/'
    );
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

    // Local Vite proxy: Host is localhost. Allow X-Tenant-Host only in non-production,
    // and only as a lookup key into verified domains (same path as production Host).
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    if (isProd) {
      return null;
    }

    const headerHost = String(req.headers['x-tenant-host'] ?? '')
      .split(':')[0]
      .toLowerCase()
      .trim();

    if (!headerHost || headerHost === 'localhost' || headerHost === '127.0.0.1') {
      // No silent default — client must send the company subdomain.
      return null;
    }

    return headerHost;
  }
}
