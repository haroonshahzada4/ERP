import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPayrollRecruitmentSchema1730000006000
  implements MigrationInterface
{
  name = 'InitPayrollRecruitmentSchema1730000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compensations" (
        "id" SERIAL PRIMARY KEY,
        "employee_id" int NOT NULL,
        "base_cents" int NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'USD',
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_compensations_employee"
        ON "compensations" ("employee_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_runs" (
        "id" SERIAL PRIMARY KEY,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'draft',
        "total_cents" int NOT NULL DEFAULT 0,
        "created_by_user_id" int NULL,
        "notes" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_items" (
        "id" SERIAL PRIMARY KEY,
        "payroll_run_id" int NOT NULL,
        "employee_id" int NOT NULL,
        "base_cents" int NOT NULL DEFAULT 0,
        "allowance_cents" int NOT NULL DEFAULT 0,
        "deduction_cents" int NOT NULL DEFAULT 0,
        "net_cents" int NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payroll_items_run"
        ON "payroll_items" ("payroll_run_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" SERIAL PRIMARY KEY,
        "title" varchar NOT NULL,
        "description" text NULL,
        "department_id" int NULL,
        "status" varchar NOT NULL DEFAULT 'draft',
        "opened_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_applications" (
        "id" SERIAL PRIMARY KEY,
        "job_id" int NOT NULL,
        "candidate_name" varchar NOT NULL,
        "candidate_email" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'applied',
        "notes" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_job_applications_job"
        ON "job_applications" ("job_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_applications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compensations"`);
  }
}
