/*
 * Thin wrapper around `fetch` for talking to the API. Every route under `/api` returns either the
 * requested data as plain JSON (a `Task`, a `Task[]`, ...) or, on failure, an error envelope shaped
 * like `{ error: { code, message, details? } }`. `ApiError` gives that envelope a proper JS
 * exception so callers can `catch (err)` and check `err instanceof ApiError` for `.code` / status,
 * or just show `.message` — the server writes that message for humans. `apiGet`/`apiPost`/
 * `apiPatch` are the only functions in the app that call `fetch` directly; everything else goes
 * through src/api/hooks.ts, which wraps these in TanStack Query.
 */
import type { ErrorResponse } from '@htx/shared';

export class ApiError extends Error {
  code: ErrorResponse['error']['code'];
  details: unknown;
  status: number;

  constructor(status: number, body: ErrorResponse) {
    super(body.error.message);
    this.name = 'ApiError';
    this.code = body.error.code;
    this.details = body.error.details;
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json()) as ErrorResponse;
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}
