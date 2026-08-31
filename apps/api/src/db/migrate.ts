import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** `apps/api/migrations` — resolved relative to this module so it works from src (tsx) and dist (node). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const SEED_FILE = 'seed.sql';
/** Arbitrary constant; serialises concurrent migrators (e.g. two API replicas starting together). */
const ADVISORY_LOCK_KEY = 7_248_301;

/**
 * Minimal forward-only migration runner: every `NNNN_name.sql` not yet recorded in `schema_migrations`
 * is applied in filename order, each in its own transaction, then recorded.
 */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const done = new Set(rows.map((r) => r.version));
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      const sql = await readFile(new URL(file, `file://${dir}`), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed: ${(error as Error).message}`, {
          cause: error,
        });
      }
      applied.push(version);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
}

/** Applies `seed.sql` (idempotent) — the developers and skills from the assignment. */
export async function runSeed(pool: Pool, dir = MIGRATIONS_DIR): Promise<void> {
  const sql = await readFile(new URL(SEED_FILE, `file://${dir}`), 'utf8');
  await pool.query(sql);
}
