import { describe, expect, it } from 'vitest';
import {
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  collapsibleTaskIds,
  countDescendants,
  countDoneDescendants,
  flattenTaskTree,
  flattenVisibleTaskTree,
  taskTreeDepth,
  type Task,
} from './task.js';

const leaf = (title: string) => ({ title });

describe('CreateTaskRequestSchema', () => {
  it('accepts a nested tree up to depth 5', () => {
    const req = {
      title: '1',
      subtasks: [
        {
          title: '1.1',
          subtasks: [
            { title: '1.1.1', subtasks: [{ title: '1.1.1.1', subtasks: [leaf('1.1.1.1.1')] }] },
          ],
        },
      ],
    };
    expect(taskTreeDepth(req)).toBe(5);
    expect(CreateTaskRequestSchema.safeParse(req).success).toBe(true);
  });
  it('rejects depth 6', () => {
    const req = {
      title: '1',
      subtasks: [
        {
          title: '2',
          subtasks: [
            {
              title: '3',
              subtasks: [{ title: '4', subtasks: [{ title: '5', subtasks: [leaf('6')] }] }],
            },
          ],
        },
      ],
    };
    const result = CreateTaskRequestSchema.safeParse(req);
    expect(result.success).toBe(false);
  });
  it('rejects empty / whitespace / over-long titles', () => {
    expect(CreateTaskRequestSchema.safeParse({ title: '' }).success).toBe(false);
    expect(CreateTaskRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(CreateTaskRequestSchema.safeParse({ title: 'x'.repeat(501) }).success).toBe(false);
    expect(CreateTaskRequestSchema.safeParse({ title: 'x'.repeat(500) }).success).toBe(true);
  });
  it('rejects duplicate skill ids in one node', () => {
    expect(CreateTaskRequestSchema.safeParse({ title: 'a', skillIds: [1, 1] }).success).toBe(false);
    expect(CreateTaskRequestSchema.safeParse({ title: 'a', skillIds: [1, 2] }).success).toBe(true);
  });
});

describe('UpdateTaskRequestSchema', () => {
  it('requires at least one field and allows null assignee', () => {
    expect(UpdateTaskRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateTaskRequestSchema.safeParse({ assigneeId: null }).success).toBe(true);
    expect(UpdateTaskRequestSchema.safeParse({ status: 'done' }).success).toBe(true);
    expect(UpdateTaskRequestSchema.safeParse({ status: 'finished' }).success).toBe(false);
  });
});

const task = (id: number, subtasks: Task[] = []): Task => ({
  id,
  title: `t${id}`,
  status: 'todo',
  parentId: null,
  assignee: null,
  skills: [],
  skillsSource: 'user',
  skillsModel: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  subtasks,
});

/** 1 → (1.1, 1.2 → 1.2.1), 2 — the smallest forest with a branch, a leaf and a grandchild. */
const forest = () => [task(1, [task(2), task(3, [task(4)])]), task(5)];

describe('flattenTaskTree', () => {
  it('numbers rows hierarchically', () => {
    const rows = flattenTaskTree(forest());
    expect(rows.map((r) => [r.number, r.task.id, r.depth])).toEqual([
      ['1', 1, 0],
      ['1.1', 2, 1],
      ['1.2', 3, 1],
      ['1.2.1', 4, 2],
      ['2', 5, 0],
    ]);
  });
  it('counts the whole subtree under each row, not just its children', () => {
    const rows = flattenTaskTree(forest());
    expect(rows.map((r) => [r.number, r.descendantCount])).toEqual([
      ['1', 3],
      ['1.1', 0],
      ['1.2', 1],
      ['1.2.1', 0],
      ['2', 0],
    ]);
    expect(countDescendants(task(9))).toBe(0);
  });
});

describe('flattenVisibleTaskTree', () => {
  it('keeps a collapsed task and drops its whole subtree', () => {
    const rows = flattenVisibleTaskTree(forest(), new Set([1]));
    expect(rows.map((r) => r.number)).toEqual(['1', '2']);
    // The folded row still knows how much it is standing in for.
    expect(rows[0]!.descendantCount).toBe(3);
  });
  it('numbers siblings from the tree, so folding never renumbers what is left', () => {
    const collapsed = flattenVisibleTaskTree(forest(), new Set([3]));
    expect(collapsed.map((r) => [r.number, r.task.id])).toEqual([
      ['1', 1],
      ['1.1', 2],
      ['1.2', 3],
      ['2', 5],
    ]);
    // Every surviving row has the number it had when nothing was folded.
    const expanded = new Map(flattenTaskTree(forest()).map((r) => [r.task.id, r.number]));
    for (const row of collapsed) expect(row.number).toBe(expanded.get(row.task.id));
  });
  it('folds a parent even when a descendant is also collapsed', () => {
    expect(flattenVisibleTaskTree(forest(), new Set([1, 3])).map((r) => r.number)).toEqual([
      '1',
      '2',
    ]);
  });
  it('with nothing collapsed, matches the full flattening', () => {
    expect(flattenVisibleTaskTree(forest(), new Set())).toEqual(flattenTaskTree(forest()));
  });
  it('ignores ids that are not in the tree', () => {
    expect(flattenVisibleTaskTree(forest(), new Set([999]))).toEqual(flattenTaskTree(forest()));
  });
});

describe('countDoneDescendants', () => {
  const done = (id: number, subtasks: Task[] = []): Task => ({
    ...task(id, subtasks),
    status: 'done',
  });

  it('counts Done tasks at every depth, which is the depth Rule B checks', () => {
    // 1 → (1.1 done, 1.2 done → 1.2.1 still to-do): 2 of 3 descendants are done, so the parent
    // cannot be closed yet — even though both of its *children* are.
    const root = task(1, [done(2), done(3, [task(4)])]);
    expect(countDescendants(root)).toBe(3);
    expect(countDoneDescendants(root)).toBe(2);
  });
  it('is 0 for a leaf', () => {
    expect(countDoneDescendants(task(1))).toBe(0);
  });
});

describe('collapsibleTaskIds', () => {
  it('lists every task that has subtasks, at any depth', () => {
    expect(collapsibleTaskIds(forest())).toEqual([1, 3]);
  });
  it('is empty for a flat list, which is how the UI knows not to offer Collapse all', () => {
    expect(collapsibleTaskIds([task(1), task(2)])).toEqual([]);
  });
});
