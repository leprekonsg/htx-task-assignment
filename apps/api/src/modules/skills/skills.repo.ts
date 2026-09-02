import type { Skill } from '@htx/shared';
import type { Queryable } from '../../db/pool.js';

export async function listSkills(db: Queryable): Promise<Skill[]> {
  const { rows } = await db.query<Skill>('SELECT id, name FROM skills ORDER BY id');
  return rows;
}

export async function findSkillById(db: Queryable, id: number): Promise<Skill | null> {
  const { rows } = await db.query<Skill>('SELECT id, name FROM skills WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findSkillsByIds(db: Queryable, ids: readonly number[]): Promise<Skill[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<Skill>(
    'SELECT id, name FROM skills WHERE id = ANY($1::int[]) ORDER BY id',
    [ids],
  );
  return rows;
}
