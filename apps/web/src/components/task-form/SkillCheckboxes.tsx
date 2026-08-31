// A labelled group of skill checkboxes, used once per task node in the Create Task form (the root
// task and every subtask each choose their own skills). Kept separate from TaskNodeForm mainly
// because a checkbox *group* needs a `<fieldset>`/`<legend>` pair to have one accessible name per
// group — with several of these on a page (one per subtask), each needs its own distinct legend.
// This component used to repeat "Leave empty and the skills will be inferred from the title" under
// every single group — harmless with one node, noisy with four. That explanation now lives once,
// at the top of CreateTaskPage, so this component only renders the legend and the checkboxes.
import type { Skill } from '@htx/shared';

interface SkillCheckboxesProps {
  legend: string;
  skills: readonly Skill[];
  selectedSkillIds: readonly number[];
  onToggle: (skillId: number) => void;
}

export default function SkillCheckboxes({
  legend,
  skills,
  selectedSkillIds,
  onToggle,
}: SkillCheckboxesProps) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {skills.map((skill) => (
          <label key={skill.id} className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={selectedSkillIds.includes(skill.id)}
              onChange={() => onToggle(skill.id)}
              className="h-4 w-4 rounded-sm border-rule-strong accent-accent"
            />
            {skill.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
