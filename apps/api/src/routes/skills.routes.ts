/** GET /api/skills — list the fixed set of skills. */
import { SkillSchema } from '@htx/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import { listSkills } from '../modules/skills/skills.repo.js';

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
  };
}
