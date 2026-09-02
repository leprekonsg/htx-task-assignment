/** GET /api/skills, GET /api/skills/:id. */
import { ErrorResponseSchema, SkillSchema } from '@htx/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import { AppError } from '../errors.js';
import { findSkillById, listSkills } from '../modules/skills/skills.repo.js';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export function skillsRoutes(pool: Pool): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/skills',
      {
        schema: {
          tags: ['skills'],
          summary: 'List skills',
          response: { 200: z.array(SkillSchema) },
        },
      },
      async () => listSkills(pool),
    );

    app.get(
      '/skills/:id',
      {
        schema: {
          tags: ['skills'],
          summary: 'Get a skill',
          params: ParamsSchema,
          response: { 200: SkillSchema, 404: ErrorResponseSchema },
        },
      },
      async (request) => {
        const skill = await findSkillById(pool, request.params.id);
        if (!skill) {
          throw new AppError('SKILL_NOT_FOUND', `Skill ${request.params.id} does not exist`);
        }
        return skill;
      },
    );
  };
}
