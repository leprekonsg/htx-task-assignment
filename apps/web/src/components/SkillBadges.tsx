// Renders a task's required skills as small printed marks — an ink outline, no fill — used in the
// Skills column of the Task List. A filled chip on every row of every skill would drown the page
// in colour, so these are drawn like a rubber-stamped mark on paper instead of a coloured pill.
// Also shows a second, quieter badge explaining *how* the skills were decided when that wasn't the
// user's own choice: "AI-inferred" (hover for which model answered) when the backend used an LLM
// because the user left skills blank, or "Not inferred" when that LLM call failed and nothing was
// inferred. When the user picked the skills themselves (`skillsSource === 'user'`), no extra badge
// is shown — that's the ordinary case and needs no explanation.
import type { Skill, SkillsSource } from '@htx/shared';
import { SKILLS_SOURCE_LABELS } from '@htx/shared';
import { microTextClass } from './typeStyles';

interface SkillBadgesProps {
  skills: readonly Skill[];
  skillsSource: SkillsSource;
  skillsModel: string | null;
}

export default function SkillBadges({ skills, skillsSource, skillsModel }: SkillBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {skills.length === 0 && <span className={microTextClass}>None</span>}
      {skills.map((skill) => (
        <span
          key={skill.id}
          className="rounded-sm border border-rule px-2 py-0.5 text-xs text-text"
        >
          {skill.name}
        </span>
      ))}
      {skillsSource === 'llm' && (
        <span
          className="rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
          title={
            skillsModel ? `${SKILLS_SOURCE_LABELS.llm} — ${skillsModel}` : SKILLS_SOURCE_LABELS.llm
          }
        >
          AI-inferred
        </span>
      )}
      {skillsSource === 'unresolved' && (
        <span
          className="rounded-sm border border-dashed border-rule-strong px-2 py-0.5 text-xs text-text-muted"
          title={SKILLS_SOURCE_LABELS.unresolved}
        >
          Not inferred
        </span>
      )}
    </div>
  );
}
