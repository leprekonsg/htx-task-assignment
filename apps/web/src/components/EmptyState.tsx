// Shown in place of the table when the task list loaded successfully but there are zero tasks.
// Distinct from ErrorBanner (which is for when loading *failed*) — this is a normal, expected state
// the first time someone opens the app, so it's calm and points at the one useful next action.
import { Link } from 'react-router';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-text-muted">No tasks yet.</p>
      <Link to="/tasks/new" className="text-sm font-medium text-accent hover:text-accent-hover">
        Create task
      </Link>
    </div>
  );
}
