// A one-off success message, e.g. "Created \"Fix login bug\"" shown at the top of the Task List
// right after creating a task. The message doesn't live in server data or even component state —
// CreateTaskPage hands it to `navigate('/', { state: { flash: '...' } })`, and TaskListPage reads it
// straight off `location.state`. That's react-router's mechanism for "pass a bit of one-time data
// along with a navigation" without it becoming part of the URL or needing its own store. This
// component itself is dumb: given a message, show it with a way to dismiss it. There's no green
// success colour in this system — a confirmation isn't an emergency, so it's printed on the accent
// (violet) plate, the same plate that carries every other piece of state.
interface FlashBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function FlashBanner({ message, onDismiss }: FlashBannerProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-l-2 border-accent bg-accent-soft px-4 py-3 text-sm text-accent"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-sm px-2 py-1 font-medium text-accent transition-colors hover:bg-surface-raised"
      >
        Dismiss
      </button>
    </div>
  );
}
