import { z } from 'zod';

export const IdSchema = z.number().int().positive();

export const SkillSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
});
export type Skill = z.infer<typeof SkillSchema>;
