import { describe, expect, it } from 'vitest';
import {
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  flattenTaskTree,
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

describe('flattenTaskTree', () => {
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
  it('numbers rows hierarchically', () => {
    const rows = flattenTaskTree([task(1, [task(2), task(3, [task(4)])]), task(5)]);
    expect(rows.map((r) => [r.number, r.task.id, r.depth])).toEqual([
      ['1', 1, 0],
      ['1.1', 2, 1],
      ['1.2', 3, 1],
      ['1.2.1', 4, 2],
      ['2', 5, 0],
    ]);
  });
});
