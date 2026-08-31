/** Process entry point: load config, connect to Postgres, wire up the skill classifier, listen. */
import pino from 'pino';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createSkillClassifier } from './llm/index.js';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);

// A standalone logger for classifier fallback/retry logging, independent of the app's request logger
// (which is created inside buildApp) — this sidesteps needing the app before the classifier exists.
const startupLogger = pino({ level: config.LOG_LEVEL });
const classifier = createSkillClassifier(config, startupLogger);

const app = await buildApp({ pool, classifier, config });

app.log.info({ classifier: classifier.name }, 'skill classifier chain configured');

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (error) {
    app.log.error(error, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error, 'failed to start');
  process.exit(1);
}
