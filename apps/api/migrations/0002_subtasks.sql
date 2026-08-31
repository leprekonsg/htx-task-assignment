-- Part 4: subtasks. A subtask is a task with a parent; the tree is unbounded in SQL and bounded (depth 5) by the API.

ALTER TABLE tasks
  ADD COLUMN parent_task_id integer REFERENCES tasks (id) ON DELETE CASCADE,
  ADD CONSTRAINT tasks_parent_not_self CHECK (parent_task_id IS NULL OR parent_task_id <> id);

CREATE INDEX tasks_parent_task_id_idx ON tasks (parent_task_id);
