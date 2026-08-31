// Catch-all route (`path="*"` in App.tsx) for any URL that doesn't match a real page.
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <h1 className="text-xl font-semibold text-text">Page not found</h1>
      <p className="text-text-muted">There's nothing here.</p>
      <Link to="/" className="text-sm font-medium text-accent hover:text-accent-hover">
        Back to tasks
      </Link>
    </div>
  );
}
