import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitMasterSchema1730000000000 implements MigrationInterface {
  name = 'InitMasterSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" SERIAL PRIMARY KEY,
        "slug" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'provisioning',
        "schema_version" varchar NOT NULL DEFAULT '0.1.0',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_domains" (
        "id" SERIAL PRIMARY KEY,
        "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "host" varchar NOT NULL UNIQUE,
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_verified" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_databases" (
        "id" SERIAL PRIMARY KEY,
        "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "db_name" varchar NOT NULL,
        "db_host" varchar NOT NULL,
        "db_port" int NOT NULL DEFAULT 5432,
        "db_user" varchar NOT NULL,
        "db_password" varchar NOT NULL,
        "schema_version" varchar NOT NULL DEFAULT '0.1.0',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_databases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_domains"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
