/** Builds the app under test: the shared test pool, a `FakeClassifier`, and config pointed at TEST_DATABASE_URL. */
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { getTestPool, TEST_DATABASE_URL } from './db.js';
import { FakeClassifier } from './fake-classifier.js';

export interface TestApp {
  app: FastifyInstance;
  classifier: FakeClassifier;
}

export async function buildTestApp(): Promise<TestApp> {
  const classifier = new FakeClassifier();
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    GEMINI_API_KEY: '',
  });
  const app = await buildApp({ pool: getTestPool(), classifier, config });
  return { app, classifier };
}
