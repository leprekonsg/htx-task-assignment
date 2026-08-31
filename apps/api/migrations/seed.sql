-- Seed data from the assignment. Idempotent: fixed ids, ON CONFLICT DO NOTHING, sequences re-synced.

INSERT INTO skills (id, name) OVERRIDING SYSTEM VALUE
VALUES (1, 'Frontend'), (2, 'Backend')
ON CONFLICT (id) DO NOTHING;

INSERT INTO developers (id, name) OVERRIDING SYSTEM VALUE
VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Carol'), (4, 'Dave')
ON CONFLICT (id) DO NOTHING;

INSERT INTO developer_skills (developer_id, skill_id)
VALUES
  (1, 1),         -- Alice: Frontend
  (2, 2),         -- Bob:   Backend
  (3, 1), (3, 2), -- Carol: Frontend, Backend
  (4, 2)          -- Dave:  Backend
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('skills', 'id'), (SELECT max(id) FROM skills));
SELECT setval(pg_get_serial_sequence('developers', 'id'), (SELECT max(id) FROM developers));
