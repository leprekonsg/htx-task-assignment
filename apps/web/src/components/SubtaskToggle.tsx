// The disclosure control at the head of a task row: it folds a task's whole subtree out of the
// table and brings it back. Only rows that actually have subtasks get one; leaf rows render a
// spacer of the same width in TaskRow so every number still lines up in one column.
//
// Three deliberate choices, all of them about not lying to assistive technology:
//   - The button is a real `<button>` carrying `aria-expanded`, which is the one attribute a screen
//     reader uses to announce "expanded"/"collapsed". The label therefore names *what* it controls
//     ("Subtasks of Build API") and never the state — restating "Expand"/"Collapse" in the label
//     would have it announced twice, and the two would drift out of sync.
//   - The chevron is `aria-hidden`: it is the same fact the button's own state already carries.
//   - The task number next to it stays plain text. Making the number itself the control would give
//     the outline two jobs — telling you where you are and doing something when clicked — and a
//     number that reacts to a click is not something a reader expects to be safe.
//
// The chevron is drawn here rather than pulled from an icon set: it is one path, it inherits the
// row's ink through `currentColor`, and the app ships no icon dependency for a single glyph.
interface SubtaskToggleProps {
  /** Used to build the accessible name, so each toggle in the table is distinguishable. */
  taskTitle: string;
  expanded: boolean;
  onToggle: () => void;
}

export default function SubtaskToggle({ taskTitle, expanded, onToggle }: SubtaskToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`Subtasks of ${taskTitle}`}
      // 24px square: the smallest target WCAG 2.5.8 accepts, and enough to sit in a table gutter.
      className="flex h-6 w-6 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-3 w-3 motion-safe:transition-transform motion-safe:duration-150 ${
          expanded ? 'rotate-90' : ''
        }`}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M4.25 1.75 8.5 6l-4.25 4.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
