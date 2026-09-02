/** GET /api/skills, GET /api/skills/:id. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase } from './helpers/db.js';

describe('skills', () => {
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

  it('GET /api/skills/:id returns one skill', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/skills/2' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 2, name: 'Backend' });
  });

  it('GET /api/skills/999 returns 404 SKILL_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/skills/999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKILL_NOT_FOUND');
  });
});
