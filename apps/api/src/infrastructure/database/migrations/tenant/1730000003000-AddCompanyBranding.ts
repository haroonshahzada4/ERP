import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyBranding1730000003000 implements MigrationInterface {
  name = 'AddCompanyBranding1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD COLUMN IF NOT EXISTS "logo_url" varchar NULL,
        ADD COLUMN IF NOT EXISTS "brand_primary" varchar NOT NULL DEFAULT '#1ecf8a',
        ADD COLUMN IF NOT EXISTS "brand_secondary" varchar NOT NULL DEFAULT '#149a66',
        ADD COLUMN IF NOT EXISTS "theme_mode" varchar NOT NULL DEFAULT 'dark'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company_settings"
        DROP COLUMN IF EXISTS "logo_url",
        DROP COLUMN IF EXISTS "brand_primary",
        DROP COLUMN IF EXISTS "brand_secondary",
        DROP COLUMN IF EXISTS "theme_mode"
    `);
  }
}
