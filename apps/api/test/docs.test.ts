/** Swagger docs: GET /docs/json and GET /docs. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase } from './helpers/db.js';

describe('API docs', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /docs/json returns a valid OpenAPI document describing /api/tasks', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info.title).toBe('Task Assignment API');
    expect(body.paths['/api/tasks']).toBeDefined();
    expect(body.paths['/api/tasks'].get).toBeDefined();
    expect(body.paths['/api/tasks'].post).toBeDefined();
    expect(body.paths['/api/tasks/{id}'].patch).toBeDefined();
    // The recursive Task schema must resolve to a $ref, not error out or inline forever.
    const taskResponse =
      body.paths['/api/tasks/{id}'].get.responses['200'].content['application/json'].schema;
    expect(taskResponse.$ref).toBe('#/components/schemas/Task');
    expect(body.components.schemas.Task.properties.subtasks.items.$ref).toBe(
      '#/components/schemas/Task',
    );
  });

  it('GET /docs is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(res.statusCode);
    if (res.statusCode === 302) {
      const redirected = await app.inject({ method: 'GET', url: res.headers.location as string });
      expect(redirected.statusCode).toBe(200);
    }
  });
});
