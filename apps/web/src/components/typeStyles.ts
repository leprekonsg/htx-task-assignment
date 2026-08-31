// The app has exactly two typographic voices, and this file is where each one is spelled out once
// so that "a micro-label" means the same thing on the task list as it does in the create form.
// Companion to buttonStyles.ts; the tokens they build on live in ../index.css.
//
// The two voices divide the work by *what the words are*, not by where they sit:
//
//   Work Sans (the default `font-sans`) is the reading voice — anything that is a sentence, a
//   title, or a person's name. It carries meaning that a human wrote.
//
//   The monospace stack (`font-mono`) is the utility voice — anything that is a *fact*: a task
//   number, a count, a column header, a status label. Monospace does two things here that a
//   proportional face can't. Its digits are the same width, so "1.1.1" sits directly under "1.1"
//   down the number column and the task list reads as an outline instead of a list of strings. And
//   because it looks mechanical, it silently tells the reader "this was computed, not composed" —
//   which is exactly the distinction between a task's number and a task's title.
//
// Why plain strings and not components: every place these are used needs to add a class or two of
// its own (`self-start`, a colour override, a grid position) alongside them, which is awkward with a
// wrapper component and trivial with a string.

/**
 * The one big piece of type on a page — the `<h1>`, and nothing else. Deliberately much larger
 * than anything near it: the jump from this (44px) down to a micro-label (10px) is what gives the
 * page a clear top and stops every element from looking equally important. Print work pushes this
 * ratio to 5-12x, but a page whose smallest text must stay readable in a dense table caps out
 * around 4x, so that's where this sits.
 */
export const displayClass =
  'text-4xl font-bold leading-[0.95] tracking-[-0.02em] text-text sm:text-[2.75rem]';

/**
 * The utility voice at its smallest: column headers, section labels, counts, the masthead
 * descriptor. Uppercase with wide letter-spacing so a 10px line still reads cleanly and clearly
 * isn't body text.
 *
 * Note the one rule for using this: never on text that a test or a screen reader relies on as an
 * accessible name. Browsers apply `text-transform` when they compute accessible names, so
 * uppercasing a `<legend>` or a button label silently renames it. Everything styled with this class
 * is decorative or a column header — never a control's name.
 */
export const microLabelClass =
  'font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-text-muted';

/** Same voice as a micro-label, but keeping its original casing — for text that names a control. */
export const microTextClass = 'font-mono text-[0.6875rem] tracking-[0.06em] text-text-muted';

/**
 * A task's hierarchical number ("1", "1.1", "1.1.1"). Printed on the accent plate because the
 * numbering *is* the hierarchy — it's the one thing that tells you this row is a subtask of that
 * one — and hierarchy is one of the four jobs the violet is allowed to do.
 */
export const taskNumberClass = 'font-mono text-xs font-semibold text-accent-muted';

/** The heavy rule that closes a masthead or opens a section. One weight, used sparingly. */
export const heavyRuleClass = 'border-b-2 border-text';
