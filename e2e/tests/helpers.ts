// Shared helpers for the e2e specs. Tests run against a live, shared database, so every task they
// create gets a unique suffix and assertions always scope to "the row whose title is X".
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const SKILL_IDS = { Frontend: 1, Backend: 2 } as const;
export const DEVELOPER_IDS = { Alice: 1, Bob: 2, Carol: 3, Dave: 4 } as const;

export function uniqueTitle(base: string): string {
  return `${base} [e2e ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}]`;
}

/** Create a task (or tree) through the API when the UI is not what the test is about. */
export async function createTaskViaApi(
  request: APIRequestContext,
  body: { title: string; skillIds?: number[]; subtasks?: unknown[] },
): Promise<{ id: number; subtasks: { id: number; subtasks: unknown[] }[] }> {
  const response = await request.post('/api/tasks', { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

/** The table row for a task title (exact text match on the Title cell). */
export function rowFor(page: Page, title: string): Locator {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: title, exact: true }) });
}

/**
 * The hierarchical-number cell of a task's row ("1.2"). Deliberately a helper rather than an
 * index at every call site: the number is the second cell, because the first is the fold gutter
 * that holds the disclosure toggle. If the columns ever move again, they move here once.
 */
export function numberCell(page: Page, title: string): Locator {
  return rowFor(page, title).getByRole('cell').nth(1);
}

export function statusSelect(page: Page, title: string): Locator {
  return page.getByLabel(`Status of ${title}`, { exact: true });
}

export function assigneeSelect(page: Page, title: string): Locator {
  return page.getByLabel(`Assignee of ${title}`, { exact: true });
}

/** The inline error shown under a row after a rejected change. */
export function rowAlert(page: Page, text: string | RegExp): Locator {
  return page.getByRole('alert').filter({ hasText: text });
}
