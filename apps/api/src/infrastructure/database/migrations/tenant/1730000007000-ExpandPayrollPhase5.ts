import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandPayrollPhase51730000007000 implements MigrationInterface {
  name = 'ExpandPayrollPhase51730000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_allowances" (
        "id" SERIAL PRIMARY KEY,
        "employee_id" int NOT NULL,
        "name" varchar(80) NOT NULL,
        "kind" varchar(20) NOT NULL DEFAULT 'fixed',
        "amount_value" int NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "is_taxable" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payroll_allowances_employee" ON "payroll_allowances" ("employee_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_deductions" (
        "id" SERIAL PRIMARY KEY,
        "employee_id" int NOT NULL,
        "name" varchar(80) NOT NULL,
        "kind" varchar(20) NOT NULL DEFAULT 'fixed',
        "amount_value" int NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "is_pre_tax" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payroll_deductions_employee" ON "payroll_deductions" ("employee_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_tax_slabs" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(80) NOT NULL,
        "from_cents" int NOT NULL,
        "to_cents" int NULL,
        "rate_bps" int NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_approvals" (
        "id" SERIAL PRIMARY KEY,
        "payroll_run_id" int NOT NULL,
        "step" varchar(10) NOT NULL,
        "decision" varchar(20) NOT NULL,
        "actor_user_id" int NOT NULL,
        "remarks" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payroll_approvals_run" ON "payroll_approvals" ("payroll_run_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payslips" (
        "id" SERIAL PRIMARY KEY,
        "payroll_run_id" int NOT NULL,
        "payroll_item_id" int NOT NULL,
        "employee_id" int NOT NULL,
        "snapshot" jsonb NOT NULL,
        "issued_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("payroll_run_id", "employee_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payroll_runs"
        ADD COLUMN IF NOT EXISTS "calculation_version" varchar NOT NULL DEFAULT '1.0.0',
        ADD COLUMN IF NOT EXISTS "attendance_snapshot_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payroll_items"
        ADD COLUMN IF NOT EXISTS "tax_cents" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "days_present" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "days_expected" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "breakdown" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_items" DROP COLUMN IF EXISTS "tax_cents", DROP COLUMN IF EXISTS "days_present", DROP COLUMN IF EXISTS "days_expected", DROP COLUMN IF EXISTS "breakdown"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" DROP COLUMN IF EXISTS "calculation_version", DROP COLUMN IF EXISTS "attendance_snapshot_at", DROP COLUMN IF EXISTS "finalized_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payslips"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_approvals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_tax_slabs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_deductions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_allowances"`);
  }
}
