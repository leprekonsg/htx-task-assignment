-- Part 5: record how a task's skills were determined, so LLM use (or its absence) is visible in the data.
--   user        skills were supplied in the create request
--   llm         skills were inferred from the title by the model named in skills_model
--   unresolved  no skills supplied and inference was unavailable (no key, quota, timeout)

ALTER TABLE tasks
  ADD COLUMN skills_source text NOT NULL DEFAULT 'user'
    CHECK (skills_source IN ('user', 'llm', 'unresolved')),
  ADD COLUMN skills_model text;
