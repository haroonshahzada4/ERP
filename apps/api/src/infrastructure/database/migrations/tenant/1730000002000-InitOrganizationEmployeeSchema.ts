import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitOrganizationEmployeeSchema1730000002000
  implements MigrationInterface
{
  name = 'InitOrganizationEmployeeSchema1730000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "branches" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "city" varchar NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "departments" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "branch_id" integer NULL REFERENCES "branches"("id") ON DELETE SET NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "designations" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employment_types" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employment_statuses" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_types" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "code" varchar NOT NULL UNIQUE,
        "is_required" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employees" (
        "id" SERIAL PRIMARY KEY,
        "employee_code" varchar NOT NULL UNIQUE,
        "first_name" varchar NOT NULL,
        "last_name" varchar NOT NULL,
        "email" varchar NOT NULL UNIQUE,
        "phone" varchar NULL,
        "user_id" integer NULL,
        "branch_id" integer NULL REFERENCES "branches"("id") ON DELETE SET NULL,
        "department_id" integer NULL REFERENCES "departments"("id") ON DELETE SET NULL,
        "designation_id" integer NULL REFERENCES "designations"("id") ON DELETE SET NULL,
        "employment_type_id" integer NULL REFERENCES "employment_types"("id") ON DELETE SET NULL,
        "employment_status_id" integer NULL REFERENCES "employment_statuses"("id") ON DELETE SET NULL,
        "reporting_to_id" integer NULL REFERENCES "employees"("id") ON DELETE SET NULL,
        "date_of_joining" date NULL,
        "basic_salary" numeric(14,2) NULL,
        "cnic" varchar NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_documents" (
        "id" SERIAL PRIMARY KEY,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "document_type_id" integer NOT NULL REFERENCES "document_types"("id") ON DELETE RESTRICT,
        "file_name" varchar NOT NULL,
        "storage_key" varchar NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employment_history" (
        "id" SERIAL PRIMARY KEY,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "title" varchar NOT NULL,
        "notes" text NULL,
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employment_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employees"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_types"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employment_statuses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employment_types"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "designations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "departments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);
  }
}
