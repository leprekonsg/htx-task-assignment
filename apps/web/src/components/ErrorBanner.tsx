// A banner for when a request failed outright — most notably the initial `GET /api/tasks` on the
// Task List page. Gives the user the server's message and a "Retry" button rather than leaving them
// looking at a blank page; `onRetry` is normally a query's `refetch()`. Not to be confused with the
// per-row inline error a failed PATCH shows (see TaskRow) — that one doesn't need a Retry button
// because just changing the select again is the retry.
interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-sm border border-danger px-3 py-1 font-medium text-danger transition-colors hover:bg-surface-raised"
      >
        Retry
      </button>
    </div>
  );
}
