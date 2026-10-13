import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAttendanceLeaveSchema1730000004000
  implements MigrationInterface
{
  name = 'InitAttendanceLeaveSchema1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        name varchar NOT NULL,
        code varchar NOT NULL UNIQUE,
        start_time time NOT NULL,
        end_time time NOT NULL,
        grace_minutes int NOT NULL DEFAULT 15,
        is_overnight boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shift_assignments (
        id SERIAL PRIMARY KEY,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id integer NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
        effective_from date NOT NULL,
        effective_to date NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee ON shift_assignments(employee_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        holiday_date date NOT NULL UNIQUE,
        name varchar NOT NULL,
        is_optional boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendances (
        id SERIAL PRIMARY KEY,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        shift_id integer NULL REFERENCES shifts(id) ON DELETE SET NULL,
        status varchar NOT NULL DEFAULT 'incomplete',
        check_in_at timestamptz NULL,
        check_out_at timestamptz NULL,
        late_minutes int NOT NULL DEFAULT 0,
        worked_minutes int NOT NULL DEFAULT 0,
        notes text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(employee_id, work_date)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances(work_date)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_requests (
        id SERIAL PRIMARY KEY,
        attendance_id integer NULL REFERENCES attendances(id) ON DELETE SET NULL,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        requested_check_in_at timestamptz NULL,
        requested_check_out_at timestamptz NULL,
        reason text NOT NULL,
        status varchar NOT NULL DEFAULT 'pending',
        decided_by_user_id integer NULL,
        decided_at timestamptz NULL,
        decision_note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        name varchar NOT NULL,
        code varchar NOT NULL UNIQUE,
        is_paid boolean NOT NULL DEFAULT true,
        allow_half_day boolean NOT NULL DEFAULT true,
        max_days_per_year numeric(6,2) NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id integer NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
        session_name varchar NOT NULL,
        session_starts_on date NOT NULL,
        session_ends_on date NOT NULL,
        accrued numeric(8,2) NOT NULL DEFAULT 0,
        used numeric(8,2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(employee_id, leave_type_id, session_starts_on)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        id SERIAL PRIMARY KEY,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id integer NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
        session_name varchar NOT NULL,
        session_starts_on date NOT NULL,
        session_ends_on date NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        days numeric(6,2) NOT NULL,
        is_half_day boolean NOT NULL DEFAULT false,
        reason text NOT NULL,
        status varchar NOT NULL DEFAULT 'pending_manager',
        manager_status varchar NULL,
        manager_decided_by_user_id integer NULL,
        manager_decided_at timestamptz NULL,
        manager_note text NULL,
        hr_status varchar NULL,
        hr_decided_by_user_id integer NULL,
        hr_decided_at timestamptz NULL,
        hr_note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS leaves`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_balances`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_types`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendances`);
    await queryRunner.query(`DROP TABLE IF EXISTS holidays`);
    await queryRunner.query(`DROP TABLE IF EXISTS shift_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS shifts`);
  }
}
