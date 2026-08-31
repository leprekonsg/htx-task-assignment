// The `/` route: a table of every task, subtasks nested under their parent with numbering like
// "1", "1.1", "1.1.1". This page fetches tasks and developers (`useTasks`/`useDevelopers`, both
// TanStack Query hooks) and renders one of four things depending on the tasks query's state:
// skeleton rows while loading, an error banner with Retry if the fetch failed, an empty state if
// there are simply no tasks yet, or the table. Per-row editing (status/assignee selects, their own
// PATCH) is delegated to `TaskRow`.
//
// The developers query is handled separately, and deliberately does not gate the table: if
// `GET /api/developers` fails, hiding the tasks the user can still read and re-status would make a
// developers outage worse than it needs to be. What it *does* gate is assignment — if developers
// can't be shown, the assignee dropdown has nothing trustworthy to offer, so a second, independent
// `ErrorBanner` (with its own Retry) explains that, and `assignmentUnavailable` (true whenever the
// developers query hasn't succeeded — still pending, or errored) is threaded down to every `TaskRow`
// to disable just the assignee `<select>`. The status `<select>` is left alone, since it never reads
// `developers` and has no reason to lock up because a different query failed.
//
// ── Folding ────────────────────────────────────────────────────────────────────────────────────
//
// A task tree with any depth to it stops being readable long before it stops being small, so any
// task with subtasks can be folded shut. Three decisions make that safe rather than merely clever:
//
//   `collapsedIds` holds task **ids**, never numbers. A task's number describes where it currently
//   sits among its siblings, so it changes the moment anything is added above it; its id doesn't.
//   Keying the fold state by number would silently fold the wrong row after a create.
//
//   Two flattenings, for two different questions. `flattenVisibleTaskTree` answers "what is on
//   screen" and is what the table renders. `flattenTaskTree` answers "what exists" and is what the
//   census counts — folding a subtree changes how much you are looking at, never how much there is.
//
//   Numbering comes from the tree, not from the rendered array (see @htx/shared), so a folded
//   subtree leaves no gap and renumbers nothing: fold 1.2's children and 1.3 is still 1.3.
//
// Everything starts expanded. The list opens the way it always has, and folding is something the
// reader chooses — never a state they have to undo before they can see their own tasks.
//
// ── Adding a subtask in place ──────────────────────────────────────────────────────────────────
//
// `composerFor` holds at most one task id, so opening the Add subtask composer anywhere closes the
// one that was open. That is a deliberate limit rather than an implementation shortcut: two open
// composers would mean two half-written subtasks and two in-flight POSTs racing the same refetch.
//
// A successful add does four things here, in the order a reader experiences them: unfold the parent
// (a new subtask hidden inside a folded row would be a create with nothing to show for it), mark
// the new row for its one-shot settle, announce it in a live region for anyone who can't see that
// settle, and close the composer. `TaskRow` handles the fifth, which needs a real DOM node rather
// than state: putting focus back on the Add subtask button it came from.
//
// `drafts` is why closing a composer is cheap. The composer unmounts whenever another one opens, or
// whenever its row is folded away by a parent or by Collapse all — none of which mean the user is
// finished writing. Holding the half-written subtask here, keyed by parent id, makes those unmounts
// survivable; a draft is discarded only on Cancel or a successful create, the two exits the user
// actually chose. It is keyed by id for the same reason `collapsedIds` is: numbers move.
//
// `announcement` carries the created task's id alongside its text. Two subtasks with the same title
// under the same parent produce the same sentence, and re-rendering identical text into a live
// region is not a mutation, so the second add would go unannounced. Keying the region's child by
// that id replaces the node instead of updating it, which is a mutation, so every add is spoken.
import { useState } from 'react';
import { useLocation } from 'react-router';
import type { Task } from '@htx/shared';
import { collapsibleTaskIds, flattenTaskTree, flattenVisibleTaskTree } from '@htx/shared';
import type { SubtaskDraft } from '../components/AddSubtaskForm';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import FlashBanner from '../components/FlashBanner';
import SkeletonRows from '../components/SkeletonRows';
import TaskRow from '../components/TaskRow';
import { quietButtonClass } from '../components/buttonStyles';
import { displayClass, microLabelClass } from '../components/typeStyles';
import { useDevelopers, useTasks } from '../api/hooks';

/** What a row's composer opens with before anything has been typed into it. */
const EMPTY_DRAFT: SubtaskDraft = { title: '', skillIds: [] };

export default function TaskListPage() {
  const tasksQuery = useTasks();
  const developersQuery = useDevelopers();
  const location = useLocation();
  const [flash, setFlash] = useState<string | null>(
    (location.state as { flash?: string } | null)?.flash ?? null,
  );
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [composerFor, setComposerFor] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ReadonlyMap<number, SubtaskDraft>>(() => new Map());
  const [addedTaskId, setAddedTaskId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<{ id: number; message: string } | null>(null);

  const tasks = tasksQuery.data ?? [];
  const allRows = flattenTaskTree(tasks);
  const rows = flattenVisibleTaskTree(tasks, collapsedIds);
  const developers = developersQuery.data ?? [];
  const assignmentUnavailable = developersQuery.isPending || developersQuery.isError;

  // Only a list that actually has a branch in it can be folded, so a flat list is never offered
  // controls that would do nothing.
  const branchIds = collapsibleTaskIds(tasks);
  const foldable = branchIds.length > 0;
  const allExpanded = branchIds.every((id) => !collapsedIds.has(id));
  const allCollapsed = branchIds.every((id) => collapsedIds.has(id));

  const toggleCollapsed = (id: number) =>
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const changeDraft = (parentId: number, draft: SubtaskDraft) =>
    setDrafts((current) => new Map(current).set(parentId, draft));

  /** Forget a half-written subtask. Only ever called for an exit the user chose. */
  const discardDraft = (parentId: number) =>
    setDrafts((current) => {
      if (!current.has(parentId)) return current;
      const next = new Map(current);
      next.delete(parentId);
      return next;
    });

  const closeComposer = (parentId: number) => {
    setComposerFor(null);
    discardDraft(parentId);
  };

  const handleSubtaskCreated = (parent: Task, created: Task) => {
    setCollapsedIds((current) => {
      if (!current.has(parent.id)) return current;
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });
    setAddedTaskId(created.id);
    setAnnouncement({
      id: created.id,
      message: `Added "${created.title}" under "${parent.title}"`,
    });
    setComposerFor(null);
    discardDraft(parent.id);
  };

  // A one-line census of the list — count, done, unassigned — read before a single row is read.
  // It counts every task, folded or not: what you can currently see is a reading choice, and a
  // total that moved when you folded a row would be worse than useless.
  // It's a sibling of the `<h1>`, never inside it, so the heading's accessible name stays "Tasks".
  let summary: string | null = null;
  if (allRows.length > 0) {
    const doneCount = allRows.filter((row) => row.task.status === 'done').length;
    const unassignedCount = allRows.filter((row) => row.task.assignee === null).length;
    const segments = [
      `${allRows.length} ${allRows.length === 1 ? 'task' : 'tasks'}`,
      `${doneCount} done`,
      ...(unassignedCount > 0 ? [`${unassignedCount} unassigned`] : []),
    ];
    summary = segments.join(' · ');
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-2 border-text pb-3">
        <h1 className={displayClass}>Tasks</h1>
        {summary && <p className={microLabelClass}>{summary}</p>}
      </header>

      {flash && <FlashBanner message={flash} onDismiss={() => setFlash(null)} />}

      {/* Everything a sighted reader learns from the new row appearing and settling, said out loud
          once for everyone else. Rendered empty from the start: a live region added to the page at
          the same moment as its text is often not announced at all. */}
      <p role="status" className="sr-only">
        {announcement && <span key={announcement.id}>{announcement.message}</span>}
      </p>

      {tasksQuery.isError && (
        <ErrorBanner
          message={tasksQuery.error.message || 'Failed to load tasks.'}
          onRetry={() => tasksQuery.refetch()}
        />
      )}

      {developersQuery.isError && (
        <ErrorBanner
          message="Couldn't load developers, so tasks can't be assigned right now."
          onRetry={() => developersQuery.refetch()}
        />
      )}

      {!tasksQuery.isError && tasksQuery.isSuccess && allRows.length === 0 && <EmptyState />}

      {!tasksQuery.isError && (tasksQuery.isLoading || allRows.length > 0) && (
        <div className="flex flex-col gap-2">
          {/* Aligned to the same left edge as the heading and the table: these are marginal notes
              on the outline, not a toolbar bolted to the top of a widget. */}
          {foldable && (
            <div className="flex flex-wrap items-center gap-1 self-start">
              <button
                type="button"
                onClick={() => setCollapsedIds(new Set())}
                disabled={allExpanded}
                className={quietButtonClass}
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setCollapsedIds(new Set(branchIds))}
                disabled={allCollapsed}
                className={quietButtonClass}
              >
                Collapse all
              </button>
            </div>
          )}

          {/* `relative` is load-bearing, not decoration: the two visually-hidden column names inside
              the table are `position: absolute`, so without a positioned ancestor their containing
              block is the viewport and this scroll container cannot clip them. The one in the
              right-hand Actions header then sits ~730px out and scrolls the whole page sideways on
              a phone. Positioning the scroller puts them back inside it. */}
          <div className="relative overflow-x-auto bg-surface-raised">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-rule-strong">
                  {/* The fold gutter. It has a name for screen readers and nothing to print. */}
                  <th scope="col" className="w-8 py-2.5 pl-3">
                    <span className="sr-only">Subtasks</span>
                  </th>
                  <th scope="col" className={`px-3 py-2.5 ${microLabelClass}`}>
                    No.
                  </th>
                  <th scope="col" className={`px-3 py-2.5 ${microLabelClass}`}>
                    Title
                  </th>
                  <th scope="col" className={`px-3 py-2.5 ${microLabelClass}`}>
                    Skills
                  </th>
                  <th scope="col" className={`px-3 py-2.5 ${microLabelClass}`}>
                    Status
                  </th>
                  <th scope="col" className={`px-3 py-2.5 ${microLabelClass}`}>
                    Assignee
                  </th>
                  {/* Row actions. Named for screen readers; the column prints nothing of its own. */}
                  <th scope="col" className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasksQuery.isLoading ? (
                  <SkeletonRows />
                ) : (
                  rows.map((row) => (
                    <TaskRow
                      key={row.task.id}
                      row={row}
                      developers={developers}
                      assignmentUnavailable={assignmentUnavailable}
                      collapsed={collapsedIds.has(row.task.id)}
                      onToggleCollapse={() => toggleCollapsed(row.task.id)}
                      composerOpen={composerFor === row.task.id}
                      onOpenComposer={() => setComposerFor(row.task.id)}
                      onCloseComposer={() => closeComposer(row.task.id)}
                      draft={drafts.get(row.task.id) ?? EMPTY_DRAFT}
                      onDraftChange={(draft) => changeDraft(row.task.id, draft)}
                      onSubtaskCreated={(created) => handleSubtaskCreated(row.task, created)}
                      highlighted={addedTaskId === row.task.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
