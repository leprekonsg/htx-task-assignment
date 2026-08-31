# Build Plan — Task Assignment App

Source: HTX xDigital *Software Engineering Take Home Test v2.0*. Received 2026-08-31; hard deadline three calendar days later.
Decision: build the whole thing on day one, spend day two reading and reviewing, submit with a day in hand.

This is the plan as executed (v3). Earlier drafts (a three-day schedule with Drizzle, a keyword heuristic, etc.) were revised
in a question-by-question review before any code was written; the reasons for each change are recorded below so the
trade-offs stay visible. Library and LLM facts were checked against primary sources first — see `docs/research/`.

## 1. What the spec asks for

| Part | Requirement | What it implies |
|---|---|---|
| 1 | Postgres: Developers, Tasks, Skills; Dev↔Skill and Task↔Skill many-to-many; task status; seed Alice (FE), Bob (BE), Carol (FE+BE), Dave (BE) | Skills are a lookup table; the seed must be idempotent |
| 2 | TS/Node API: create/read/update tasks (assign, status), read developers, read skills. **Rule A:** a developer can only take a task whose skills they all hold | Enforce server-side, inside a transaction |
| 3 | React/TS SPA: Task List (title, skills, status ▾, assignee ▾) and Create Task (title, optional skills — no assignee) | UI filters to eligible developers *and* the API rejects the rest |
| 4 | Subtasks with the same properties. **Rule B:** parent Done only when all subtasks Done. Nested, dynamically rendered create form (1 → 1.1 → 1.1.1) | Self-referencing FK, recursive queries, recursive form component; Rule B is a cross-row invariant → needs a locking strategy |
| 5 | LLM infers skills from the title when none are given, automatically, on the backend | Must degrade gracefully and be honest about when the LLM was *not* used |
| 6 | Docker Compose runs everything | `docker compose up --build` on a clean clone; migrations and seed automatic |
| 7 | Public repo + README (run/config, design, API docs, dependency justification) | Git history is reviewed; fewer dependencies = less to justify |

## 2. Decisions

| Area | Decision | Why (and what was rejected) |
|---|---|---|
| Layout | npm workspaces: `packages/shared`, `apps/api`, `apps/web`; TypeScript project references built with `tsc -b`; no bundler for the API | One lockfile; shared Zod schemas are the single source of truth for validation, API types, the React form and the LLM output. A bundler (tsup/tsdown) was dropped — nothing to gain for a small API |
| Versions | Scaffold from the official Vite template and pin exactly what it emits (`.npmrc save-exact`) | Vite 8, React 19.2, TS 6.0, ESLint 10 are all recent majors; the template is the tested combination |
| API | Fastify 5 + Zod 4 via `fastify-type-provider-zod` + `@fastify/swagger(-ui)`; pino logging | Schema-first routes give validation and OpenAPI from one definition; Swagger UI at `/docs` is the API-docs deliverable |
| Database access | **Plain `pg`**, hand-written SQL migrations, a ~40-line forward-only runner | Rule B and the tree reads are raw SQL anyway (recursive CTEs, `FOR UPDATE`); an ORM (Drizzle was the candidate) would only have covered the CRUD you can read on one screen. "Keep it simple" won |
| Migrations | `0001_init` (Part 1) → `0002_subtasks` (Part 4) → `0003_skill_inference` (Part 5), plus an idempotent `seed.sql`, applied by a one-shot compose service | Mirrors the spec's narrative; shows migration discipline |
| Web | Vite + React 19 + `react-router` (two real URLs) + TanStack Query (server state) + **Tailwind v4 alone** | shadcn was considered and rejected: it needs Tailwind plus ~6 more packages and vendors component code, and replaces the native `<select>` the wireframe calls for. Tokens live in one `@theme` block; utilities reference tokens only |
| Statuses | `todo` · `in_progress` · `done` | The spec says "To-do / Done / etc."; one extra state costs nothing |
| Rule B edges | Reopen under a Done parent → 409; add subtask under a Done ancestor → 409 | Keeps the invariant with one lock; cascade-reopen is listed as future work |
| Rule A on subtasks | A subtask's eligibility uses its **own** skills only | Subtasks are tasks, not slices of the parent |
| Skills catalogue | Exactly `Frontend` and `Backend` (the spec's entities) | Extra skills would create tasks nobody seeded can take. The table is extensible |
| LLM | `@google/genai` structured output; chain **`gemini-3.5-flash-lite` → `gemma-4-31b-it` → `gemma-4-26b-a4b-it` → `unresolved`**, one 15 s budget per create request; `skills_source ∈ {user, llm, unresolved}` + `skills_model` | The emailed key is shared by every reviewer, so 429s are expected: primary gets one retry with backoff, then Gemma (separate quota). A keyword heuristic was dropped — it blurred whether Part 5 was really working. Inference runs *before* the DB transaction so no lock is held during a network call |
| Testing | Vitest everywhere; API integration tests against real Postgres, including a **concurrency test** for Rule B and a **rollback test** for nested create; web tests with Testing Library + jsdom and a mocked `fetch` | The rules, the tree and the LLM parsing are what a reviewer pokes |
| Containers | `db` → `migrate` (one-shot) → `api` → `web` (nginx serves the SPA and proxies `/api` and `/docs`) | Single origin, health-gated start order |
| History | Linear commits on `main`, conventional messages, `Co-Authored-By: Claude` trailers; README states the tooling | Transparency about how the code was produced |

## 3. Rule B — why a check inside a transaction is not enough

Two transactions can each pass their own check against the other's uncommitted state: T1 marks parent P done after seeing
child C done; T2 reopens C after seeing P not done; both commit → a done parent with a todo child. The fix is to serialise
every mutation that can affect a tree's invariant on **one row: the tree's root**. Status changes and create-with-parent
first walk up the ancestor chain (recursive CTE), `SELECT … FOR UPDATE` the root, re-read the statuses they depend on, then
check and write. Under READ COMMITTED each statement sees the latest committed data, so the second transaction sees the
first one's result once it acquires the lock. `SERIALIZABLE` + retry on `40001` would also work but adds retry plumbing for
no benefit at this scale. The concurrency test fires `parent → done` and `child → todo` together for 25 rounds and asserts
the invariant after each.

## 4. Build sequence (as executed)

1. `git init`, `.gitignore`, `.env.example`, first commit; public repo created with `gh`.
2. Scaffold: Vite template, workspaces, project references, ESLint/Prettier/Vitest, compose `db`.
3. Core design (by hand): SQL migrations + seed + runner; shared Zod contracts and Rule A helpers; `TasksService` with the
   root-lock design; `SkillClassifier` interface, Gemini/Gemma classifier, fallback chain; the nested-form reducer.
4. In parallel: Fastify routes/app/server + full test matrix; React pages/components + tests + `docs/frontend-guide.md`;
   Dockerfiles, nginx, compose, GitHub Actions.
5. Compose end-to-end from a clean clone; Gemini-path evidence captured; README; tag `v1.0.0`.

## 5. Test matrix

**Unit:** `canAssign` / `eligibleDevelopers`; request schemas (title bounds, duplicate skill ids, depth 6); tree numbering;
form reducer (paths, structural sharing, depth cap, payload shape); prompt/JSON extraction; classifier chain order and budget;
config parsing.

**API integration (real Postgres):** every error code in `ERROR_CODES` has a test that triggers it; nested create of depth 5
persists all nodes; an invalid deep node rolls back everything; Rule A for each seeded developer; Rule B for done, reopen,
add-under-done and grandchild cases; the concurrency race; inference with a fake classifier (llm / unresolved / empty skills /
unknown skill names / one batched call per request); `/docs/json` is valid.

**Web:** list renders numbering, badges, source tags; ineligible developers are disabled options with a reason; status change
sends the right PATCH; a 409 shows the server message; the create form nests to depth 5 and posts the right payload; submitting
with an empty title focuses and names that task instead of a disabled button; Add/Remove subtask move focus; a failed
skills or developers fetch shows a banner and disables only the affected operation.

**End-to-end (Playwright, `e2e/`):** Chromium against the real `docker compose up --build` stack — nginx → API → Postgres —
so the test exercises the same path a reviewer uses: smoke (health, `/docs`, seed), UI create, Rule A in the assignee
dropdown, a three-level tree from the nested form with 1 / 1.1 / 1.1.1 numbering, both Rule B rejections plus the bottom-up
completion path, the depth-5 form cap, and inference (strict LLM assertion when a key is present, `unresolved` otherwise).

## 6. Acceptance checklist

Verified 2026-08-31 on a clean `docker compose up --build` (Playwright suite, 10/10) plus 135 unit/integration tests.

- [x] 1 — tables, M:N relations, status enum, seed matches the table (`smoke.spec.ts` "seed data is present")
- [x] 2 — all endpoints; Bob on a Frontend task → 409 `DEVELOPER_LACKS_SKILLS`, Carol → 200 (`rule-a.spec.ts`)
- [x] 3 — list with both dropdowns; create page without an assignee field (`create-task.spec.ts`, web tests)
- [x] 4 — nested create to depth 5 in one request; parent Done with a To-do subtask → 409 "All subtasks must be Done"
      (`subtasks-rule-b.spec.ts`)
- [x] 5 — task created without skills gets them **from Gemini**: `inference.spec.ts` asserts `skillsSource = 'llm'`
      and the API log shows `model: gemini-3.5-flash-lite … skills inferred` (1.3 s); without a key the same test asserts
      the `unresolved` path. Gemma fallbacks probed live through the real classifier (see research errata 2).
- [x] 6 — `docker compose up --build` on a clean clone → http://localhost:8080; `/docs` served through nginx
- [ ] 7 — README complete and history readable (done); email with link + key — to be sent by hand

## 7. Known limitations / future work

Cascade-reopen of ancestors; task deletion; list filtering/search; optimistic UI updates; a keyword fallback for skill
inference if a trustworthy one is found; authentication. Tailwind v4 requires Safari 16.4+ / Chrome 111+ / Firefox 128+.
