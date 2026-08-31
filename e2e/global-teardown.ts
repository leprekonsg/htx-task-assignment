/**
 * Playwright `globalTeardown` (wired up in `playwright.config.ts`) — runs once, after every spec has
 * finished, whether the run passed or failed.
 *
 * Why this exists: `npm run test:e2e` runs against the real Compose stack (`docker compose up
 * --build`), and unlike CI — which throws its Postgres volume away after every job — a local
 * `pgdata` volume (`docker-compose.yml`) persists between runs. Every spec creates its tasks through
 * the real API with a unique, timestamped title (`uniqueTitle` in `tests/helpers.ts` always appends
 * ` [e2e <timestamp>-<random>]`) and none of them ever delete what they create. Run the suite a
 * handful of times against a running stack — the documented "reuse a running stack" flow
 * (`E2E_BASE_URL=http://localhost:8080 npm run test:e2e`) — and the task list a reviewer is meant to
 * look at quietly fills up with leftover fixture rows.
 *
 * The predicate: `title LIKE '%[e2e %'` matches only fixture rows. Every task any spec creates —
 * whether through `createTaskViaApi` or by filling in the create-task form — is titled via
 * `uniqueTitle`, so the marker is on all of them; specs that only assert on `400`/`404`/`409`
 * responses never get far enough to create a row at all. Nothing else in the suite writes to
 * `tasks`, so this can't reach the demo rows a reviewer adds by hand or the seeded
 * developers/skills. Subtask rows are removed for free: `tasks.parent_task_id` is
 * `ON DELETE CASCADE` (`apps/api/migrations/0002_subtasks.sql:4`), so deleting a root task deletes
 * its children and grandchildren with it, and `task_skills` cascades on `task_id` too
 * (`0001_init.sql:32`) — one statement covers the whole tree.
 *
 * Why this must never fail the run: teardown runs after Playwright has already recorded pass/fail
 * for every test, so a cleanup problem is not itself a reason to turn a green run red, or to bury a
 * real failure's output under a second, unrelated one. Every failure mode — wrong host, closed port,
 * bad credentials, a `E2E_BASE_URL` pointed at a remote/CI-style stack that doesn't publish Postgres
 * to the host at all — is caught and logged as a warning instead of thrown. The client also gets a
 * short connection/query timeout so a stack that's merely slow (rather than unreachable) can't hang
 * the whole run at the very end.
 */
import { Client } from 'pg';

/** Generous enough for a local `localhost:5432`, short enough not to stall the run if it's not there. */
const TIMEOUT_MS = 5_000;

/**
 * `Error#message` is unreliable here: a refused connection to "localhost" surfaces as an
 * `AggregateError` (Node tries both the IPv4 and IPv6 loopback addresses) whose own `.message` is
 * empty — the useful detail is on its nested `.errors`, or on `.code` (e.g. `ECONNREFUSED`).
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map(describeError).join('; ');
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return error.message || code || error.name;
  }
  return String(error);
}

export default async function globalTeardown(): Promise<void> {
  const connectionString =
    process.env.E2E_DATABASE_URL ?? 'postgresql://taskapp:taskapp@localhost:5432/taskapp';

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
  });

  try {
    await client.connect();
    const result = await client.query("DELETE FROM tasks WHERE title LIKE '%[e2e %'");
    console.log(`[e2e teardown] deleted ${result.rowCount ?? 0} fixture task(s)`);
  } catch (error) {
    console.warn(
      '[e2e teardown] skipped cleanup — could not reach the database to remove fixture tasks ' +
        '(set E2E_DATABASE_URL if the stack under test publishes Postgres somewhere other than ' +
        `localhost:5432, or leave it if this run targeted a remote stack on purpose): ${describeError(error)}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
