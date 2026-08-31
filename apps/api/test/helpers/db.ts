/** Test database helpers: a pool for `taskapp_test`, a full reset, and a fast per-test truncate. */
import pg from 'pg';
import { runMigrations, runSeed } from '../../src/db/migrate.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://taskapp:taskapp@localhost:5432/taskapp_test';

let pool: pg.Pool | undefined;

/** One pool per test file/process — tests run serially (see vitest.config.ts), so this is safe to share. */
export function getTestPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  return pool;
}

/** Drops and recreates the schema, then re-applies migrations and the seed. Slow — call once per file. */
export async function resetDatabase(db: pg.Pool): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await runMigrations(db);
  await runSeed(db);
}

/** Wipes tasks (and task_skills, via cascade) between tests. Developers/skills stay seeded. */
export async function truncateTasks(db: pg.Pool): Promise<void> {
  await db.query('TRUNCATE tasks RESTART IDENTITY CASCADE');
}
