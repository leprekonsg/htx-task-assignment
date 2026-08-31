import type { ErrorCode } from '@htx/shared';

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  MAX_DEPTH_EXCEEDED: 400,
  TASK_NOT_FOUND: 404,
  DEVELOPER_NOT_FOUND: 404,
  SKILL_NOT_FOUND: 404,
  PARENT_NOT_FOUND: 404,
  DEVELOPER_LACKS_SKILLS: 409,
  SUBTASKS_NOT_DONE: 409,
  ANCESTOR_IS_DONE: 409,
  PARENT_IS_DONE: 409,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

/** A domain error the API maps to `{ error: { code, message, details } }` with the status implied by the code. */
export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = STATUS_BY_CODE[code];
  }
}
