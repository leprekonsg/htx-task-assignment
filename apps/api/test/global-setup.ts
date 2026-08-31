/**
 * Vitest global setup: runs once before the whole suite, in its own process. Connects to the
 * server's `postgres` database and creates `taskapp_test` if it doesn't exist yet.
 */
import pg from 'pg';
import { TEST_DATABASE_URL } from './helpers/db.js';

export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const dbName = target.pathname.slice(1);
  if (!dbName) throw new Error(`TEST_DATABASE_URL has no database name: ${TEST_DATABASE_URL}`);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}
