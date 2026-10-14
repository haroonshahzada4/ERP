import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import {
  AuthUser,
  TokenAudience,
} from '../../common/decorators/current-user.decorator';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { PLATFORM_PERMISSION_KEYS, SUPER_ADMIN_ROLE } from '../../modules/access/system-roles';
import { SupportAccessService } from '../catalog/support-access.service';
import { Session } from './entities/session.entity';
import {
  MembershipStatus,
  TenantMembership,
} from './entities/tenant-membership.entity';
import { User } from './entities/user.entity';
import { RbacService } from './rbac.service';

/** Slim access token — no roles/permissions embedded. */
export type AccessPayload = {
  sub: number;
  sid: number;
  typ?: string;
  aud?: TokenAudience;
  /** Tenant tokens only. */
  tid?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(TenantMembership)
    private readonly memberships: Repository<TenantMembership>,
    private readonly rbac: RbacService,
    private readonly supportAccess: SupportAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
      passReqToCallback: true,
    });
  }

  async validate(_req: Request, payload: AccessPayload): Promise<AuthUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }
    const audience: TokenAudience =
      payload.aud === 'platform' ? 'platform' : 'tenant';
    const sub = Number(payload.sub);
    const sid = Number(payload.sid);
    if (!Number.isFinite(sub) || !Number.isFinite(sid)) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    const session = await this.sessions.findOne({
      where: { id: sid, userId: sub },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.users.findOne({ where: { id: sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    if (audience === 'platform') {
      return this.validatePlatform(user, session.id);
    }

    return this.validateTenant(user, session.id, payload);
  }

  private async validatePlatform(
    user: User,
    sessionId: number,
  ): Promise<AuthUser> {
    if (!user.isPlatformAdmin) {
      throw new UnauthorizedException('Platform admin required');
    }

    const tenant = getTenantContext();
    if (!tenant) {
      return {
        userId: user.id,
        sessionId,
        audience: 'platform',
        tenantId: null,
        membershipId: null,
        email: user.email,
        fullName: user.fullName,
        roles: [SUPER_ADMIN_ROLE],
        permissions: [...PLATFORM_PERMISSION_KEYS],
        isPlatformAdmin: true,
      };
    }

    // Platform token on a tenant host — only support grant unlocks tenant perms.
    const grant = await this.supportAccess.getActiveGrant(
      user.id,
      tenant.tenantId,
    );
    const base = [...PLATFORM_PERMISSION_KEYS];
    const permissions = grant
      ? [...new Set([...base, ...grant.permissionKeys])]
      : base;

    return {
      userId: user.id,
      sessionId,
      audience: 'platform',
      tenantId: tenant.tenantId,
      membershipId: null,
      email: user.email,
      fullName: user.fullName,
      roles: [SUPER_ADMIN_ROLE],
      permissions,
      isPlatformAdmin: true,
    };
  }

  private async validateTenant(
    user: User,
    sessionId: number,
    payload: AccessPayload,
  ): Promise<AuthUser> {
    if (!payload.tid) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    const tenant = getTenantContext();
    if (!tenant) {
      throw new UnauthorizedException('Tenant context required');
    }

    const tid = Number(payload.tid);
    if (!Number.isFinite(tid)) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    if (tid !== tenant.tenantId) {
      throw new UnauthorizedException('Token tenant mismatch');
    }

    const membership = await this.memberships.findOne({
      where: {
        userId: user.id,
        tenantId: tenant.tenantId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new UnauthorizedException('No active membership for this tenant');
    }

    const rbac = await this.rbac.getForUser(
      membership.id,
      user.id,
      tenant.tenantId,
      user,
    );

    return {
      userId: user.id,
      sessionId,
      audience: 'tenant',
      tenantId: tenant.tenantId,
      membershipId: membership.id,
      email: user.email,
      fullName: user.fullName,
      roles: rbac.roles,
      permissions: rbac.permissions,
      isPlatformAdmin: rbac.isPlatformAdmin,
    };
  }
}
