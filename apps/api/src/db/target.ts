/**
 * Which database a command is about to touch, and whether it is one the person running the command
 * can be assumed to own.
 *
 * `demo` and `empty` truncate every task. They read the same `DATABASE_URL` as everything else, so a
 * `.env` left pointing at a shared or deployed database would be emptied exactly as willingly as a
 * local one — and the only warning would be the row count in the output, after the fact.
 *
 * The guard is deliberately dumb: an allowlist of hosts that can only mean "this machine" or "this
 * compose project", and `--force` for someone who really does mean the other thing. It is a
 * misfire-catcher, not a security boundary — anyone with the URL can still run psql.
 */

export interface DatabaseTarget {
  /** Host from the URL, lowercased; null if the URL could not be parsed. */
  host: string | null;
  database: string | null;
  isLocal: boolean;
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '::1',
  'host.docker.internal', // this machine, seen from inside a container
  'db', // the Postgres service in this project's docker-compose.yml
]);

export function describeTarget(databaseUrl: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Unparseable means unknown, and unknown is not local: better to ask than to guess and truncate.
    return { host: null, database: null, isLocal: false };
  }

  // `hostname` keeps the brackets round an IPv6 literal — `[::1]` — so take them off before
  // comparing, or the loopback address nobody writes by hand is the one the guard doesn't know.
  const host = url.hostname.toLowerCase().replace(/^\[(.+)\]$/, '$1');
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || null;
  const isLocal =
    LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(host);

  return { host: host || null, database, isLocal };
}

/** For the operator: what is about to be changed, in the words they'd use to describe it. */
export function formatTarget(target: DatabaseTarget): string {
  return `${target.database ?? '(unknown database)'} on ${target.host ?? '(unparseable DATABASE_URL)'}`;
}

/**
 * Throws unless the target is local or `force` was passed. Returns the target so the caller can say
 * out loud what it is about to replace.
 */
export function assertLocalTarget(
  command: string,
  databaseUrl: string,
  force: boolean,
): DatabaseTarget {
  const target = describeTarget(databaseUrl);
  if (target.isLocal || force) return target;

  throw new Error(
    `Refusing to run "${command}" against ${formatTarget(target)}, which doesn't look like a ` +
      `local database. This command replaces every task in it. Re-run with --force if that is ` +
      `really what you want.`,
  );
}
