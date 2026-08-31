// The `/` route: a table of every task, subtasks nested under their parent with numbering like
// "1", "1.1", "1.1.1" (built by `flattenTaskTree`, a shared helper — see @htx/shared — so the
// numbering logic isn't duplicated between here and any other place that might render a task tree).
// This page fetches tasks and developers (`useTasks`/`useDevelopers`, both TanStack Query hooks) and
// renders one of four things depending on the tasks query's state: skeleton rows while loading, an
// error banner with Retry if the fetch failed, an empty state if there are simply no tasks yet, or
// the table. Per-row editing (status/assignee selects, their own PATCH) is delegated to `TaskRow`.
//
// The developers query is handled separately, and deliberately does not gate the table: if
// `GET /api/developers` fails, hiding the tasks the user can still read and re-status would make a
// developers outage worse than it needs to be. What it *does* gate is assignment — if developers
// can't be shown, the assignee dropdown has nothing trustworthy to offer, so a second, independent
// `ErrorBanner` (with its own Retry) explains that, and `assignmentUnavailable` (true whenever the
// developers query hasn't succeeded — still pending, or errored) is threaded down to every `TaskRow`
// to disable just the assignee `<select>`. The status `<select>` is left alone, since it never reads
// `developers` and has no reason to lock up because a different query failed.
import { useState } from 'react';
import { useLocation } from 'react-router';
import { flattenTaskTree } from '@htx/shared';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import FlashBanner from '../components/FlashBanner';
import SkeletonRows from '../components/SkeletonRows';
import TaskRow from '../components/TaskRow';
import { useDevelopers, useTasks } from '../api/hooks';

export default function TaskListPage() {
  const tasksQuery = useTasks();
  const developersQuery = useDevelopers();
  const location = useLocation();
  const [flash, setFlash] = useState<string | null>(
    (location.state as { flash?: string } | null)?.flash ?? null,
  );

  const rows = tasksQuery.data ? flattenTaskTree(tasksQuery.data) : [];
  const developers = developersQuery.data ?? [];
  const assignmentUnavailable = developersQuery.isPending || developersQuery.isError;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text">Tasks</h1>

      {flash && <FlashBanner message={flash} onDismiss={() => setFlash(null)} />}

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

      {!tasksQuery.isError && tasksQuery.isSuccess && rows.length === 0 && <EmptyState />}

      {!tasksQuery.isError && (tasksQuery.isLoading || rows.length > 0) && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Skills
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Assignee
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
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
