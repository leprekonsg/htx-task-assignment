// The inline assignee dropdown shown in each Task List row. Same controlled-select pattern as
// StatusSelect: the parent owns the value and the PATCH. The one extra rule (Rule A from the
// domain: a developer can only be assigned a task whose required skills they all have) is made
// *visible* rather than just enforced — a developer missing a skill still appears in the list, but
// as a `disabled` option whose label says which skill they're missing, using the shared
// `missingSkills` helper so this matches exactly what the server would reject.
//
// One layout consequence of those explanatory labels: a `<select>` is sized by its widest
// option, so "Bob — lacks Frontend" would stretch this control far past the width any
// selected name needs, and the task table's right-hand columns would swallow the space the
// Title column wants. Hence the width cap in the class list. Nothing is lost — the open
// dropdown is drawn by the operating system and is free to be wider than the closed control.
import type { Developer, Task } from '@htx/shared';
import { missingSkills } from '@htx/shared';

interface AssigneeSelectProps {
  task: Task;
  developers: readonly Developer[];
  disabled: boolean;
  onChange: (assigneeId: number | null) => void;
}

export default function AssigneeSelect({
  task,
  developers,
  disabled,
  onChange,
}: AssigneeSelectProps) {
  return (
    <select
      aria-label={`Assignee of ${task.title}`}
      value={task.assignee ? String(task.assignee.id) : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      className="w-full max-w-[11rem] truncate rounded-sm border border-rule-strong bg-surface-raised px-2.5 py-1.5 text-sm text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:opacity-45"
    >
      <option value="">Unassigned</option>
      {developers.map((developer) => {
        const missing = missingSkills(developer, task.skills);
        const ineligible = missing.length > 0;
        return (
          <option key={developer.id} value={developer.id} disabled={ineligible}>
            {ineligible
              ? `${developer.name} — lacks ${missing.map((skill) => skill.name).join(', ')}`
              : developer.name}
          </option>
        );
      })}
    </select>
  );
}
