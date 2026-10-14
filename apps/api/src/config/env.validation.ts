import * as Joi from 'joi';

const WEAK_JWT_SECRETS = new Set([
  'change-me-access',
  'change-me-refresh',
  'erp-local-access-secret-admin',
  'erp-local-refresh-secret-admin',
]);

function jwtSecretSchema(label: string) {
  return Joi.string()
    .min(8)
    .custom((value, helpers) => {
      const env = process.env.NODE_ENV ?? 'development';
      if (env === 'production') {
        if (!value || value.length < 32) {
          return helpers.error('any.invalid', {
            message: `${label} must be at least 32 characters in production`,
          });
        }
        if (WEAK_JWT_SECRETS.has(value) || /(?:change-me|secret-admin)$/i.test(value)) {
          return helpers.error('any.invalid', {
            message: `${label} uses a weak/default value`,
          });
        }
      }
      return value;
    }, 'jwt secret strength');
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  MASTER_DB_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  MASTER_DB_HOST: Joi.string().default('localhost'),
  MASTER_DB_PORT: Joi.number().port().default(5432),
  MASTER_DB_USER: Joi.string().default('erp'),
  MASTER_DB_PASSWORD: Joi.string().allow('').default('admin'),
  MASTER_DB_NAME: Joi.string().default('erp_master'),

  DEMO_TENANT_DB_NAME: Joi.string().default('erp_tenant_demo'),
  DEMO_TENANT_SLUG: Joi.string().default('demo'),
  DEMO_ADMIN_EMAIL: Joi.string().email().default('admin@demo.com'),
  DEMO_ADMIN_PASSWORD: Joi.string().default('admin'),

  TYPEORM_SYNC: Joi.boolean().truthy('true').falsy('false').default(false),
  TYPEORM_LOGGING: Joi.boolean().truthy('true').falsy('false').default(true),
  TYPEORM_RUN_MIGRATIONS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),

  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),

  JWT_ACCESS_SECRET: jwtSecretSchema('JWT_ACCESS_SECRET').default(
    'change-me-access',
  ),
  JWT_REFRESH_SECRET: jwtSecretSchema('JWT_REFRESH_SECRET').default(
    'change-me-refresh',
  ),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
});
