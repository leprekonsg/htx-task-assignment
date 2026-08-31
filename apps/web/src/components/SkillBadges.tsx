// Renders a task's required skills as small pill badges, used in the Skills column of the Task
// List. Also shows a second, quieter badge explaining *how* the skills were decided when that
// wasn't the user's own choice: "AI-inferred" (hover for which model answered) when the backend
// used an LLM because the user left skills blank, or "Not inferred" when that LLM call failed and
// nothing was inferred. When the user picked the skills themselves (`skillsSource === 'user'`),
// no extra badge is shown — that's the ordinary case and needs no explanation.
import type { Skill, SkillsSource } from '@htx/shared';

interface SkillBadgesProps {
  skills: readonly Skill[];
  skillsSource: SkillsSource;
  skillsModel: string | null;
}

export default function SkillBadges({ skills, skillsSource, skillsModel }: SkillBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {skills.map((skill) => (
        <span
          key={skill.id}
          className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
        >
          {skill.name}
        </span>
      ))}
      {skillsSource === 'llm' && (
        <span
          className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted"
          title={skillsModel ?? undefined}
        >
          AI-inferred
        </span>
      )}
      {skillsSource === 'unresolved' && (
        <span
          className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-text-muted"
          title="The LLM was unavailable, so no skills could be inferred from the title."
        >
          Not inferred
        </span>
      )}
    </div>
  );
}
