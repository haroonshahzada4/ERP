import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantProvisioningError1730000004000 implements MigrationInterface {
  name = 'TenantProvisioningError1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD COLUMN IF NOT EXISTS "last_error" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        DROP COLUMN IF EXISTS "last_error"
    `);
  }
}
