import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { TokenAudience } from '../../common/decorators/current-user.decorator';
import { getTenantContext } from '../../common/tenant/tenant-context';
import {
  PLATFORM_PERMISSION_KEYS,
  SUPER_ADMIN_ROLE,
} from '../../modules/access/system-roles';
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

    return this.buildTenantAuthResponse(user, membership, {
      id: tenant.tenantId,
      slug: tenant.tenantSlug,
      host: tenant.host,
    });
  }

  /**
   * Platform Super Admin login — no company subdomain, no tenant JWT binding.
   */
  async platformLogin(dto: LoginDto) {
    const user = await this.verifyCredentials(dto);
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }

    const tokens = await this.issueTokens(user, 'platform');
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      audience: 'platform' as const,
      tenant: null,
      membershipId: null,
      roles: [SUPER_ADMIN_ROLE],
      permissions: [...PLATFORM_PERMISSION_KEYS],
      isPlatformAdmin: true,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload: {
      sub: number;
      sid: number;
      typ?: string;
      aud?: TokenAudience;
      tid?: number;
    };
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

    const audience: TokenAudience =
      payload.aud === 'platform' ? 'platform' : 'tenant';
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

    session.revokedAt = new Date();
    await this.sessions.save(session);

    if (audience === 'platform') {
      if (!user.isPlatformAdmin) {
        throw new ForbiddenException('Platform admin access required');
      }
      const tokens = await this.issueTokens(user, 'platform');
      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        audience: 'platform' as const,
        tenant: null,
        membershipId: null,
        roles: [SUPER_ADMIN_ROLE],
        permissions: [...PLATFORM_PERMISSION_KEYS],
        isPlatformAdmin: true,
        ...tokens,
      };
    }

    const tenant = getTenantContext();
    if (!tenant) {
      throw new ForbiddenException('Tenant context required');
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

    const rbac = await this.rbac.getForUser(
      membership.id,
      user.id,
      tenant.tenantId,
      user,
    );
    const tokens = await this.issueTokens(user, 'tenant', membership.tenantId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      audience: 'tenant' as const,
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

  async me(user: {
    userId: number;
    membershipId: number | null;
    tenantId: number | null;
    audience: TokenAudience;
  }) {
    const entity = await this.users.findOne({ where: { id: user.userId } });
    if (!entity) {
      throw new UnauthorizedException();
    }

    if (user.audience === 'platform') {
      return {
        user: {
          id: entity.id,
          email: entity.email,
          fullName: entity.fullName,
        },
        audience: 'platform' as const,
        tenant: null,
        membershipId: null,
        roles: [SUPER_ADMIN_ROLE],
        permissions: [...PLATFORM_PERMISSION_KEYS],
        isPlatformAdmin: true,
      };
    }

    const tenant = getTenantContext();
    if (
      !tenant ||
      user.tenantId == null ||
      user.membershipId == null ||
      tenant.tenantId !== user.tenantId
    ) {
      throw new ForbiddenException('Tenant mismatch');
    }

    const membership = await this.memberships.findOne({
      where: {
        id: user.membershipId,
        userId: user.userId,
        tenantId: user.tenantId,
        status: MembershipStatus.ACTIVE,
      },
      relations: { tenant: true },
    });
    if (!membership) {
      throw new ForbiddenException('Membership revoked');
    }
    const rbac = await this.rbac.getForUser(
      user.membershipId,
      user.userId,
      user.tenantId,
      entity,
    );
    return {
      user: {
        id: entity.id,
        email: entity.email,
        fullName: entity.fullName,
      },
      audience: 'tenant' as const,
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

  private async buildTenantAuthResponse(
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
    const tokens = await this.issueTokens(user, 'tenant', membership.tenantId);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      audience: 'tenant' as const,
      tenant,
      membershipId: membership.id,
      roles: rbac.roles,
      permissions: rbac.permissions,
      isPlatformAdmin: rbac.isPlatformAdmin,
      ...tokens,
    };
  }

  private async issueTokens(
    user: User,
    audience: TokenAudience,
    tenantId?: number,
  ) {
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

    const accessClaims: Record<string, unknown> = {
      sub: user.id,
      sid: session.id,
      typ: 'access',
      aud: audience,
    };
    const refreshClaims: Record<string, unknown> = {
      sub: user.id,
      sid: session.id,
      typ: 'refresh',
      aud: audience,
    };
    if (audience === 'tenant') {
      if (tenantId == null) {
        throw new ForbiddenException('Tenant id required for tenant token');
      }
      accessClaims.tid = tenantId;
      refreshClaims.tid = tenantId;
    }

    const accessToken = await this.jwt.signAsync(accessClaims, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
    });

    const refreshToken = await this.jwt.signAsync(refreshClaims, {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshTtl') ?? '7d',
    });

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
