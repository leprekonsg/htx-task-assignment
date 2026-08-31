import pg from 'pg';

export type { Pool, PoolClient } from 'pg';
/** Anything we can run a query on: the pool (auto-checkout) or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Run `fn` inside BEGIN/COMMIT on one dedicated connection; ROLLBACK on any throw.
 * Default isolation (READ COMMITTED) is what the Rule B locking design relies on.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
