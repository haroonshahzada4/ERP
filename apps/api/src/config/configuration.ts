export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:8001',
  masterDb: {
    enabled: (process.env.MASTER_DB_ENABLED ?? 'true') === 'true',
    host: process.env.MASTER_DB_HOST ?? 'localhost',
    port: parseInt(process.env.MASTER_DB_PORT ?? '5432', 10),
    username: process.env.MASTER_DB_USER ?? 'erp',
    password: process.env.MASTER_DB_PASSWORD ?? 'admin',
    database: process.env.MASTER_DB_NAME ?? 'erp_master',
  },
  demoTenant: {
    slug: process.env.DEMO_TENANT_SLUG ?? 'demo',
    database: process.env.DEMO_TENANT_DB_NAME ?? 'erp_tenant_demo',
    adminEmail: process.env.DEMO_ADMIN_EMAIL ?? 'admin@demo.com',
    adminPassword: process.env.DEMO_ADMIN_PASSWORD ?? 'admin',
  },
  typeorm: {
    synchronize: (process.env.TYPEORM_SYNC ?? 'false') === 'true',
    logging: (process.env.TYPEORM_LOGGING ?? 'true') === 'true',
    runMigrations: (process.env.TYPEORM_RUN_MIGRATIONS ?? 'true') === 'true',
  },
  redis: {
    enabled: (process.env.REDIS_ENABLED ?? 'false') === 'true',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
});
