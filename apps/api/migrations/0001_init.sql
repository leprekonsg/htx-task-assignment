-- Part 1: developers, skills, tasks and the two many-to-many relations.

CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');

CREATE TABLE developers (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL UNIQUE
);

CREATE TABLE developer_skills (
  developer_id  integer NOT NULL REFERENCES developers (id) ON DELETE CASCADE,
  skill_id      integer NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (developer_id, skill_id)
);

CREATE TABLE tasks (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  status       task_status NOT NULL DEFAULT 'todo',
  assignee_id  integer REFERENCES developers (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_skills (
  task_id   integer NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  skill_id  integer NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (task_id, skill_id)
);

CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX task_skills_skill_id_idx ON task_skills (skill_id);
