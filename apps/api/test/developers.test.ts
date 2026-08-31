/** GET /api/developers, GET /api/developers/:id. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase } from './helpers/db.js';

describe('developers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const frontend = { id: 1, name: 'Frontend' };
  const backend = { id: 2, name: 'Backend' };

  it('GET /api/developers lists Alice, Bob, Carol, Dave with their seeded skills', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/developers' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: 1, name: 'Alice', skills: [frontend] },
      { id: 2, name: 'Bob', skills: [backend] },
      { id: 3, name: 'Carol', skills: [frontend, backend] },
      { id: 4, name: 'Dave', skills: [backend] },
    ]);
  });

  it('GET /api/developers/:id returns one developer', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/developers/3' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 3, name: 'Carol', skills: [frontend, backend] });
  });

  it('GET /api/developers/999 returns 404 DEVELOPER_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/developers/999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DEVELOPER_NOT_FOUND');
  });
});
