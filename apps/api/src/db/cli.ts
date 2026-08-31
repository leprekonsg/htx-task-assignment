/**
 * `node dist/db/cli.js migrate` — apply pending migrations, then the seed.
 * Used by the `migrate` service in docker-compose and by `npm run db:migrate` in development.
 */
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { runMigrations, runSeed } from './migrate.js';

const command = process.argv[2] ?? 'migrate';
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);

try {
  if (command !== 'migrate') throw new Error(`Unknown command "${command}". Usage: cli.js migrate`);
  const applied = await runMigrations(pool);
  console.log(
    applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Migrations up to date',
  );
  await runSeed(pool);
  console.log('Seed applied');
} finally {
  await pool.end();
}
