import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapse leave_sessions + leave_requests + leave_approvals into one `leaves` table.
 * leave_balances stores session window columns instead of session_id.
 */
export class ConsolidateLeaveTables1730000005000 implements MigrationInterface {
  name = 'ConsolidateLeaveTables1730000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOldRequests = await queryRunner.hasTable('leave_requests');
    const hasLeaves = await queryRunner.hasTable('leaves');

    if (!hasLeaves) {
      await queryRunner.query(`
        CREATE TABLE leaves (
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

    if (hasOldRequests) {
      await queryRunner.query(`
        INSERT INTO leaves (
          id, employee_id, leave_type_id,
          session_name, session_starts_on, session_ends_on,
          start_date, end_date, days, is_half_day, reason, status,
          manager_status, manager_decided_by_user_id, manager_decided_at, manager_note,
          hr_status, hr_decided_by_user_id, hr_decided_at, hr_note,
          created_at, updated_at
        )
        SELECT
          r.id,
          r.employee_id,
          r.leave_type_id,
          COALESCE(s.name, 'Legacy'),
          COALESCE(s.starts_on, r.start_date),
          COALESCE(s.ends_on, r.end_date),
          r.start_date,
          r.end_date,
          r.days,
          r.is_half_day,
          r.reason,
          r.status,
          mgr.status,
          mgr.decided_by_user_id,
          mgr.decided_at,
          mgr.note,
          hr.status,
          hr.decided_by_user_id,
          hr.decided_at,
          hr.note,
          r.created_at,
          r.updated_at
        FROM leave_requests r
        LEFT JOIN leave_sessions s ON s.id = r.session_id
        LEFT JOIN LATERAL (
          SELECT * FROM leave_approvals a
          WHERE a.leave_request_id = r.id AND a.step = 'manager'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) mgr ON true
        LEFT JOIN LATERAL (
          SELECT * FROM leave_approvals a
          WHERE a.leave_request_id = r.id AND a.step = 'hr'
          ORDER BY a.created_at DESC
          LIMIT 1
        ) hr ON true
        WHERE NOT EXISTS (SELECT 1 FROM leaves l WHERE l.id = r.id)
      `);
    }

    const hasBalances = await queryRunner.hasTable('leave_balances');
    if (hasBalances) {
      const cols: { column_name: string }[] = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'leave_balances' AND table_schema = 'public'
      `);
      const names = new Set(cols.map((c) => c.column_name));

      if (names.has('session_id') && !names.has('session_starts_on')) {
        await queryRunner.query(`
          ALTER TABLE leave_balances
            ADD COLUMN IF NOT EXISTS session_name varchar,
            ADD COLUMN IF NOT EXISTS session_starts_on date,
            ADD COLUMN IF NOT EXISTS session_ends_on date
        `);
        await queryRunner.query(`
          UPDATE leave_balances b
          SET
            session_name = COALESCE(s.name, 'Legacy'),
            session_starts_on = COALESCE(s.starts_on, CURRENT_DATE),
            session_ends_on = COALESCE(s.ends_on, CURRENT_DATE)
          FROM leave_sessions s
          WHERE b.session_id = s.id
            AND b.session_starts_on IS NULL
        `);
        await queryRunner.query(`
          UPDATE leave_balances
          SET
            session_name = COALESCE(session_name, 'Legacy'),
            session_starts_on = COALESCE(session_starts_on, CURRENT_DATE),
            session_ends_on = COALESCE(session_ends_on, CURRENT_DATE)
          WHERE session_starts_on IS NULL
        `);
        await queryRunner.query(`
          ALTER TABLE leave_balances
            ALTER COLUMN session_name SET NOT NULL,
            ALTER COLUMN session_starts_on SET NOT NULL,
            ALTER COLUMN session_ends_on SET NOT NULL
        `);
        await queryRunner.query(`
          ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS leave_balances_employee_id_leave_type_id_session_id_key
        `);
        await queryRunner.query(`
          ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS "UQ_leave_balances_employee_type_session"
        `);
        await queryRunner.query(`
          ALTER TABLE leave_balances DROP COLUMN IF EXISTS session_id
        `);
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_balances_emp_type_session
            ON leave_balances(employee_id, leave_type_id, session_starts_on)
        `);
      }
    }

    await queryRunner.query(`DROP TABLE IF EXISTS leave_approvals`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_sessions`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_sessions (
        id SERIAL PRIMARY KEY,
        name varchar NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        is_current boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id integer NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
        session_id integer NOT NULL REFERENCES leave_sessions(id) ON DELETE RESTRICT,
        start_date date NOT NULL,
        end_date date NOT NULL,
        days numeric(6,2) NOT NULL,
        is_half_day boolean NOT NULL DEFAULT false,
        reason text NOT NULL,
        status varchar NOT NULL DEFAULT 'pending_manager',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_approvals (
        id SERIAL PRIMARY KEY,
        leave_request_id integer NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        step varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'pending',
        decided_by_user_id integer NULL,
        decided_at timestamptz NULL,
        note text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Data reverse is lossy for balances; leave table kept for safety.
  }
}
