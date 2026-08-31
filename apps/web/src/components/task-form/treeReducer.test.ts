// Tests for treeReducer.ts. Because the reducer is a pure function (state in, state out — no DOM,
// no React), these tests call it directly and check the returned tree; nothing is rendered. The
// three things worth testing about a tree reducer: it edits the right node, it never mutates a node
// it wasn't asked to touch (checked with `toBe`, which compares object identity, not just shape),
// and it respects the app's structural rules (max depth, root can't be removed). Below that are
// tests for the small pure helpers this module also exports: `taskNumber`, `countNodes`,
// `anyNodeWithoutSkills`, and `firstProblem` (which now carries the offending node's `key`).
import { describe, expect, it } from 'vitest';
import {
  anyNodeWithoutSkills,
  countNodes,
  createInitialState,
  depthAt,
  firstProblem,
  taskNumber,
  toCreateRequest,
  treeReducer,
  type FormState,
} from './treeReducer';

describe('treeReducer', () => {
  it('sets the root title without touching anything else', () => {
    const state = createInitialState();
    const next = treeReducer(state, { type: 'setTitle', path: [], title: 'Ship it' });
    expect(next.root.title).toBe('Ship it');
    expect(next).not.toBe(state);
  });

  it('adds a subtask under the root', () => {
    const state = createInitialState();
    const next = treeReducer(state, { type: 'addSubtask', path: [] });
    expect(next.root.subtasks).toHaveLength(1);
    expect(next.root.subtasks[0]!.title).toBe('');
    expect(next.nextKey).toBe(state.nextKey + 1);
  });

  it('sets the title of a nested subtask by path', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [0] });
    const next = treeReducer(state, { type: 'setTitle', path: [0, 0], title: 'Nested task' });
    expect(next.root.subtasks[0]!.subtasks[0]!.title).toBe('Nested task');
  });

  it('toggles a skill on and back off', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 2 });
    expect(state.root.skillIds).toEqual([2]);
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 2 });
    expect(state.root.skillIds).toEqual([]);
  });

  it('keeps skillIds sorted', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 5 });
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 1 });
    expect(state.root.skillIds).toEqual([1, 5]);
  });

  it('removes a subtask by path', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    expect(state.root.subtasks).toHaveLength(2);
    const next = treeReducer(state, { type: 'removeNode', path: [0] });
    expect(next.root.subtasks).toHaveLength(1);
    // the surviving subtask is the one that used to be second
    expect(next.root.subtasks[0]!.key).toBe(state.root.subtasks[1]!.key);
  });

  it('is a no-op when asked to remove the root', () => {
    const state = createInitialState();
    const next = treeReducer(state, { type: 'removeNode', path: [] });
    expect(next).toBe(state);
    expect(next.root.title).toBe('');
  });

  it('does not touch a sibling subtree when editing another branch (structural sharing)', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    const untouchedSibling = state.root.subtasks[1]!;

    const next = treeReducer(state, { type: 'setTitle', path: [0], title: 'Only this one' });

    expect(next.root.subtasks[1]).toBe(untouchedSibling);
    expect(next.root.subtasks[0]).not.toBe(state.root.subtasks[0]);
  });

  it('rejects addSubtask once the tree is already at the maximum depth', () => {
    let state = createInitialState();
    // Build a chain down to depth 5 (path length 4): root -> [0] -> [0,0] -> [0,0,0] -> [0,0,0,0]
    let path: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = treeReducer(state, { type: 'addSubtask', path });
      path = [...path, 0];
    }
    expect(depthAt(path)).toBe(5);

    const beforeAdd: FormState = state;
    const next = treeReducer(state, { type: 'addSubtask', path });
    expect(next).toBe(beforeAdd); // no-op: adding here would exceed MAX_TASK_DEPTH
  });
});

describe('toCreateRequest', () => {
  it('trims titles and omits empty skillIds/subtasks', () => {
    const state = createInitialState();
    const withTitle = treeReducer(state, { type: 'setTitle', path: [], title: '  Fix bug  ' });
    const request = toCreateRequest(withTitle.root);
    expect(request).toEqual({ title: 'Fix bug' });
    expect(request).not.toHaveProperty('skillIds');
    expect(request).not.toHaveProperty('subtasks');
  });

  it('includes skillIds and nested subtasks when present', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'setTitle', path: [], title: 'Parent' });
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 3 });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'setTitle', path: [0], title: 'Child' });

    const request = toCreateRequest(state.root);
    expect(request).toEqual({
      title: 'Parent',
      skillIds: [3],
      subtasks: [{ title: 'Child' }],
    });
  });
});

describe('firstProblem', () => {
  it('is null when every title is filled in', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'setTitle', path: [], title: 'Root' });
    expect(firstProblem(state.root)).toBeNull();
  });

  it('reports the root when its title is empty, including its key', () => {
    const state = createInitialState();
    expect(firstProblem(state.root)).toEqual({
      path: [],
      key: state.root.key,
      message: 'Title is required',
    });
  });

  it("finds the first empty title by path, depth-first, and reports that node's key", () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'setTitle', path: [], title: 'Root' });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'setTitle', path: [0], title: 'First child' });
    // path [1] (second child) is left blank

    const problem = firstProblem(state.root);
    expect(problem).toEqual({
      path: [1],
      key: state.root.subtasks[1]!.key,
      message: 'Title is required',
    });
  });
});

describe('taskNumber', () => {
  it('is "1" for the root', () => {
    expect(taskNumber([])).toBe('1');
  });

  it('is dotted for nested paths', () => {
    expect(taskNumber([1])).toBe('1.2');
    expect(taskNumber([1, 0])).toBe('1.2.1');
  });
});

describe('countNodes', () => {
  it('is 1 for a lone root', () => {
    const state = createInitialState();
    expect(countNodes(state.root)).toBe(1);
  });

  it('counts the node plus every descendant', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [0] });
    // root -> two children, the first of which has one child of its own: 4 nodes total.
    expect(countNodes(state.root)).toBe(4);
  });
});

describe('anyNodeWithoutSkills', () => {
  it('is true for a freshly created root (no skills chosen)', () => {
    const state = createInitialState();
    expect(anyNodeWithoutSkills(state.root)).toBe(true);
  });

  it('is false once every node in the tree has at least one skill', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 1 });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'toggleSkill', path: [0], skillId: 2 });
    expect(anyNodeWithoutSkills(state.root)).toBe(false);
  });

  it('is true when a deeply nested descendant is missing skills, even if the root has some', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'toggleSkill', path: [], skillId: 1 });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    // child at [0] has no skills
    expect(anyNodeWithoutSkills(state.root)).toBe(true);
  });
});
