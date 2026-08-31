// The three button ranks used across the whole app, kept in one place so "primary", "secondary"
// and "quiet" actually mean the same thing everywhere instead of drifting file to file. These are plain
// strings, not components, because the buttons that use them need to add a class or two of their
// own (e.g. `self-start`) alongside them. See typeStyles.ts for the typographic equivalent.
//
// There is exactly one primary button on any page, and it is the only solid violet object on that
// page — "the single primary action" is one of the four jobs the accent plate is allowed to do (see
// index.css). Everything else is secondary: an ink hairline on the paper, no fill. That's what
// makes the violet mean something when it does appear. If a page ever seems to need two primary
// buttons, that's a sign the page has two competing purposes, not that it needs another colour.

export const primaryButtonClass =
  'rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45';

// `border-rule-strong` rather than the hairline `border-rule`: this border is the only thing
// marking the button's hit area, and WCAG 1.4.11 wants 3:1 for a cue carrying that much weight.
export const secondaryButtonClass =
  'rounded-sm border border-rule-strong px-3.5 py-2 text-sm font-medium text-text transition-colors hover:border-text hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-45';

// A third, quieter rank for controls that change what you can *see* rather than what exists: the
// Expand all / Collapse all pair above the task table, and the per-row Add subtask action. They sit
// inside dense content, so they carry no border and no fill — muted ink that firms up on hover and
// focus. Deliberately not the accent plate: folding a row is not one of its four jobs.
export const quietButtonClass =
  'rounded-sm px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-text-muted';
