/**
 * `node dist/db/cli.js <command> [--force]` — everything that has to happen to a database from
 * outside the running server.
 *
 *   migrate  apply pending migrations, then the seed. Used by the `migrate` service in
 *            docker-compose and by `npm run db:migrate`.
 *   demo     load the demo tasks (see demo.ts) — a tree per thing the UI can show.
 *   empty    remove every task, leaving the seeded developers and skills.
 *
 * `demo` and `empty` migrate first, so either works on a database that has only just been created.
 * Neither is reachable over HTTP: replacing every task is a thing you do to your own machine on
 * purpose, not an endpoint the API should carry. For the same reason both refuse a `DATABASE_URL`
 * that doesn't look local unless `--force` says otherwise (see target.ts) — the usual way to lose
 * data here is a `.env` still pointing somewhere else, not a mistyped command.
 */
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { loadDemoState, loadEmptyState } from './demo.js';
import { runMigrations, runSeed } from './migrate.js';
import { assertLocalTarget, formatTarget } from './target.js';

const COMMANDS = ['migrate', 'demo', 'empty'] as const;
type Command = (typeof COMMANDS)[number];

/**
 * For the two things that aren't faults but decisions — you asked for a command that doesn't exist,
 * or for a database this won't touch. Both deserve a sentence and a non-zero exit, not a stack
 * trace; anything that genuinely goes wrong later still throws and shows where.
 */
function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const command = args.find((arg) => !arg.startsWith('--')) ?? 'migrate';
if (!COMMANDS.includes(command as Command)) {
  refuse(`Unknown command "${command}". Usage: cli.js <${COMMANDS.join('|')}> [--force]`);
}

const config = loadConfig();

// Checked before a connection is opened, let alone a migration applied.
if (command !== 'migrate') {
  try {
    const target = assertLocalTarget(command, config.DATABASE_URL, force);
    console.log(`Target: ${formatTarget(target)}${target.isLocal ? '' : ' (forced)'}`);
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error));
  }
}

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
