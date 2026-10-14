import { DataSource, DataSourceOptions } from 'typeorm';
import { InitTenantSchema1730000000001 } from './migrations/tenant/1730000000001-InitTenantSchema';
import { InitRbacSchema1730000001001 } from './migrations/tenant/1730000001001-InitRbacSchema';
import { InitOrganizationEmployeeSchema1730000002000 } from './migrations/tenant/1730000002000-InitOrganizationEmployeeSchema';
import { AddCompanyBranding1730000003000 } from './migrations/tenant/1730000003000-AddCompanyBranding';
import { InitAttendanceLeaveSchema1730000004000 } from './migrations/tenant/1730000004000-InitAttendanceLeaveSchema';
import { ConsolidateLeaveTables1730000005000 } from './migrations/tenant/1730000005000-ConsolidateLeaveTables';
import { InitPayrollRecruitmentSchema1730000006000 } from './migrations/tenant/1730000006000-InitPayrollRecruitmentSchema';
import { ExpandPayrollPhase51730000007000 } from './migrations/tenant/1730000007000-ExpandPayrollPhase5';
import { ExpandAttendancePhase31730000008000 } from './migrations/tenant/1730000008000-ExpandAttendancePhase3';
import { tenantEntities } from './tenant.entities';

export type TenantDbConnectionInput = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging?: boolean;
};

export function buildTenantDataSourceOptions(
  input: TenantDbConnectionInput,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: input.host,
    port: input.port,
    username: input.username,
    password: input.password,
    database: input.database,
    synchronize: false,
    logging: input.logging ?? false,
    entities: tenantEntities,
    migrations: [
      InitTenantSchema1730000000001,
      InitRbacSchema1730000001001,
      InitOrganizationEmployeeSchema1730000002000,
      AddCompanyBranding1730000003000,
      InitAttendanceLeaveSchema1730000004000,
      ConsolidateLeaveTables1730000005000,
      InitPayrollRecruitmentSchema1730000006000,
      ExpandPayrollPhase51730000007000,
      ExpandAttendancePhase31730000008000,
    ],
  };
}

export function createTenantDataSource(input: TenantDbConnectionInput) {
  return new DataSource(buildTenantDataSourceOptions(input));
}
