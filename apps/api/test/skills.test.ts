/** GET /api/skills. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase } from './helpers/db.js';

describe('GET /api/skills', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the seeded skills', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/skills' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: 1, name: 'Frontend' },
      { id: 2, name: 'Backend' },
    ]);
  });
});
