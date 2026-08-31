// The two button looks used across the whole app, kept in one place so "primary" and "secondary"
// actually mean the same thing everywhere instead of drifting file to file. Primary (solid accent)
// is for the one main action on a page — here, just "Create task". Secondary (bordered, neutral) is
// for everything else — "Add subtask", "Remove". These are plain strings, not components, because
// the buttons that use them need to add a class or two of their own (e.g. `self-start`) alongside
// them.
export const primaryButtonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClass =
  'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60';
