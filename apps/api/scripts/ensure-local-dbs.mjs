/**
 * One-time local setup: create erp role + erp_master / tenant DBs on local Postgres.
 * Uses PG_SUPERUSER_* to connect, then applies MASTER_DB_* for the app role.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const {
  MASTER_DB_HOST = '127.0.0.1',
  MASTER_DB_PORT = '5432',
  MASTER_DB_USER = 'erp',
  MASTER_DB_PASSWORD = 'admin',
  MASTER_DB_NAME = 'erp_master',
  DEMO_TENANT_DB_NAME = 'erp_tenant_demo',
  PG_SUPERUSER = 'postgres',
  PG_SUPERUSER_PASSWORD = 'admin',
} = process.env;

async function ensureRole(client) {
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [MASTER_DB_USER],
  );
  const pwd = MASTER_DB_PASSWORD.replace(/'/g, "''");
  const role = MASTER_DB_USER.replace(/"/g, '');
  if (rowCount === 0) {
    await client.query(
      `CREATE ROLE "${role}" LOGIN CREATEDB PASSWORD '${pwd}'`,
    );
    console.log(`Created role ${MASTER_DB_USER}`);
  } else {
    await client.query(`ALTER ROLE "${role}" LOGIN CREATEDB PASSWORD '${pwd}'`);
    console.log(`Updated role ${MASTER_DB_USER}`);
  }
}

async function ensureDb(client, name) {
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [name],
  );
  const db = name.replace(/"/g, '');
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${db}" OWNER "${MASTER_DB_USER.replace(/"/g, '')}"`);
    console.log(`Created database ${name}`);
  } else {
    console.log(`Database exists ${name}`);
  }
}

async function main() {
  const client = new pg.Client({
    host: MASTER_DB_HOST,
    port: Number(MASTER_DB_PORT),
    user: PG_SUPERUSER,
    password: PG_SUPERUSER_PASSWORD,
    database: 'postgres',
  });

  await client.connect();
  console.log(
    `Connected as ${PG_SUPERUSER}@${MASTER_DB_HOST}:${MASTER_DB_PORT}`,
  );

  try {
    await ensureRole(client);
    await ensureDb(client, MASTER_DB_NAME);
    await ensureDb(client, DEMO_TENANT_DB_NAME);

    for (const db of [MASTER_DB_NAME, DEMO_TENANT_DB_NAME]) {
      await client.query(
        `GRANT ALL PRIVILEGES ON DATABASE "${db.replace(/"/g, '')}" TO "${MASTER_DB_USER.replace(/"/g, '')}"`,
      );
    }
    console.log(`Granted privileges to ${MASTER_DB_USER}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
