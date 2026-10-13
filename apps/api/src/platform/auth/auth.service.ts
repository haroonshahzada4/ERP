import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { LoginDto } from './dto/login.dto';
import { Session } from './entities/session.entity';
import {
  MembershipStatus,
  TenantMembership,
} from './entities/tenant-membership.entity';
import { User } from './entities/user.entity';
import { RbacService } from './rbac.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(TenantMembership)
    private readonly memberships: Repository<TenantMembership>,
    private readonly rbac: RbacService,
  ) {}

  async login(dto: LoginDto) {
    const tenant = getTenantContext();
    if (!tenant) {
      throw new ForbiddenException('Tenant context required');
    }

    const { user, membership } = await this.authenticateMember(
      dto,
      tenant.tenantId,
    );

    return this.buildAuthResponse(user, membership, {
      id: tenant.tenantId,
      slug: tenant.tenantSlug,
      host: tenant.host,
    });
  }

  /**
   * Platform Super Admin login — no company subdomain.
   * Still binds the JWT to an active membership so existing
   * tenant-scoped guards / RBAC continue to work.
   */
  async platformLogin(dto: LoginDto) {
    const user = await this.verifyCredentials(dto);
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }

    const memberships = await this.memberships.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      relations: { tenant: { domains: true } },
      order: { createdAt: 'ASC' },
    });
    const membership =
      memberships.find((m) => m.tenant.slug === 'demo') ?? memberships[0];
    if (!membership) {
      throw new ForbiddenException('No active platform membership');
    }

    const host =
      membership.tenant.domains.find((d) => d.isPrimary)?.host ??
      membership.tenant.domains[0]?.host ??
      `${membership.tenant.slug}.localhost`;

    return this.buildAuthResponse(user, membership, {
      id: membership.tenantId,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      host,
    });
  }

  async refresh(refreshToken: string) {
    const tenant = getTenantContext();
    if (!tenant) {
      throw new ForbiddenException('Tenant context required');
    }

    let payload: { sub: number; sid: number; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const sid = Number(payload.sid);
    const sub = Number(payload.sub);
    const session = await this.sessions.findOne({ where: { id: sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const hash = this.hashToken(refreshToken);
    if (session.refreshTokenHash !== hash) {
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.users.findOne({ where: { id: sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    const membership = await this.memberships.findOne({
      where: {
        userId: user.id,
        tenantId: tenant.tenantId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new ForbiddenException('Membership revoked');
    }

    session.revokedAt = new Date();
    await this.sessions.save(session);

    const rbac = await this.rbac.getForUser(
      membership.id,
      user.id,
      tenant.tenantId,
      user,
    );
    const tokens = await this.issueTokens(user, membership);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenant: {
        id: tenant.tenantId,
        slug: tenant.tenantSlug,
        host: tenant.host,
      },
      membershipId: membership.id,
      roles: rbac.roles,
      permissions: rbac.permissions,
      isPlatformAdmin: rbac.isPlatformAdmin,
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sid: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
      const session = await this.sessions.findOne({
        where: { id: Number(payload.sid) },
      });
      if (session && !session.revokedAt) {
        session.revokedAt = new Date();
        await this.sessions.save(session);
      }
    } catch {
      // idempotent logout
    }
    return { status: 'ok' };
  }

  async me(userId: number, membershipId: number, tenantId: number) {
    const tenant = getTenantContext();
    if (!tenant || tenant.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const membership = await this.memberships.findOne({
      where: {
        id: membershipId,
        userId,
        tenantId,
        status: MembershipStatus.ACTIVE,
      },
      relations: { tenant: true },
    });
    if (!membership) {
      throw new ForbiddenException('Membership revoked');
    }
    const rbac = await this.rbac.getForUser(
      membershipId,
      userId,
      tenantId,
      user,
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
        status: membership.tenant.status,
      },
      membershipId: membership.id,
      roles: rbac.roles,
      permissions: rbac.permissions,
      isPlatformAdmin: rbac.isPlatformAdmin,
    };
  }

  private async verifyCredentials(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  private async authenticateMember(dto: LoginDto, tenantId: number) {
    const user = await this.verifyCredentials(dto);
    // Email alone never selects a tenant — membership must match host-resolved tenant.
    const membership = await this.memberships.findOne({
      where: {
        userId: user.id,
        tenantId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new ForbiddenException('No active membership for this tenant');
    }
    return { user, membership };
  }

  private async buildAuthResponse(
    user: User,
    membership: TenantMembership,
    tenant: { id: number; slug: string; host: string; name?: string },
  ) {
    const rbac = await this.rbac.getForUser(
      membership.id,
      user.id,
      tenant.id,
      user,
    );
    const tokens = await this.issueTokens(user, membership);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenant,
      membershipId: membership.id,
      roles: rbac.roles,
      permissions: rbac.permissions,
      isPlatformAdmin: rbac.isPlatformAdmin,
      ...tokens,
    };
  }

  private async issueTokens(user: User, membership: TenantMembership) {
    const expiresAt = new Date(
      Date.now() +
        this.parseTtlMs(this.config.get<string>('jwt.refreshTtl') ?? '7d'),
    );

    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshTokenHash: this.hashToken(randomBytes(32).toString('hex')),
        expiresAt,
        revokedAt: null,
      }),
    );

    // Slim access token: identity + tenant + session only.
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        tid: membership.tenantId,
        sid: session.id,
        typ: 'access',
      },
      {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: session.id,
        typ: 'refresh',
      },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl') ?? '7d',
      },
    );

    session.refreshTokenHash = this.hashToken(refreshToken);
    await this.sessions.save(session);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlMs(ttl: string) {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = Number(match[1]);
    const unit = match[2];
    const mult =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000;
    return n * mult;
  }
}
