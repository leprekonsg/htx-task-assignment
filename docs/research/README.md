# Research notes

Primary-source research (official docs, npm registry, GitHub advisories/OSV, Google's own documentation) that informed the decisions in `../../PLAN.md`. Each file cites the source of every claim.

| Note | Question answered | Date |
|---|---|---|
| [library-vetting-backend.md](library-vetting-backend.md) | Are Fastify 5, Zod 4, Drizzle, pg, `@google/genai`, tsup, tsx, Vitest, pino and the Docker base images current, maintained, licensed permissively and free of known vulnerabilities? Is Fastify defensible vs Express/NestJS? | 2026-08-31 |
| [library-vetting-frontend.md](library-vetting-frontend.md) | Same question for Vite, React 19, react-router, TanStack Query, Tailwind v4, Testing Library, jsdom/happy-dom, TypeScript, ESLint, typescript-eslint, Prettier, Zod-in-browser. | 2026-08-31 |
| [llm-provider-rate-limits.md](llm-provider-rate-limits.md) | Can Gemma (via Google's API) replace Gemini to avoid free-tier rate limits? What do the current limits, model IDs, JSON-mode support, SDK retry behaviour and free-tier data terms actually say? | 2026-08-31 |
