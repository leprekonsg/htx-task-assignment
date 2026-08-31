// Catch-all route (`path="*"` in App.tsx) for any URL that doesn't match a real page.
import { Link } from 'react-router';
import { displayClass, microLabelClass } from '../components/typeStyles';
import { secondaryButtonClass } from '../components/buttonStyles';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <p className={microLabelClass}>Error 404</p>
      <h1 className={displayClass}>Page not found</h1>
      <p className="text-sm text-text-muted">There's nothing at this address.</p>
      <Link to="/" className={secondaryButtonClass}>
        Back to tasks
      </Link>
    </div>
  );
}
