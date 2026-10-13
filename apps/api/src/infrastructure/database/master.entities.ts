import { Session } from '../../platform/auth/entities/session.entity';
import { TenantMembership } from '../../platform/auth/entities/tenant-membership.entity';
import { User } from '../../platform/auth/entities/user.entity';
import { catalogEntities } from '../../platform/catalog/catalog.module';
import { TenantDatabase } from '../../platform/tenants/entities/tenant-database.entity';
import { TenantDomain } from '../../platform/tenants/entities/tenant-domain.entity';
import { Tenant } from '../../platform/tenants/entities/tenant.entity';

export const masterEntities = [
  Tenant,
  TenantDomain,
  TenantDatabase,
  User,
  Session,
  TenantMembership,
  ...catalogEntities,
];
