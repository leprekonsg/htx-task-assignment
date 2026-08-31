import { z } from 'zod';
import { IdSchema, SkillSchema } from './skill.js';

export const DeveloperSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  skills: z.array(SkillSchema),
});
export type Developer = z.infer<typeof DeveloperSchema>;
