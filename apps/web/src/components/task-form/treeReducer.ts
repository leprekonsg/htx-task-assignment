/**
 * State model for the Create Task page. The form is a tree: one root task with nested subtasks
 * (1 → 1.1 → 1.1.1). Every edit is an action addressed by a `path` — the list of child indices from the
 * root — and the reducer returns a new tree without mutating the old one, which is what React needs to
 * re-render only what changed. Being a pure function, it is tested without rendering anything.
 *
 * Alongside the reducer this module exports the handful of small, pure helpers the page and
 * TaskNodeForm need to read the tree: `taskNumber` (path → "1.2.1"-style label), `countNodes`
 * (node + descendants, for the "Create N tasks" button label), `anyNodeWithoutSkills` (does any
 * node still need LLM inference, for the "this can take a few seconds" hint), and `firstProblem`
 * (the first missing title, for focus-and-alert on a failed submit attempt).
 */
import { MAX_TASK_DEPTH, type CreateTaskRequest } from '@htx/shared';

export interface FormNode {
  /** Stable identity for React keys; never shown to the user. */
  key: number;
  title: string;
  skillIds: number[];
  subtasks: FormNode[];
}

export interface FormState {
  root: FormNode;
  nextKey: number;
}

/** Indices from the root: [] is the root, [0] its first subtask, [0, 2] that subtask's third child. */
export type Path = readonly number[];

export type FormAction =
  | { type: 'setTitle'; path: Path; title: string }
  | { type: 'toggleSkill'; path: Path; skillId: number }
  | { type: 'addSubtask'; path: Path }
  | { type: 'removeNode'; path: Path }
  | { type: 'reset' };

export function createInitialState(): FormState {
  return { root: { key: 0, title: '', skillIds: [], subtasks: [] }, nextKey: 1 };
}

/** Depth of the node at `path`: the root is depth 1. */
export const depthAt = (path: Path): number => path.length + 1;
export const canAddSubtaskAt = (path: Path): boolean => depthAt(path) < MAX_TASK_DEPTH;

/** "1" for the root, "1.2" for its second subtask, "1.2.1" for that subtask's first child, etc. */
export function taskNumber(path: Path): string {
  return [1, ...path.map((index) => index + 1)].join('.');
}

/** The node itself plus every descendant, e.g. a lone root counts as 1. */
export function countNodes(node: FormNode): number {
  return 1 + node.subtasks.reduce((sum, child) => sum + countNodes(child), 0);
}

/**
 * True if `node` or any descendant was left with no skills chosen. Those are exactly the nodes
 * the backend hands to the LLM inference chain on create, which is why the page uses this to
 * decide whether to warn the user that a pending submit may take a few seconds.
 */
export function anyNodeWithoutSkills(node: FormNode): boolean {
  if (node.skillIds.length === 0) return true;
  return node.subtasks.some(anyNodeWithoutSkills);
}

export function treeReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'reset':
      return createInitialState();
    case 'setTitle':
      return {
        ...state,
        root: updateAt(state.root, action.path, (n) => ({ ...n, title: action.title })),
      };
    case 'toggleSkill':
      return {
        ...state,
        root: updateAt(state.root, action.path, (n) => ({
          ...n,
          skillIds: n.skillIds.includes(action.skillId)
            ? n.skillIds.filter((id) => id !== action.skillId)
            : [...n.skillIds, action.skillId].sort((a, b) => a - b),
        })),
      };
    case 'addSubtask': {
      if (!canAddSubtaskAt(action.path)) return state;
      const child: FormNode = { key: state.nextKey, title: '', skillIds: [], subtasks: [] };
      return {
        nextKey: state.nextKey + 1,
        root: updateAt(state.root, action.path, (n) => ({
          ...n,
          subtasks: [...n.subtasks, child],
        })),
      };
    }
    case 'removeNode': {
      if (action.path.length === 0) return state; // the root cannot be removed
      const parentPath = action.path.slice(0, -1);
      const index = action.path[action.path.length - 1]!;
      return {
        ...state,
        root: updateAt(state.root, parentPath, (n) => ({
          ...n,
          subtasks: n.subtasks.filter((_, i) => i !== index),
        })),
      };
    }
  }
}

/** Returns a copy of `node` with the node at `path` replaced by `fn(node)`; untouched branches are shared. */
function updateAt(node: FormNode, path: Path, fn: (n: FormNode) => FormNode): FormNode {
  if (path.length === 0) return fn(node);
  const [head, ...rest] = path as [number, ...number[]];
  const child = node.subtasks[head];
  if (!child) return node;
  return {
    ...node,
    subtasks: node.subtasks.map((c, i) => (i === head ? updateAt(child, rest, fn) : c)),
  };
}

/** The API payload. Empty `skillIds` are omitted so the backend infers them (Part 5). Titles are trimmed. */
export function toCreateRequest(root: FormNode): CreateTaskRequest {
  const convert = (n: FormNode): CreateTaskRequest => ({
    title: n.title.trim(),
    ...(n.skillIds.length > 0 ? { skillIds: n.skillIds } : {}),
    ...(n.subtasks.length > 0 ? { subtasks: n.subtasks.map(convert) } : {}),
  });
  return convert(root);
}

/**
 * First validation problem in the tree, or null. Mirrors the shared schema so errors show before
 * submitting. Includes the offending node's `key` (not just its `path`) so the page can move focus
 * straight to `#task-title-${key}` — the DOM id doesn't change when siblings are added or removed,
 * but a `path` alone isn't enough to build that id without also having the node in hand.
 */
export function firstProblem(root: FormNode): { path: Path; key: number; message: string } | null {
  const walk = (
    n: FormNode,
    path: number[],
  ): { path: Path; key: number; message: string } | null => {
    if (n.title.trim().length === 0) return { path, key: n.key, message: 'Title is required' };
    for (let i = 0; i < n.subtasks.length; i++) {
      const problem = walk(n.subtasks[i]!, [...path, i]);
      if (problem) return problem;
    }
    return null;
  };
  return walk(root, []);
}
