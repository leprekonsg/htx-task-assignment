import { z } from 'zod';

/** Machine-readable error codes. HTTP status is chosen by the API from the code (400 / 404 / 409 / 500). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'TASK_NOT_FOUND',
  'DEVELOPER_NOT_FOUND',
  'SKILL_NOT_FOUND',
  'PARENT_NOT_FOUND',
  'MAX_DEPTH_EXCEEDED',
  'DEVELOPER_LACKS_SKILLS',
  'SUBTASKS_NOT_DONE',
  'ANCESTOR_IS_DONE',
  'PARENT_IS_DONE',
  'INTERNAL_ERROR',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
