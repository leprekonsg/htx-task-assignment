/**
 * Builds the Fastify application: Zod validation/serialization, Swagger docs, routes and the
 * error handler. Does not listen — that is `server.ts`'s job, so tests can `app.inject()` instead.
 */
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import type { SkillClassifier } from './llm/classifier.js';
import { TasksService } from './modules/tasks/tasks.service.js';
import { developersRoutes } from './routes/developers.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { skillsRoutes } from './routes/skills.routes.js';
import { tasksRoutes } from './routes/tasks.routes.js';

export interface BuildAppDeps {
  pool: Pool;
  classifier: SkillClassifier;
  config: Config;
  logger?: FastifyServerOptions['logger'];
}

/** development gets pretty-printed logs, test is silent by default, everything else logs plain JSON. */
function resolveLogger(config: Config, logger?: FastifyServerOptions['logger']) {
  if (logger !== undefined) return logger;
  if (config.NODE_ENV === 'test') return false;
  if (config.NODE_ENV === 'development') {
    return {
      level: config.LOG_LEVEL,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    };
  }
  return { level: config.LOG_LEVEL };
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { pool, classifier, config } = deps;

  const app = Fastify({
    logger: resolveLogger(config, deps.logger),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Set before any plugin/route is registered: Fastify captures the error/not-found handler that is
  // in effect at the moment a child plugin is registered (not lazily at request time), so setting these
  // after `app.register(...)` would leave every route registered through a child context (e.g. our
  // route plugins, which register under the `/api` prefix) on Fastify's default handlers instead of ours.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
      return;
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
        },
      });
      return;
    }
    if (isResponseSerializationError(error)) {
      request.log.error(error, 'response serialization failed');
      reply
        .status(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
      return;
    }
    request.log.error(error, 'unhandled error');
    reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Task Assignment API',
        version: '1.0.0',
        description: 'Assign tasks to developers by skill, with subtasks and LLM-inferred skills.',
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  const tasksService = new TasksService(pool, classifier);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(skillsRoutes(pool), { prefix: '/api' });
  await app.register(developersRoutes(pool), { prefix: '/api' });
  await app.register(tasksRoutes(tasksService), { prefix: '/api' });

  return app;
}
