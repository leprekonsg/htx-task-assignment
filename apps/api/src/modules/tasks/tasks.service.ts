/**
 * Task use-cases and the two business rules:
 *   Rule A — a developer can only be assigned a task if they hold every skill it requires.
 *   Rule B — a task can only be Done when every descendant is Done; the invariant "a done task has no
 *            non-done descendant" is also protected on reopen and on adding a subtask.
 *
 * Rule B spans rows, so checking it inside a transaction is not enough on its own: two transactions could
 * each pass their check against the other's uncommitted state. Every mutation that can affect a tree's
 * invariant therefore first takes a row lock on the tree's ROOT (`lockTree`). Under READ COMMITTED each
 * statement sees the latest committed data, so once a transaction holds the lock, its checks see the
 * winner's committed writes. Skill inference (network) happens BEFORE the transaction so no lock is held
 * while waiting on the LLM.
 */
import {
  MAX_TASK_DEPTH,
  missingSkills,
  taskTreeDepth,
  type CreateTaskRequest,
  type Skill,
  type SkillsSource,
  type Task,
  type TaskNodeInput,
  type UpdateTaskRequest,
} from '@htx/shared';
import type { Pool, PoolClient } from 'pg';
import { withTransaction, type Queryable } from '../../db/pool.js';
import { AppError } from '../../errors.js';
import type { SkillClassifier } from '../../llm/classifier.js';
import { findDeveloperById } from '../developers/developers.repo.js';
import { listSkills } from '../skills/skills.repo.js';
import * as sql from './tasks.sql.js';
import { buildTaskTree } from './tasks.tree.js';

/** What we know about each node's skills right before inserting it. */
interface ResolvedSkills {
  skillIds: number[];
  source: SkillsSource;
  model: string | null;
}

export class TasksService {
  constructor(
    private readonly pool: Pool,
    private readonly classifier: SkillClassifier,
  ) {}

  async list(): Promise<Task[]> {
    const rows = await sql.selectAllTasks(this.pool);
    const skills = await sql.selectTaskSkills(
      this.pool,
      rows.map((r) => r.id),
    );
    return buildTaskTree(rows, skills);
  }

  async get(id: number, db: Queryable = this.pool): Promise<Task> {
    const rows = await sql.selectSubtree(db, id);
    if (rows.length === 0) throw new AppError('TASK_NOT_FOUND', `Task ${id} does not exist`);
    const skills = await sql.selectTaskSkills(
      db,
      rows.map((r) => r.id),
    );
    return buildTaskTree(rows, skills)[0]!;
  }

  /** Create a task, or a whole tree of tasks, atomically. Optionally under an existing parent. */
  async create(request: CreateTaskRequest): Promise<Task> {
    const allSkills = await listSkills(this.pool);
    const nodes = flattenInput(request);
    assertSkillIdsExist(nodes, allSkills);

    const resolved = await this.resolveSkills(nodes, allSkills);

    const rootId = await withTransaction(this.pool, async (client) => {
      if (request.parentId !== undefined) {
        await this.assertCanAttachUnder(client, request.parentId, taskTreeDepth(request));
      }
      return insertTree(client, request, request.parentId ?? null, resolved);
    });
    return this.get(rootId);
  }

  /** Change status and/or assignee. Both rules are enforced here. */
  async update(id: number, patch: UpdateTaskRequest): Promise<Task> {
    await withTransaction(this.pool, async (client) => {
      const found = await sql.selectAncestors(client, id);
      if (found.length === 0) throw new AppError('TASK_NOT_FOUND', `Task ${id} does not exist`);
      await sql.lockTree(client, found.at(-1)!.id);
      // Re-read under the lock: statuses may have changed while we waited for it.
      const [self, ...ancestors] = await sql.selectAncestors(client, id);

      if (patch.status !== undefined && patch.status !== self!.status) {
        if (patch.status === 'done') {
          const pending = (await sql.selectDescendantStatuses(client, id)).filter(
            (d) => d.status !== 'done',
          );
          if (pending.length > 0) {
            throw new AppError(
              'SUBTASKS_NOT_DONE',
              'All subtasks must be Done before the task can be Done',
              {
                subtaskIds: pending.map((d) => d.id),
              },
            );
          }
        } else if (self!.status === 'done') {
          const doneAncestors = ancestors.filter((a) => a.status === 'done');
          if (doneAncestors.length > 0) {
            throw new AppError(
              'ANCESTOR_IS_DONE',
              'Cannot reopen a subtask while its parent task is Done',
              {
                ancestorIds: doneAncestors.map((a) => a.id),
              },
            );
          }
        }
      }

      if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
        await this.assertEligible(client, id, patch.assigneeId);
      }

      await sql.updateTask(client, id, patch);
    });
    return this.get(id);
  }

  // ---- helpers -------------------------------------------------------------------------------

  /** Rule A. */
  private async assertEligible(
    client: PoolClient,
    taskId: number,
    developerId: number,
  ): Promise<void> {
    const developer = await findDeveloperById(client, developerId);
    if (!developer)
      throw new AppError('DEVELOPER_NOT_FOUND', `Developer ${developerId} does not exist`);
    const taskSkills = (await sql.selectTaskSkills(client, [taskId])).map((r) => ({
      id: r.skill_id,
      name: r.skill_name,
    }));
    const missing = missingSkills(developer, taskSkills);
    if (missing.length > 0) {
      throw new AppError(
        'DEVELOPER_LACKS_SKILLS',
        `${developer.name} lacks required skill(s): ${missing.map((s) => s.name).join(', ')}`,
        {
          developerId,
          missingSkills: missing,
        },
      );
    }
  }

  /** Locks the parent's tree and checks the parent chain is open and shallow enough for `newDepth` more levels. */
  private async assertCanAttachUnder(
    client: PoolClient,
    parentId: number,
    newDepth: number,
  ): Promise<void> {
    const found = await sql.selectAncestors(client, parentId);
    if (found.length === 0)
      throw new AppError('PARENT_NOT_FOUND', `Parent task ${parentId} does not exist`);
    await sql.lockTree(client, found.at(-1)!.id);
    const chain = await sql.selectAncestors(client, parentId);
    const done = chain.filter((a) => a.status === 'done');
    if (done.length > 0) {
      throw new AppError('PARENT_IS_DONE', 'Cannot add a subtask under a task that is Done', {
        ancestorIds: done.map((a) => a.id),
      });
    }
    if (chain.length + newDepth > MAX_TASK_DEPTH) {
      throw new AppError(
        'MAX_DEPTH_EXCEEDED',
        `Task trees may be at most ${MAX_TASK_DEPTH} levels deep`,
        {
          parentDepth: chain.length,
          requestedDepth: newDepth,
        },
      );
    }
  }

  /** Decide each node's skills: supplied by the user, inferred by the classifier, or unresolved. */
  private async resolveSkills(
    nodes: FlatNode[],
    allSkills: Skill[],
  ): Promise<Map<string, ResolvedSkills>> {
    const resolved = new Map<string, ResolvedSkills>();
    const toInfer: FlatNode[] = [];
    for (const node of nodes) {
      if (node.input.skillIds && node.input.skillIds.length > 0) {
        resolved.set(node.ref, { skillIds: node.input.skillIds, source: 'user', model: null });
      } else {
        toInfer.push(node);
      }
    }
    if (toInfer.length === 0) return resolved;

    const result = await this.classifier.classify(
      toInfer.map((n) => ({ ref: n.ref, title: n.input.title })),
      allSkills.map((s) => s.name),
    );
    const idByName = new Map(allSkills.map((s) => [s.name.toLowerCase(), s.id]));
    for (const node of toInfer) {
      const item = result.ok ? result.items.find((i) => i.ref === node.ref) : undefined;
      if (result.ok && item) {
        const skillIds = [
          ...new Set(
            item.skills
              .map((name) => idByName.get(name.toLowerCase()))
              .filter((id): id is number => id !== undefined),
          ),
        ];
        resolved.set(node.ref, { skillIds, source: 'llm', model: result.model });
      } else {
        resolved.set(node.ref, { skillIds: [], source: 'unresolved', model: null });
      }
    }
    return resolved;
  }
}

// ---- pure helpers ----------------------------------------------------------------------------

interface FlatNode {
  /** Position in the request tree, e.g. "0", "0.1", "0.1.0" — stable key for matching classifier output. */
  ref: string;
  input: TaskNodeInput;
}

function flattenInput(root: TaskNodeInput): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (node: TaskNodeInput, ref: string) => {
    out.push({ ref, input: node });
    (node.subtasks ?? []).forEach((child, i) => walk(child, `${ref}.${i}`));
  };
  walk(root, '0');
  return out;
}

function assertSkillIdsExist(nodes: FlatNode[], allSkills: Skill[]): void {
  const known = new Set(allSkills.map((s) => s.id));
  const missing = [
    ...new Set(nodes.flatMap((n) => n.input.skillIds ?? []).filter((id) => !known.has(id))),
  ];
  if (missing.length > 0) {
    throw new AppError('SKILL_NOT_FOUND', `Unknown skill id(s): ${missing.join(', ')}`, {
      missingSkillIds: missing,
    });
  }
}

/** Depth-first insert, parent before children, so every child gets its parent's id. Returns the root id. */
async function insertTree(
  client: PoolClient,
  root: TaskNodeInput,
  parentId: number | null,
  resolved: Map<string, ResolvedSkills>,
): Promise<number> {
  const insertNode = async (
    node: TaskNodeInput,
    ref: string,
    parent: number | null,
  ): Promise<number> => {
    const skills = resolved.get(ref)!;
    const id = await sql.insertTask(client, {
      title: node.title,
      parentId: parent,
      skillsSource: skills.source,
      skillsModel: skills.model,
    });
    await sql.insertTaskSkills(client, id, skills.skillIds);
    let i = 0;
    for (const child of node.subtasks ?? []) await insertNode(child, `${ref}.${i++}`, id);
    return id;
  };
  return insertNode(root, '0', parentId);
}
