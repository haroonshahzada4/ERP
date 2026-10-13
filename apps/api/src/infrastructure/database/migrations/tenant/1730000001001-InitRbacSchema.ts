import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitRbacSchema1730000001001 implements MigrationInterface {
  name = 'InitRbacSchema1730000001001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" SERIAL PRIMARY KEY,
        "key" varchar NOT NULL UNIQUE,
        "label" varchar NOT NULL,
        "description" varchar NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" SERIAL PRIMARY KEY,
        "key" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "id" SERIAL PRIMARY KEY,
        "role_id" integer NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permission_id" integer NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        UNIQUE ("role_id", "permission_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "membership_roles" (
        "id" SERIAL PRIMARY KEY,
        "membership_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "role_id" integer NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("membership_id", "role_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
  }
}
