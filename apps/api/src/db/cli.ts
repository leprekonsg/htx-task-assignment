/**
 * `node dist/db/cli.js <command>` — everything that has to happen to a database from outside the
 * running server.
 *
 *   migrate  apply pending migrations, then the seed. Used by the `migrate` service in
 *            docker-compose and by `npm run db:migrate`.
 *   demo     load the demo tasks (see demo.ts) — a tree per thing the UI can show.
 *   empty    remove every task, leaving the seeded developers and skills.
 *
 * `demo` and `empty` migrate first, so either works on a database that has only just been created.
 * Neither is reachable over HTTP: replacing every task is a thing you do to your own machine on
 * purpose, not an endpoint the API should carry.
 */
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { loadDemoState, loadEmptyState } from './demo.js';
import { runMigrations, runSeed } from './migrate.js';

const COMMANDS = ['migrate', 'demo', 'empty'] as const;
type Command = (typeof COMMANDS)[number];

const command = process.argv[2] ?? 'migrate';
if (!COMMANDS.includes(command as Command)) {
  throw new Error(`Unknown command "${command}". Usage: cli.js <${COMMANDS.join('|')}>`);
}

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);

try {
  const applied = await runMigrations(pool);
  console.log(
    applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Migrations up to date',
  );
  await runSeed(pool);
  console.log('Seed applied');

  if (command === 'demo') {
    const { removed, created } = await loadDemoState(pool);
    console.log(`Demo data loaded: ${created} tasks (${removed} removed)`);
  } else if (command === 'empty') {
    const { removed } = await loadEmptyState(pool);
    console.log(`Tasks cleared: ${removed} removed`);
  }
} finally {
  await pool.end();
}
