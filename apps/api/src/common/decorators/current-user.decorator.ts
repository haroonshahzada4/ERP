import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Request-scoped identity. Roles/permissions are loaded dynamically — never trusted from JWT. */
export type AuthUser = {
  userId: number;
  sessionId: number;
  tenantId: number;
  membershipId: number;
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
