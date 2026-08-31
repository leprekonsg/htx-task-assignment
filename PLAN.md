# HTX Take-Home — Task Assignment App: Build Plan (v2)

Source: `Software Engineering Take Home Test v2.0.pdf` (6 pages). Received ~2026-08-31; due within **3 calendar days** (email for up to +2 if needed — decide by end of Day 2).
Submit by email to Paul Weng, Alvin Koh, Benjamin Ng, Vincent Goh (@htx.gov.sg) with the public repo link + the Gemini API key.

> v2 (2026-08-31) incorporates an external review of v1: Rule B made concurrency-safe, schedule rebuilt around a Day-1 vertical slice, API bundler dropped, exact version pins, honest `skills_source`, edge-case test matrix. Library/LLM facts were vetted against primary sources — see `docs/research/` (the SDK retry claim there is corrected in its errata section; the numbers below are verified against `@google/genai` 2.19.0's published source).

---

## 1. What the spec asks for (condensed)

| Part | Requirement | Gotchas |
|---|---|---|
| 1 | PostgreSQL: Developers, Tasks, Skills; Dev↔Skill M:N; Task↔Skill M:N; task status. Seed Alice(FE), Bob(BE), Carol(FE+BE), Dave(BE). | Idempotent seed; skills are a lookup table. |
| 2 | TS/Node API: task create/read/update (assign, status); developer read; skill read. **Rule A:** assignee's skills ⊇ task's skills. | Enforce server-side in a transaction. |
| 3 | React/TS SPA: Task List (title, skills, status ▾, assignee ▾) + Create Task (title, optional skills, no assignee). | UI filters to eligible devs *and* API rejects ineligible ones. |
| 4 | Subtasks with identical properties → self-referencing FK. **Rule B:** parent can be Done only if all subtasks Done. Creation page nests components dynamically (1 → 1.1 → 1.1.1). | Recursion in schema, service and form. **Rule B is a cross-row invariant → needs a locking strategy, not just a check.** |
| 5 | LLM infers skills from the title when none are given, automatically, backend-side. | Free-tier quota is shared by every reviewer using the emailed key; must degrade gracefully **and be honest about when the LLM was not used**. |
| 6 | Docker Compose runs everything. | Reviewer runs `docker compose up --build` on a clean clone. Migrations + seed automatic. |
| 7 | Public repo; README = run/config + system design + API docs + **justification of every dependency**. Git history is reviewed. | Fewer dependencies = less to justify. Small, readable commits from the first hour. |

Graded on: best practices, code quality, being able to explain the code.

---

## 2. Decisions

| Area | Choice | Why |
|---|---|---|
| Git | `git init` is the **first** command, before scaffolding; conventional commits per milestone | History is a deliverable. |
| Repo layout | npm workspaces: `apps/api`, `apps/web`, `packages/shared` | npm 11 is installed; one lockfile; shared Zod schemas = one source of truth for API validation, env config, LLM output parsing and the React form. |
| Build | **`tsc -b` with project references — no bundler.** `packages/shared` emits `dist/` (`main`/`types` → dist); api emits `dist/`; Node runs plain ESM JS | A small API doesn't need bundling; zero extra deps to justify. Cost: shared must be built before api/web (root `npm run build`; in dev `tsc -b -w` alongside `tsx watch` and `vite` via one `concurrently` dev-dep). |
| Backend | **Fastify 5** + `@fastify/swagger` + `@fastify/swagger-ui` + `fastify-type-provider-zod` | OpenJS Foundation project, schema-first routes, pino logging built in, Swagger UI at `/docs` covers the API-docs deliverable. |
| Validation | **Zod 4** (`fastify-type-provider-zod` v7 needs ≥ 4.2) | One schema, four uses. |
| DB access | **Drizzle ORM + drizzle-kit** on `pg`; readable SQL migrations committed | Schema as TS, no query-engine binary, raw `sql` for the recursive CTEs. Drizzle is pre-1.0 — say so in the README. Must be ≥ 0.45.2 (SQLi fix GHSA-gpj5-g38j-94v9); pin an exact version. |
| Migrations | `0001_init` (Part 1) → `0002_subtasks` (Part 4: `parent_task_id`, `skills_source`, `skills_model`) run by a one-shot compose `migrate` service using drizzle's programmatic `migrate()` + seed | Mirrors the spec narrative; shows migration discipline. |
| Frontend | **Vite + React 19 + TS**, `react-router` (declarative mode, package `react-router` — not `react-router-dom`), **TanStack Query v5**, Tailwind v4 via `@tailwindcss/vite` | Router kept: two *pages* with distinct, bookmarkable URLs (`/`, `/tasks/new`) is what "SPA with pages" implies; its declarative API is ~4 imports. TanStack Query removes real async-state boilerplate. Tailwind = one dep, zero config. |
| Versions | **Scaffold from official templates (`npm create vite@latest -- --template react-ts`) and accept the versions they emit**; then align typescript-eslint's supported TS range (currently caps at `<6.1`, so TS 6.0.x — fall back to 5.9.x if anything fights). **Exact pins** for all direct deps (`.npmrc`: `save-exact=true`), committed lockfile, `npm ci` everywhere | Vite 8 + react-router 8 + ESLint 10 + Node 24 + TS 6 are all new majors; peer ranges were checked individually (see research) but the cheapest insurance is letting the templates pick, then pinning. |
| Form state | `useReducer` over an immutable tree with path-based actions + a recursive `TaskNodeForm` | Pure reducer is unit-testable and easy to explain. |
| IDs / status | integer identity; enum `todo \| in_progress \| done` with display labels in shared | Simple, matches the spec's "To-do / Done / etc." |
| LLM | `@google/genai` v2 (`@google/generative-ai` is EOL). Default `LLM_MODEL=gemini-3.5-flash-lite` (Stable, current lowest-cost Flash-Lite per Google's own dev skill; `gemini-2.5-flash-lite` is the alternative). `generateContent` + `responseMimeType: application/json` + `responseSchema`, `temperature: 0`, one batched call per create request, behind a `SkillClassifier` interface | Spec suggests Gemini's free tier. Fallback order: Gemini → (optional `LLM_FALLBACK_MODEL`, e.g. Gemma 4 — leave unset until its JSON-mode behaviour is tested with your key; never described as a quota guarantee) → **deterministic keyword heuristic** → `unresolved`. |
| LLM honesty | `tasks.skills_source ∈ {user, llm, heuristic, unresolved}` + `skills_model text null`; UI badge per source; README states the heuristic is graceful degradation, **not** Part 5; final QA demonstrates the Gemini path (log line + screenshot) | Prevents the app from looking like it satisfies Part 5 without an LLM. |
| LLM resilience | Retries are **opt-in** in `@google/genai` 2.19.0 — no `retryOptions` ⇒ no retries. Pass `httpOptions: { timeout: 8_000, retryOptions: { attempts: 3, initialDelay: 0.5, maxDelay: 4 } }` (timeout is **ms per attempt**; retried codes default to 408/429/500/502/503/504) and `config.abortSignal = AbortSignal.timeout(20_000)` as the whole-call budget. Task creation never fails because of the LLM (fail-open) | Verified against the package's `dist/node/index.mjs` (`apiCall`) and `GenerateContentConfig` typings. Keeps the synchronous create endpoint bounded at ~20 s worst case. |
| Testing | **Vitest** everywhere. API: unit tests for rules, integration tests against real Postgres (compose `db`), including a **concurrency test** for Rule B and a **rollback test** for nested create. Web: Testing Library + jsdom for the tree reducer/form and list row | Rules A/B, the tree, and LLM parsing are what a reviewer pokes. |
| Lint/format | ESLint flat config + typescript-eslint + Prettier + `eslint-config-prettier`, `strict: true` | Table stakes. |
| Containers | `db` (postgres:17-alpine) → `migrate` (one-shot) → `api` (node:24-alpine, `engines.node >=24.15`) → `web` (nginx serving Vite build, proxying `/api` → api) | Single origin, healthchecks + `depends_on` conditions. |
| CI | GitHub Actions: lint, typecheck, tests (Postgres service container), `docker compose build` | Proves the tests are real. |
| README scope | Design, ERD, API, rules/assumptions, LLM design, testing, dependency table, run/config. **Supply-chain vetting and browser-floor notes stay in `docs/research/`**, referenced by one line; a short "Known limitations" section carries the Tailwind v4 browser floor | Keep the README about the design. |

### Assumptions to state in the README
1. Eligibility = `developer.skills ⊇ task.skills`; a task with no skills (`unresolved`) is assignable to anyone — flagged in UI.
2. Required skills are fixed at creation; updates are `status` and `assignee` only (Part 2's list).
3. Status transitions are free **except**: `→ done` requires every descendant `done`; reopening (`done → *`) is rejected while any ancestor is `done`; adding a subtask under a `done` ancestor is rejected. Together these keep the invariant *"a done task has no non-done descendant."* (Cascade-reopen is noted as future work.)
4. Unassigning (`assigneeId: null`) is allowed.
5. A subtask tree is created atomically in one `POST /api/tasks` (one transaction). Max depth 5, title 1–500 chars, no duplicate skill ids in a node.
6. No auth, delete, or multi-tenancy.
7. Task List shows the hierarchy (indented, numbered 1 / 1.1 / 1.1.1) because subtasks *are* tasks.
8. LLM: task titles are sent to Google; on the free tier Google may use them to improve its products (no Singapore carve-out) — one-line disclosure. Free-tier quotas are not published; they're visible in the AI Studio dashboard.

---

## 3. Architecture

```
htx-task-assignment/
├── package.json  package-lock.json  .npmrc(save-exact)  .nvmrc(24)  tsconfig.base.json
├── docker-compose.yml  .env.example  .github/workflows/ci.yml  README.md  docs/research/
├── packages/shared/          # tsconfig composite → dist/ ; main/types → dist
│   └── src/ task.ts developer.ts skill.ts status.ts eligibility.ts(canAssign)
├── apps/api/                 # tsconfig references ../../packages/shared
│   ├── Dockerfile  drizzle.config.ts  drizzle/0001_init.sql  0002_subtasks.sql
│   └── src/
│       ├── config.ts         # zod-validated env: DATABASE_URL PORT LLM_PROVIDER GEMINI_API_KEY LLM_MODEL LLM_FALLBACK_MODEL
│       ├── db/{schema,client,migrate,seed}.ts
│       ├── repositories/     # SQL only (tasks, developers, skills)
│       ├── services/         # rules only: tasks.service.ts (Rule A, Rule B + tree lock, tree insert, LLM merge)
│       ├── llm/              # SkillClassifier, gemini.ts, heuristic.ts, prompt.ts
│       ├── routes/  errors.ts  app.ts  server.ts
└── apps/web/
    ├── Dockerfile  nginx.conf  vite.config.ts (dev proxy /api → :3000)
    └── src/ api/{client,hooks}.ts  pages/{TaskListPage,CreateTaskPage}.tsx
         components/{TaskRow,StatusSelect,AssigneeSelect,SkillBadges}.tsx
         components/task-form/{TaskNodeForm.tsx, treeReducer.ts, treeReducer.test.ts}
```

### Data model
```
developers(id, name, created_at)
skills(id, name UNIQUE)
developer_skills(developer_id FK, skill_id FK, PK(both))
tasks(id, title, status task_status DEFAULT 'todo', assignee_id FK→developers NULL,
      parent_task_id FK→tasks NULL ON DELETE CASCADE            [0002]
      skills_source ('user'|'llm'|'heuristic'|'unresolved'),  [0002]
      skills_model text NULL,                                  [0002]
      created_at, updated_at)
task_skills(task_id FK CASCADE, skill_id FK, PK(both))
indexes: tasks(parent_task_id), tasks(assignee_id), task_skills(skill_id)
```

### API
| Method | Path | Body / notes | Errors |
|---|---|---|---|
| GET | `/api/health` | | |
| GET | `/api/skills` | | |
| GET | `/api/developers`, `/api/developers/:id` | with `skills[]` | 404 |
| GET | `/api/tasks` | roots with nested `subtasks[]`; each has `skills[]`, `assignee`, `status`, `skillsSource`, `skillsModel` | |
| GET | `/api/tasks/:id` | task + nested subtasks | 404 |
| POST | `/api/tasks` | `{ title, skillIds?, parentId?, subtasks?: [same shape] }` → 201 tree. Nodes without `skillIds` → one batched classifier call → insert transaction | 400 validation · 404 parent/skill · 409 `PARENT_IS_DONE` |
| PATCH | `/api/tasks/:id` | `{ status?, assigneeId? }` (≥ 1 field) | 400 · 404 task/developer · 409 `DEVELOPER_LACKS_SKILLS` / `SUBTASKS_NOT_DONE` / `ANCESTOR_IS_DONE` |

Error envelope `{ error: { code, message, details? } }`. Swagger UI at `/docs`.

### Rule B — concurrency-safe design
Locking only the target row is **not** enough: T1 (parent → done) could pass its descendant check while T2 (child → todo) commits, leaving a done parent with a todo child. Fix: **every mutation that can affect a tree's invariant first takes a row lock on the tree's root**, serialising all such mutations per tree:

```sql
BEGIN;
-- 1. walk up to the root (also yields the ancestor list)
WITH RECURSIVE up AS (
  SELECT id, parent_task_id, status FROM tasks WHERE id = $target
  UNION ALL
  SELECT t.id, t.parent_task_id, t.status FROM tasks t JOIN up ON t.id = up.parent_task_id
) SELECT ... ;
SELECT id FROM tasks WHERE id = $root FOR UPDATE;      -- 2. serialise the tree
-- 3. re-read + check under the lock (READ COMMITTED gives each statement a fresh snapshot,
--    so a waiter sees the winner's committed state):
--    → done      : recursive CTE over descendants, any status <> 'done' → 409 SUBTASKS_NOT_DONE
--    done → *    : any ancestor in `up` with status = 'done' → 409 ANCESTOR_IS_DONE
--    add subtask : parent or any ancestor 'done' → 409 PARENT_IS_DONE
UPDATE / INSERT ...; COMMIT;
```
Applies to: status change, create-with-`parentId`. Assignment (Rule A) touches no cross-row invariant and skills are immutable in this API, so it needs only its own transaction. Alternative considered: `SERIALIZABLE` + retry on `40001` — more moving parts for no benefit at this scale. **Test:** an integration test runs `parent→done` and `child→todo` concurrently N times over two pool connections and asserts the invariant after every round.

### Other key algorithms
- **Tree insert**: DFS inserting parent before children in one transaction; any failure (e.g. unknown skill id on a deep node) rolls back everything — tested.
- **Classifier**: `classify([{ref, title}]) → [{ref, skills: string[]}]`. Prompt lists allowed skill names *from the DB* + the 3 few-shot examples from the spec. Zod-validates the response, drops unknown skill names; refs missing from the response fall through to the heuristic. Provider chain: Gemini (explicit `retryOptions`, per-attempt `timeout`, whole-call `abortSignal`) → optional fallback model → heuristic → `unresolved`. Result is tagged with `skills_source` / `skills_model`.
- **GET tree assembly**: one query for tasks, one for task_skills, build in memory.

---

## 4. Schedule — vertical slice first

Honest estimate: **~25–30 focused hours**; at ~9 h/day that is tight, not comfortable. The +2-day extension is the buffer — decide by the end of Day 2 and email if needed.

### Day 0 — before any code (~45 min)
- [ ] `git init` + `.gitignore` + `README.md` stub → first commit
- [ ] Install Docker (`brew install --cask docker` or OrbStack) — not installed; Postgres comes from Docker from hour 1 (no `psql` locally either)
- [ ] Gemini key at aistudio.google.com → `.env` (dedicated key for the submission). Note the project's live limits in the AI Studio dashboard.
- [ ] Create the public GitHub repo, push the stub

### Day 1 — a complete, runnable slice (Parts 1, 2, 3, 6 — flat tasks)
| # | Milestone | Done when | Commit |
|---|---|---|---|
| M0 | Scaffold | workspaces, TS project refs, ESLint/Prettier, Vitest, `compose up db`, `npm run dev` runs api+web | `chore: scaffold monorepo` |
| M1 | Schema | `0001_init.sql`, idempotent seed, ERD sketch | `feat(db): schema and seed` |
| M2 | API (flat) | skills/developers read; tasks create/read/patch with **Rule A**; Swagger; Rule A tests | `feat(api): tasks, developers, skills` |
| M3 | Web (flat) | list page = wireframe (status ▾, assignee ▾ filtered to eligible, 409 toast); create page (title + skills) | `feat(web): task list and create pages` |
| M4 | Compose | `docker compose up --build` from a clean clone serves the app end to end | `feat: docker compose` |

End of Day 1: Parts 1–3 and 6 are demonstrable. Everything after this is depth.

### Day 2 — depth (Parts 4, 5)
| # | Milestone | Done when | Commit |
|---|---|---|---|
| M5 | Subtasks | `0002` migration; nested atomic create + rollback test; **Rule B with root lock + concurrency test**; tree list UI with numbering; recursive form + reducer tests | `feat: subtasks and completion rule` |
| M6 | LLM | `SkillClassifier`; Gemini structured output with explicit retry/timeout/abort; heuristic fallback; `skills_source` badge; tests with a fake classifier incl. forced failure | `feat(llm): infer skills on create` |
| — | Re-verify compose after both | | |
| — | **Decision point:** request the +2 days if M5/M6 slipped | | |

### Day 3 — ship (Part 7)
| # | Milestone | Done when |
|---|---|---|
| M7 | Tests | edge-case matrix (§5) green; CI green |
| M8 | README | quick start · config · architecture · ERD · API + `/docs` · rules & assumptions · LLM design (incl. honesty + disclosure) · testing · dependency table · known limitations · future work |
| M9 | QA + submit | fresh clone → `cp .env.example .env` → `docker compose up --build` → acceptance list; capture the Gemini-path evidence; tag `v1.0.0`; email |

Stretch only after M9: `POST /api/tasks/:id/infer-skills`, list filtering, optimistic updates, Playwright smoke.

---

## 5. Test matrix
**Unit** (no DB): `canAssign` (superset, empty skills, missing skills); tree reducer (add/remove/update at any path, depth cap); classifier response parsing (unknown skill names dropped, missing refs, malformed JSON); heuristic classifier; prompt builder uses DB skill names.

**API integration** (real Postgres):
| Case | Expect |
|---|---|
| create with empty / whitespace / 501-char title | 400 |
| create with unknown skill id · duplicate skill ids in a node | 404 · 400 |
| create nested deeper than 5 | 400 |
| create with `parentId` unknown · parent `done` | 404 · 409 |
| nested create where a deep node is invalid | 4xx and **nothing persisted** |
| assign eligible dev · ineligible dev · unknown dev · `null` | 200 · 409 · 404 · 200 |
| PATCH with empty body | 400 |
| parent → done with a todo child · after children done | 409 · 200 |
| reopen child under done parent | 409 |
| **concurrent** parent→done vs child→todo, N rounds | invariant holds every round |
| create without skills, classifier stub returns Frontend | skills = [Frontend], `skills_source = llm` |
| create without skills, classifier stub throws | task created, `skills_source = heuristic` (or `unresolved`), 201 with warning |

**Web**: list row renders skills/status/assignee and only eligible devs; 409 shows an error; create page adds/removes nested subtasks and submits the expected payload.

---

## 6. Acceptance checklist (walk before emailing)
- [ ] 1.1 entities, M:N tables, status enum, FKs · 1.2 seed matches the table
- [ ] 2.1 all endpoints; Rule A: Bob on a Frontend task → 409, Carol → 200
- [ ] 3.1 list page + both dropdowns work; create page has no assignee field
- [ ] 4.1 `parent_task_id` migration · 4.2 parent→Done with a To-do subtask → 409 with clear UI message · 4.3 nested "Add Subtask" to depth 5, numbered, saved in one request
- [ ] 5.x task created without skills gets skills **from Gemini** (badge says so; server log shows the model id) — screenshot/log saved for the README
- [ ] 5.x no key / LLM failure → heuristic badge, app keeps working; README calls this degradation, not Part 5
- [ ] 6.x `docker compose up --build` on a clean clone → http://localhost:8080; migrations + seed automatic; works with and without `GEMINI_API_KEY`
- [ ] 7.1 public repo, README complete, readable history · 7.2 email sent with link + key

---

## 7. Risks
| Risk | Mitigation |
|---|---|
| Rule B race (done parent with undone child) | Root-row lock per tree + concurrency test (§3). |
| New-major stack (Vite 8, RR 8, ESLint 10, TS 6, Node 24) fights | Scaffold from official templates and pin what they emit; peer ranges pre-checked; fall back one major (TS 5.9) if needed. |
| Shared-package build step in monorepo | `tsc -b` project references; root `build` script; Docker build context = repo root; compose smoke-tested end of Day 1. |
| Gemini free tier throttles the shared reviewer key | One batched call per request; explicit SDK retries (opt-in!); bounded ~20 s budget; heuristic fallback; `skills_source` makes any degradation visible. Enabling billing lifts Gemini to Tier 1 if ever needed. |
| Docker not installed locally | Day 0. |
| Time | Day-1 slice guarantees a submittable app; extension decision at end of Day 2. |
