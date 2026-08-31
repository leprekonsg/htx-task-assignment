// Shown in place of the table when the task list loaded successfully but there are zero tasks.
// Distinct from ErrorBanner (which is for when loading *failed*) — this is a normal, expected state
// the first time someone opens the app, so it's a calm, generously spaced release zone rather than
// a cramped apology, and it points at the one useful next action with real direction on what to do.
import { Link } from 'react-router';
import { primaryButtonClass } from './buttonStyles';
import { microLabelClass } from './typeStyles';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-rule-strong px-6 py-20 text-center">
      <p className={microLabelClass}>No tasks yet</p>
      <p className="max-w-md text-sm text-text-muted">
        Create the first task to get started. You can nest subtasks up to five levels deep, and
        leaving skills blank lets them be inferred from the title.
      </p>
      {/* "Create the first task", not "Create task" — the masthead already has a link named
          "Create task", and two matches would break a strict-mode e2e locator. */}
      <Link to="/tasks/new" className={primaryButtonClass}>
        Create the first task
      </Link>
    </div>
  );
}
