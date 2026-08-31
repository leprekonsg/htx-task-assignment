import type { Developer } from '@htx/shared';
import type { Queryable } from '../../db/pool.js';

interface DeveloperRow {
  id: number;
  name: string;
  /** json_agg of the developer's skills, [] when none. */
  skills: { id: number; name: string }[];
}

const SELECT_DEVELOPERS = `
  SELECT d.id, d.name,
         COALESCE(
           json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
             FILTER (WHERE s.id IS NOT NULL),
           '[]'::json
         ) AS skills
  FROM developers d
  LEFT JOIN developer_skills ds ON ds.developer_id = d.id
  LEFT JOIN skills s ON s.id = ds.skill_id`;

export async function listDevelopers(db: Queryable): Promise<Developer[]> {
  const { rows } = await db.query<DeveloperRow>(`${SELECT_DEVELOPERS} GROUP BY d.id ORDER BY d.id`);
  return rows;
}

export async function findDeveloperById(db: Queryable, id: number): Promise<Developer | null> {
  const { rows } = await db.query<DeveloperRow>(
    `${SELECT_DEVELOPERS} WHERE d.id = $1 GROUP BY d.id`,
    [id],
  );
  return rows[0] ?? null;
}
