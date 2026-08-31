/** GET /api/developers, GET /api/developers/:id. */
import { DeveloperSchema, ErrorResponseSchema } from '@htx/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import { AppError } from '../errors.js';
import { findDeveloperById, listDevelopers } from '../modules/developers/developers.repo.js';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export function developersRoutes(pool: Pool): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/developers',
      {
        schema: {
          tags: ['developers'],
          summary: 'List developers',
          response: { 200: z.array(DeveloperSchema) },
        },
      },
      async () => listDevelopers(pool),
    );

    app.get(
      '/developers/:id',
      {
        schema: {
          tags: ['developers'],
          summary: 'Get a developer',
          params: ParamsSchema,
          response: { 200: DeveloperSchema, 404: ErrorResponseSchema },
        },
      },
      async (request) => {
        const developer = await findDeveloperById(pool, request.params.id);
        if (!developer) {
          throw new AppError(
            'DEVELOPER_NOT_FOUND',
            `Developer ${request.params.id} does not exist`,
          );
        }
        return developer;
      },
    );
  };
}
