import type { Developer } from './developer.js';
import type { Skill } from './skill.js';

/**
 * Rule A — a developer may be assigned a task only if they have every skill the task requires.
 * A task with no skills can go to anyone.
 */
export function canAssign(
  developerSkillIds: Iterable<number>,
  taskSkillIds: Iterable<number>,
): boolean {
  const owned = new Set(developerSkillIds);
  for (const required of taskSkillIds) {
    if (!owned.has(required)) return false;
  }
  return true;
}

/** Skills the task requires that the developer lacks (empty when eligible). */
export function missingSkills(developer: Developer, taskSkills: readonly Skill[]): Skill[] {
  const owned = new Set(developer.skills.map((s) => s.id));
  return taskSkills.filter((s) => !owned.has(s.id));
}

export function eligibleDevelopers(
  developers: readonly Developer[],
  taskSkills: readonly Skill[],
): Developer[] {
  const required = taskSkills.map((s) => s.id);
  return developers.filter((dev) =>
    canAssign(
      dev.skills.map((s) => s.id),
      required,
    ),
  );
}
