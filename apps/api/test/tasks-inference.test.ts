/** POST /api/tasks — skill inference via the (fake) classifier. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

describe('POST /api/tasks — inference', () => {
  let app: FastifyInstance;
  let classifier: TestApp['classifier'];

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app, classifier } = await buildTestApp());
  });

  beforeEach(async () => {
    await truncateTasks(getTestPool());
    classifier.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('infers skills for a task created without skillIds', async () => {
    classifier.resolveWith([{ ref: '0', skills: ['Frontend'] }], 'fake-model-x');

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Style the login page' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.skills).toEqual([{ id: 1, name: 'Frontend' }]);
    expect(body.skillsSource).toBe('llm');
    expect(body.skillsModel).toBe('fake-model-x');

    expect(classifier.calls).toHaveLength(1);
    expect(classifier.calls[0]!.items).toEqual([{ ref: '0', title: 'Style the login page' }]);
    expect(classifier.calls[0]!.allowedSkills).toEqual(['Frontend', 'Backend']);
  });

  it('leaves a task unresolved when the classifier fails', async () => {
    classifier.failWith('quota exceeded');

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Do something' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.skills).toEqual([]);
    expect(body.skillsSource).toBe('unresolved');
    expect(body.skillsModel).toBeNull();
  });

  it('accepts an empty skills array from the classifier as a resolved (llm) result', async () => {
    classifier.resolveWith([{ ref: '0', skills: [] }]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Book a meeting room' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.skills).toEqual([]);
    expect(body.skillsSource).toBe('llm');
  });

  it('batches multiple nodes lacking skills into one classifier call, by path ref', async () => {
    classifier.resolveWith([
      { ref: '0', skills: ['Frontend'] },
      { ref: '0.0', skills: ['Backend'] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'root',
        subtasks: [{ title: 'child-infer' }, { title: 'child-user', skillIds: [2] }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.skills).toEqual([{ id: 1, name: 'Frontend' }]);
    expect(body.subtasks[0].title).toBe('child-infer');
    expect(body.subtasks[0].skills).toEqual([{ id: 2, name: 'Backend' }]);
    expect(body.subtasks[0].skillsSource).toBe('llm');
    expect(body.subtasks[1].title).toBe('child-user');
    expect(body.subtasks[1].skillsSource).toBe('user');

    expect(classifier.calls).toHaveLength(1);
    expect(classifier.calls[0]!.items).toEqual([
      { ref: '0', title: 'root' },
      { ref: '0.0', title: 'child-infer' },
    ]);
  });

  it('drops a skill name the classifier returns that is not in the allowed list', async () => {
    classifier.resolveWith([{ ref: '0', skills: ['Nonexistent'] }]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'something odd' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.skills).toEqual([]);
    expect(body.skillsSource).toBe('llm');
  });

  it('maps mixed-case skill names from the classifier', async () => {
    classifier.resolveWith([{ ref: '0', skills: ['frontend'] }]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'lowercase skill name' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().skills).toEqual([{ id: 1, name: 'Frontend' }]);
  });
});
