import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPlatformCatalog1730000003000 implements MigrationInterface {
  name = 'InitPlatformCatalog1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_modules (
        id SERIAL PRIMARY KEY,
        key varchar NOT NULL UNIQUE,
        name varchar NOT NULL,
        description varchar NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_features (
        id SERIAL PRIMARY KEY,
        module_id integer NOT NULL REFERENCES platform_modules(id) ON DELETE CASCADE,
        key varchar NOT NULL UNIQUE,
        name varchar NOT NULL,
        description varchar NULL,
        depends_on_feature_key varchar NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_platform_features_module ON platform_features(module_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        slug varchar NOT NULL UNIQUE,
        name varchar NOT NULL,
        description varchar NULL,
        price_monthly_cents int NOT NULL DEFAULT 0,
        currency varchar NOT NULL DEFAULT 'USD',
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_features (
        id SERIAL PRIMARY KEY,
        plan_id integer NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        feature_id integer NOT NULL REFERENCES platform_features(id) ON DELETE CASCADE,
        UNIQUE(plan_id, feature_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        tenant_id integer NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id integer NOT NULL REFERENCES plans(id),
        status varchar NOT NULL DEFAULT 'active',
        current_period_start timestamptz NOT NULL DEFAULT now(),
        current_period_end timestamptz NULL,
        mrr_cents int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_feature_entitlements (
        id SERIAL PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        feature_id integer NOT NULL REFERENCES platform_features(id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT true,
        source varchar NOT NULL DEFAULT 'plan',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id, feature_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_feature_entitlements_tenant ON tenant_feature_entitlements(tenant_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_audit_logs (
        id SERIAL PRIMARY KEY,
        actor_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        actor_email varchar NULL,
        action varchar NOT NULL,
        resource_type varchar NOT NULL,
        resource_id varchar NULL,
        tenant_id integer NULL REFERENCES tenants(id) ON DELETE SET NULL,
        metadata jsonb NULL,
        ip varchar NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created ON platform_audit_logs(created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_access_requests (
        id SERIAL PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requester_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar NOT NULL DEFAULT 'pending',
        reason text NOT NULL,
        feature_keys text[] NOT NULL DEFAULT '{}',
        permission_keys text[] NOT NULL DEFAULT '{}',
        emergency boolean NOT NULL DEFAULT false,
        expires_at timestamptz NOT NULL,
        decided_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        decided_at timestamptz NULL,
        decision_note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_support_access_tenant_status ON support_access_requests(tenant_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_access_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_feature_entitlements`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS plan_features`);
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_features`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_modules`);
  }
}
