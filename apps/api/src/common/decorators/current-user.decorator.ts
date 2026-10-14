import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type TokenAudience = 'platform' | 'tenant';

/** Request-scoped identity. Roles/permissions are loaded dynamically — never trusted from JWT. */
export type AuthUser = {
  userId: number;
  sessionId: number;
  audience: TokenAudience;
  /** Present for tenant tokens; for platform+support may equal host-resolved tenant. */
  tenantId: number | null;
  membershipId: number | null;
  email: string;
  fullName: string;
  permissions: string[];
  roles: string[];
  isPlatformAdmin: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
