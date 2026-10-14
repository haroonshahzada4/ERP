import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandAttendancePhase31730000008000 implements MigrationInterface {
  name = 'ExpandAttendancePhase31730000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shifts"
        ADD COLUMN IF NOT EXISTS "early_grace_minutes" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "ot_after_minutes" int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "attendances"
        ADD COLUMN IF NOT EXISTS "early_departure_minutes" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "overtime_minutes" int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendances"
        DROP COLUMN IF EXISTS "early_departure_minutes",
        DROP COLUMN IF EXISTS "overtime_minutes"
    `);
    await queryRunner.query(`
      ALTER TABLE "shifts"
        DROP COLUMN IF EXISTS "early_grace_minutes",
        DROP COLUMN IF EXISTS "ot_after_minutes"
    `);
  }
}
