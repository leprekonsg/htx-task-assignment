// Tests for treeReducer.ts. Because the reducer is a pure function (state in, state out — no DOM,
// no React), these tests call it directly and check the returned tree; nothing is rendered. The
// three things worth testing about a tree reducer: it edits the right node, it never mutates a node
// it wasn't asked to touch (checked with `toBe`, which compares object identity, not just shape),
// and it respects the app's structural rules (max depth, root can't be removed).
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  depthAt,
  firstProblem,
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

  it('reports the root when its title is empty', () => {
    const state = createInitialState();
    expect(firstProblem(state.root)).toEqual({ path: [], message: 'Title is required' });
  });

  it('finds the first empty title by path, depth-first', () => {
    let state = createInitialState();
    state = treeReducer(state, { type: 'setTitle', path: [], title: 'Root' });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'addSubtask', path: [] });
    state = treeReducer(state, { type: 'setTitle', path: [0], title: 'First child' });
    // path [1] (second child) is left blank

    const problem = firstProblem(state.root);
    expect(problem).toEqual({ path: [1], message: 'Title is required' });
  });
});
