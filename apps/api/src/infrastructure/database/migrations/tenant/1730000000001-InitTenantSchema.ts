import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitTenantSchema1730000000001 implements MigrationInterface {
  name = 'InitTenantSchema1730000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "company_settings" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "timezone" varchar NOT NULL DEFAULT 'UTC',
        "fiscal_year_start_month" int NOT NULL DEFAULT 7,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_settings"`);
  }
}
