import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getTenantContext } from '../../../common/tenant/tenant-context';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';

export async function resolveTenantDs(
  tenantDatabases: Repository<TenantDatabase>,
  tenantConnections: TenantConnectionManager,
) {
  const tenant = getTenantContext();
  if (!tenant) throw new NotFoundException('Tenant required');
  const dbMeta = await tenantDatabases.findOne({
    where: { tenantId: tenant.tenantId },
  });
  if (!dbMeta) throw new NotFoundException('Tenant database missing');
  return tenantConnections.getOrCreate(tenant.tenantId, {
    host: dbMeta.dbHost,
    port: dbMeta.dbPort,
    username: dbMeta.dbUser,
    password: dbMeta.dbPassword,
    database: dbMeta.dbName,
  });
}

export function todayIso(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function canApproveAttendance(user: {
  permissions: string[];
}) {
  return (
    user.permissions.includes('attendance.approve') ||
    user.permissions.includes('attendance.update') ||
    user.permissions.includes('tenant:*')
  );
}

export function canApproveLeave(user: { permissions: string[] }) {
  return (
    user.permissions.includes('leave.approve') ||
    user.permissions.includes('tenant:*')
  );
}
