import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { masterEntities } from './master.entities';
import { InitMasterSchema1730000000000 } from './migrations/master/1730000000000-InitMasterSchema';
import { InitAuthSchema1730000001000 } from './migrations/master/1730000001000-InitAuthSchema';
import { AddTenantBranding1730000002000 } from './migrations/master/1730000002000-AddTenantBranding';
import { InitPlatformCatalog1730000003000 } from './migrations/master/1730000003000-InitPlatformCatalog';
import { TenantProvisioningError1730000004000 } from './migrations/master/1730000004000-TenantProvisioningError';

export const masterDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.MASTER_DB_HOST ?? 'localhost',
  port: parseInt(process.env.MASTER_DB_PORT ?? '5432', 10),
  username: process.env.MASTER_DB_USER ?? 'erp',
  password: process.env.MASTER_DB_PASSWORD ?? 'admin',
  database: process.env.MASTER_DB_NAME ?? 'erp_master',
  synchronize: false,
  logging: (process.env.TYPEORM_LOGGING ?? 'true') === 'true',
  entities: masterEntities,
  migrations: [
    InitMasterSchema1730000000000,
    InitAuthSchema1730000001000,
    AddTenantBranding1730000002000,
    InitPlatformCatalog1730000003000,
    TenantProvisioningError1730000004000,
  ],
};

export default new DataSource(masterDataSourceOptions);
