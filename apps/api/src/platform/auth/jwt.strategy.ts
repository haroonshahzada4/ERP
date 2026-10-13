import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { getTenantContext } from '../../common/tenant/tenant-context';
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
  tid: number;
  sid: number;
  typ?: string;
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
    if (!payload.sub || !payload.tid || !payload.sid) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    const tenant = getTenantContext();
    if (!tenant) {
      throw new UnauthorizedException('Tenant context required');
    }

    // JWT tenant must match host-resolved tenant (blocks cross-tenant token reuse).
    const tid = Number(payload.tid);
    const sid = Number(payload.sid);
    const sub = Number(payload.sub);
    if (!Number.isFinite(tid) || !Number.isFinite(sid) || !Number.isFinite(sub)) {
      throw new UnauthorizedException('Invalid access token claims');
    }

    if (tid !== tenant.tenantId) {
      throw new UnauthorizedException('Token tenant mismatch');
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

    // Always re-check active membership in Master DB for the resolved tenant.
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
      sessionId: session.id,
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
