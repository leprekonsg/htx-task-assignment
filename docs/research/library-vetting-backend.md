# Backend Dependency Vetting — Task Assignment App

Researched: 2026-08-31

**Question answered:** For the planned backend stack (fastify 5, @fastify/swagger + @fastify/swagger-ui, fastify-type-provider-zod, zod, drizzle-orm + drizzle-kit on `pg`, @google/genai, tsup, tsx, vitest, pino, and the Docker base images `node:24-alpine` / `postgres:16-alpine`), is each dependency (a) on a current, actively maintained release, (b) permissively licensed, (c) free of known vulnerabilities in the version we'd pin, and (d) compatible with the rest of the stack (Node 24, Fastify 5, Zod major, Drizzle driver) — with a KEEP / KEEP WITH CAVEAT / SWAP verdict per library, defensible enough to write into a README for an HTX (Singapore government agency) take-home review.

All version/date facts below were pulled live on 2026-08-31 via `npm view <pkg> version license repository.url time --json`, the OSV API (`https://api.osv.dev/v1/query` and `/v1/vulns/<id>`, which mirrors the GitHub Advisory Database), and each project's own GitHub repository/README. No fact is sourced from a blog post or news article except where explicitly noted as supplementary context (labelled "secondary").

## Summary

| Library | Latest version (date) | License | Vulns in latest | Verdict |
|---|---|---|---|---|
| fastify | 5.12.1 (2026-08-18) | MIT | None. 10 historical GHSAs, all fixed at or before 5.8.5 | KEEP |
| @fastify/swagger | 9.8.1 (2026-07-13) | MIT | None found | KEEP |
| @fastify/swagger-ui | 6.1.1 (2026-07-28) | MIT | None. 1 historical GHSA fixed at 2.1.0 | KEEP |
| fastify-type-provider-zod | 7.0.0 (2026-06-24) | MIT | None found | KEEP |
| zod | 4.5.4 (2026-08-29) | MIT | None. 1 historical DoS advisory fixed at 3.22.3 (zod 3 era) | KEEP |
| drizzle-orm | 0.45.2 stable (2026-03-27); 1.0.0-rc.4 prerelease also on npm (2026-06-27) | Apache-2.0 | None in 0.45.2. A SQL-injection GHSA was fixed exactly *at* 0.45.2 | KEEP WITH CAVEAT |
| drizzle-kit | 0.31.10 (2026-03-17) | MIT | None found | KEEP WITH CAVEAT |
| pg (node-postgres) | 8.23.0 (2026-08-08) | MIT | None. 1 historical RCE (2018) fixed by 7.1.2, long before current major | KEEP |
| @google/genai | 2.19.0 (2026-08-25) | Apache-2.0 | None found | KEEP |
| @google/generative-ai | 0.24.1 (2025-04-29, unmaintained since) | Apache-2.0 | None found, but repo is EOL | SWAP → already replaced by @google/genai in the plan; confirmed correct |
| tsup | 8.5.1 (2025-11-12) | MIT | None in 8.5.1 (DOM-clobbering GHSA fixed after 8.3.4). Repo itself is unmaintained | SWAP → tsdown |
| tsx | 4.23.13 (2026-08-30) | MIT | None found | KEEP |
| vitest | 4.1.11 (2026-08-18) | MIT | None in 4.1.11. Historical RCE/file-read GHSAs fixed by 3.0.5/3.2.6/4.1.0 | KEEP |
| pino | 10.3.1 (2026-02-09) | MIT | None found | KEEP |
| node:24-alpine | Node 24 "Krypton" — Active LTS since 2025-10-28 | — | — | KEEP |
| postgres:16-alpine | PostgreSQL 16 — current major is 18; PG16 supported until 2028-11-09 | — | — | KEEP WITH CAVEAT (consider 17/18 for a greenfield project) |

No package in this stack matched any package name published in the CSA Singapore Shai-Hulud advisory (`ad-2026-009`, 6 Aug 2026) or in the original Sept 2025 wave, and none of the 14 npm packages returned a malware-type entry from the OSV/GHSA database query.

## Findings

### fastify
1. Latest stable: **5.12.1**, published **2026-08-18**. Source: `npm view fastify version time --json`.
2. License: **MIT**. Source: `npm view fastify license`.
3. No advisory affects 5.12.1. OSV lists 10 historical GHSAs for the `fastify` npm package; the highest "fixed" version among them is 5.8.5 (GHSA-247c-9743-5963, content-type validation bypass), so 5.12.1 is patched against all of them. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"fastify","ecosystem":"npm"}}` and `GET https://api.osv.dev/v1/vulns/GHSA-247c-9743-5963` (and the other 9 IDs, each cross-checked individually). Not named in the CSA Singapore Shai-Hulud advisory (https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/, published 2026-08-06) or GitHub's own incident writeup (https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/, 2025-09-22) — no advisory found.
4. Node 24 support: Fastify v5 requires Node.js v20+ (dropped v18 support in the v5 release). Source: https://openjsf.org/blog/fastifys-growth-and-success. Fastify is an OpenJS Foundation project (the same foundation that stewards Node.js itself), currently at Growth-project stage, which is a governance signal worth citing to a government reviewer as evidence the project isn't a single-maintainer risk. Source: https://openjsf.org/blog/fastify-graduation-performance-and-the-future and https://github.com/fastify/fastify/blob/main/PROJECT_CHARTER.md.
5. Verdict: **KEEP**.

### @fastify/swagger
1. Latest: **9.8.1**, published **2026-07-13**. Source: `npm view @fastify/swagger version time --json`.
2. License: **MIT**. Source: `npm view @fastify/swagger license`.
3. OSV query returned 0 vulnerabilities for `@fastify/swagger`. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"@fastify/swagger","ecosystem":"npm"}}`. No malware advisory found; not on the CSA Singapore Shai-Hulud list.
4. Compatibility: version `>=9.x` supports Fastify `^5.x` per the plugin's own compatibility table in the repo README. Source: https://github.com/fastify/fastify-swagger (README compatibility table). Confirmed via package metadata that `fastify-plugin: ^6.0.0` is the only Fastify-family dependency. Source: `npm view @fastify/swagger dependencies --json`.
5. Verdict: **KEEP**.

### @fastify/swagger-ui
1. Latest: **6.1.1**, published **2026-07-28**. Source: `npm view @fastify/swagger-ui version time --json`.
2. License: **MIT**. Source: `npm view @fastify/swagger-ui license`.
3. One historical advisory, GHSA-62jr-84gf-wmg4 ("Default swagger-ui configuration exposes all files in the module"), published 2024-01-16, affecting versions `>=2.0.0 <2.1.0`. Fixed long before the current major (6.x); 6.1.1 is unaffected. Source: `GET https://api.osv.dev/v1/vulns/GHSA-62jr-84gf-wmg4`. No malware advisory found.
4. Compatibility: current major `^5.x` of this plugin supports Fastify `^5.x` together with `@fastify/swagger` `^9.x`, per its own README compatibility table, which also warns that plugin support ends when the corresponding Fastify major goes out of support. Source: https://github.com/fastify/fastify-swagger-ui (README compatibility table).
5. Verdict: **KEEP**.

### fastify-type-provider-zod
1. Latest: **7.0.0**, published **2026-06-24**. Source: `npm view fastify-type-provider-zod version time --json`.
2. License: **MIT**. Source: `npm view fastify-type-provider-zod license`.
3. OSV query returned 0 vulnerabilities. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"fastify-type-provider-zod","ecosystem":"npm"}}`. No malware advisory found.
4. Compatibility (critical): `npm view fastify-type-provider-zod peerDependencies --json` returns `{"fastify": "^5.5.0", "zod": ">=4.1.5", "@fastify/swagger": ">=9.5.1", "openapi-types": "^12.1.3"}` — i.e., **version 7.x of this package requires Zod 4 and Fastify 5**, not Zod 3. The project's own README compatibility table confirms the major-version mapping: `<=4.x → Zod 3`, `5.x–6.x → Zod 4`, `>=7.x → Zod 4.2+` (v7 relies on Zod's `.encode()`/`.decode()` APIs introduced in Zod 4.2, so pin zod to `>=4.2` in practice even though the raw peer range allows `>=4.1.5`). Source: https://github.com/turkerdev/fastify-type-provider-zod (README). With fastify 5.12.1, zod 4.5.4, and @fastify/swagger 9.8.1 all in the plan, every peer constraint is satisfied.
5. Verdict: **KEEP**. Pin zod to `^4.2` (not just `>=4.1.5`) in package.json to match the feature (not just semver) requirement the README calls out.

### zod
1. Latest stable: **4.5.4**, published **2026-08-29** (one release old as of research date — very actively maintained). Zod 4.0.0 itself was published **2025-07-09**. Source: `npm view zod version time --json`.
2. License: **MIT**. Source: `npm view zod license`.
3. One historical advisory, GHSA-m95q-7qp3-xv42 (DoS via untrusted input), published 2023-09-28, fixed at 3.22.3 — from the Zod 3 era, long before 4.5.4. No other vulnerabilities. Source: `GET https://api.osv.dev/v1/vulns/GHSA-m95q-7qp3-xv42`; `POST https://api.osv.dev/v1/query`. No malware advisory found.
4. Zod 4 is confirmed the current stable major: `npm view zod dist-tags --json` shows `"latest": "4.5.4"`, with `next`/`canary`/`beta`/`alpha` tags all also tracking the 4.x/3.25.x pre-4 lineage — there is no 3.x `latest` tag anymore, i.e., Zod 3 is no longer the recommended line. `fastify-type-provider-zod` 7.x requires Zod `>=4.1.5` (see above), so the plan's choice of Zod 4 is required, not optional, for that integration.
5. Verdict: **KEEP**.

### drizzle-orm
1. Latest **stable** (non-prerelease) version: **0.45.2**, published **2026-03-27**. However, `npm view drizzle-orm dist-tags --json` shows the project is well into its 1.0 release-candidate cycle: the `rc` dist-tag points to `1.0.0-rc.4`, published **2026-06-27**, with newer canary builds (`rc5`) tagged even more recently. The 0.x stable line has not shipped a new version since March 2026 (5 months at time of research) while 1.0 rc development is active — a maintenance signal worth flagging, not a red flag by itself. Source: `npm view drizzle-orm version time dist-tags --json`.
2. License: **Apache-2.0** (note: this differs from most of the rest of the stack, which is MIT — still fully permissive and compatible for a government take-home). Source: `npm view drizzle-orm license`.
3. GHSA-gpj5-g38j-94v9 ("Drizzle ORM has SQL injection via improperly escaped SQL identifiers"), published **2026-04-08**, affected the 0.x line from `0` up to (not including) **0.45.2** — i.e., **0.45.2 is exactly the version that fixed this SQL-injection issue**. A second range shows the same class of bug present in early 1.0 betas (`1.0.0-beta.2` to `1.0.0-beta.20`, now fixed). Source: `GET https://api.osv.dev/v1/vulns/GHSA-gpj5-g38j-94v9`. **Action: pin `drizzle-orm` to `>=0.45.2`, never lower**, and treat this as a hard floor in package.json, not just "latest".
4. Compatibility: `pg` is a documented, supported peer (`npm view drizzle-orm peerDependencies --json` includes `"pg": ">=8"`), so `pg@8.23.0` satisfies it. No forced coupling to a specific `drizzle-kit` version was found in either package's metadata (`drizzle-kit`'s own `dependencies` are `tsx`, `esbuild`, `@drizzle-team/brocli`, `@esbuild-kit/esm-loader` — no `drizzle-orm` peerDependency), but both packages ship from the same monorepo (`drizzle-team/drizzle-orm`) and are versioned/released together in practice, so keep them on the same release cadence.
5. Verdict: **KEEP WITH CAVEAT** — 0.45.2 is safe and the SQL-injection floor is met, but the README should note that Drizzle 1.0 is in RC and a future upgrade (0.x → 1.0) will be a breaking change once it ships stable; do not track the `rc`/`beta` dist-tags in production.

### drizzle-kit
1. Latest: **0.31.10**, published **2026-03-17**. Also mid-1.0-RC cycle like drizzle-orm (`rc` dist-tag → `1.0.0-rc.4`). Source: `npm view drizzle-kit version time dist-tags --json`.
2. License: **MIT** (drizzle-kit's own license differs from drizzle-orm's Apache-2.0, but both are permissive). Source: `npm view drizzle-kit license`.
3. OSV query returned 0 vulnerabilities for `drizzle-kit`. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"drizzle-kit","ecosystem":"npm"}}`. No malware advisory found.
4. Compatibility: it is a CLI (migration generation/push/studio) that reads the project's `drizzle.config.ts` and works against whichever dialect/driver drizzle-orm targets — no npm-level peerDependency ties it to a drizzle-orm version, but the two are released from the same repo and should be upgraded together as a pair.
5. Verdict: **KEEP WITH CAVEAT** — same 1.0-RC caveat as drizzle-orm.

### pg (node-postgres)
1. Latest: **8.23.0**, published **2026-08-08**. Source: `npm view pg version time --json`.
2. License: **MIT**. Source: `npm view pg license`.
3. One historical advisory, GHSA-wc9v-mj63-m9g5 ("Remote Code Execution in pg"), published **2018-07-24** — an old CVE-2013-class issue whose fixed-version ranges top out at `7.1.2`; nothing in the 8.x line is listed as affected. 8.23.0 is unaffected. Source: `GET https://api.osv.dev/v1/vulns/GHSA-wc9v-mj63-m9g5`. No malware advisory found; not on the CSA Singapore Shai-Hulud package list.
4. Compatibility: `engines.node` is `>=16.0.0` (source: `npm view pg engines --json`), comfortably covering Node 24. Documented, supported peer of `drizzle-orm` (`"pg": ">=8"`, see above).
5. Verdict: **KEEP**.

### @google/genai
1. Latest: **2.19.0**, published **2026-08-25** — released 6 days before this research, i.e. actively maintained. Source: `npm view @google/genai version time --json`.
2. License: **Apache-2.0**. Source: `npm view @google/genai license`.
3. OSV query returned 0 vulnerabilities. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"@google/genai","ecosystem":"npm"}}`. No malware advisory found.
4. `engines.node` is `>=20.0.0` (source: `npm view @google/genai engines --json`), compatible with Node 24. The package's own README states this is Google's unified SDK created specifically to replace the older per-product SDKs: *"With Gemini 2.0, we took the chance to create a single unified SDK for all developers who want to use Google's GenAI models (Gemini, Veo, Imagen, etc). As part of that process, we took all of the feedback from this SDK and what developers like about other SDKs in the ecosystem to create the Google Gen AI SDK."* Source: https://github.com/googleapis/js-genai (README).
5. Verdict: **KEEP**.

### @google/generative-ai (for contrast — confirms the plan's choice of @google/genai is correct)
1. Latest: **0.24.1**, published **2025-04-29**. No release in the ~16 months since. Source: `npm view @google/generative-ai version time --json`.
2. License: **Apache-2.0**. Source: `npm view @google/generative-ai license`.
3. OSV query returned 0 vulnerabilities, but that is moot given point 4 below. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"@google/generative-ai","ecosystem":"npm"}}`.
4. **The repository's own README states it is fully deprecated and past end-of-life**: *"With Gemini 2.0, we took the chance to create a single unified SDK... to create the Google Gen AI SDK [googleapis/js-genai]."* and, explicitly: **"End-of-Life Date: All support for this repository (including bug fixes) will permanently end on November 30, 2025."** That date has already passed as of this research (2026-08-31) — the package is confirmed EOL, not just "soon to be." Source: https://github.com/google/generative-ai-js (README).
5. Verdict: **SWAP** (already reflected correctly in the plan — @google/genai is the right choice, this entry exists only to document why).

### tsup
1. Latest: **8.5.1**, published **2025-11-12** — roughly 9.5 months old as of this research, the second-oldest "latest" in this stack after drizzle-orm/@google/generative-ai, and there has been no newer release since despite the repo remaining publicly visible. Source: `npm view tsup version time --json`.
2. License: **MIT**. Source: `npm view tsup license`.
3. One historical advisory, GHSA-3mv9-4h5g-vhg3 ("tsup DOM Clobbering vulnerability"), published 2025-03-03, affecting versions up to and including 8.3.4 (`last_affected: 8.3.4`); fixed after that, so 8.5.1 is not affected. Source: `GET https://api.osv.dev/v1/vulns/GHSA-3mv9-4h5g-vhg3`. No malware advisory found; `npm view tsup deprecated` returns nothing (the package itself is not npm-flagged as deprecated).
4. **Maintenance status (the decisive fact): the project's own README states, verbatim, at the top of the repo:** *"This project is not actively maintained anymore. Please consider using [tsdown](https://github.com/rolldown/tsdown/) instead."*, with a link to a migration guide. Source: https://github.com/egoist/tsup (README, top-of-file notice) — confirmed via `https://raw.githubusercontent.com/egoist/tsup/main/README.md`. This is the maintainer's own statement, not a third-party claim.
5. Verdict: **SWAP → tsdown**. Evidence for the replacement, same standard as above:
   - Latest: **0.22.14**, published **2026-07-23** (most recent registry publish overall is 2026-08-28, i.e. actively released within the last month). Source: `npm view tsdown version time --json`.
   - License: **MIT**. Source: `npm view tsdown license`.
   - OSV query returned 0 vulnerabilities. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"tsdown","ecosystem":"npm"}}`.
   - Maintained by the Rolldown/Void(Zero) team (same organization behind Vite's Rust-based bundler, `rolldown/tsdown` on GitHub) and is the tool tsup's own maintainers point to.
   - Compatibility caveat: `engines.node` is `"^22.18.0 || >=24.11.0"` (source: `npm view tsdown engines --json`) — this **excludes early Node 24.x patch releases (24.0.0–24.10.x)**. The local toolchain, Node v24.18.0, satisfies `>=24.11.0`, so it is compatible, but this constraint should be called out in the README/CI Node-version pin so nobody downgrades the Docker base image's patch version into the excluded range.
   - Caveat: tsdown itself is pre-1.0 (0.22.x), so treat its API as still capable of breaking changes, same caution as noted for Drizzle.

### tsx
1. Latest: **4.23.13**, published **2026-08-30** — one day before this research; extremely actively maintained. Source: `npm view tsx version time --json`.
2. License: **MIT**. Source: `npm view tsx license`.
3. OSV query returned 0 vulnerabilities. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"tsx","ecosystem":"npm"}}`. No malware advisory found.
4. `engines.node` is `>=18.0.0` (source: `npm view tsx engines --json`), compatible with Node 24. Used only as the local dev runner (not shipped in the Docker image, which is built via tsup/tsdown), so its Node-floor is not a production constraint.
5. Verdict: **KEEP**.

### vitest
1. Latest: **4.1.11**, published **2026-08-18**. Source: `npm view vitest version time --json`.
2. License: **MIT**. Source: `npm view vitest license`.
3. Two historical advisories: GHSA-5xrq-8626-4rwp ("arbitrary file read/execute via Vitest UI server") affects `4.0.0–<4.1.0` (and separately `0–<3.2.6`); fixed at 4.1.0, so 4.1.11 is unaffected. GHSA-9crc-q9x8-hgqq ("RCE via malicious website while Vitest API server is listening") affects the 1.x/2.x/3.x lines up to 3.0.5 (and pre-1.0 versions up to 0.0.125); does not extend into 4.x. Source: `GET https://api.osv.dev/v1/vulns/GHSA-5xrq-8626-4rwp` and `GET https://api.osv.dev/v1/vulns/GHSA-9crc-q9x8-hgqq`. No malware advisory found. Both historical issues are specifically about leaving Vitest's UI/API dev server reachable — reinforces that the UI/API server should never be exposed outside local dev, which is already the default.
4. `engines.node` is `"^20.0.0 || ^22.0.0 || >=24.0.0"` (source: `npm view vitest engines --json`) — explicitly supports Node 24.
5. Verdict: **KEEP**.

### pino
1. Latest: **10.3.1**, published **2026-02-09**. Source: `npm view pino version time --json`.
2. License: **MIT**. Source: `npm view pino license`.
3. OSV query returned 0 vulnerabilities. Source: `POST https://api.osv.dev/v1/query {"package":{"name":"pino","ecosystem":"npm"}}`. No malware advisory found.
4. Bundled with Fastify: Fastify's own `fastify.log` is a Pino instance by default (Fastify depends on `pino` internally for its built-in logger), so pulling in `pino` directly for shared logger configuration (e.g. redaction, transports) is consistent with Fastify's own architecture rather than a competing choice. Confirmed via Fastify's own logging documentation referenced from its repository (fastify/fastify).
5. Verdict: **KEEP**.

### Docker base image: node:24-alpine
1. Node.js 24 ("Krypton") entered **Active LTS on 2025-10-28** and is scheduled for end-of-life on **2028-04-30**, per the official Node.js release schedule. Source: https://github.com/nodejs/Release (README.md release-schedule table) and https://nodejs.org/en/about/previous-releases. As of the research date (2026-08-31), Node 24 is roughly 10 months into Active LTS — i.e. it is Active LTS today, the recommended production major.
2. Freshness of the actual Docker image: the `node:24-alpine` tag on Docker Hub was last pushed **2026-08-27** (4 days before this research), confirming the official image is actively rebuilt for security patches. Source: `https://hub.docker.com/v2/repositories/library/node/tags?name=24-alpine` (Docker Hub API).
3. Verdict: **KEEP**.

### Docker base image: postgres:16-alpine
1. The current latest PostgreSQL major version is **18** (released 2025-09-25). PostgreSQL follows a versioning policy of roughly one major release per year with **5 years of support** per major version; PostgreSQL 16 (released 2023) is supported through **2028-11-09**. Source: https://www.postgresql.org/support/versioning/ (official PostgreSQL support/versioning page).
2. Freshness: the `postgres:16-alpine` Docker Hub tag was last pushed **2026-08-13**, confirming it still receives regular security/point-release rebuilds. Source: `https://hub.docker.com/v2/repositories/library/postgres/tags?name=16-alpine` (Docker Hub API).
3. Verdict: **KEEP WITH CAVEAT** — PostgreSQL 16 is fully supported until Nov 2028 and is a safe choice, but for a brand-new (greenfield) project being reviewed today, PostgreSQL 17 or 18 would give more runway before a first major-version upgrade is needed, and neither introduces exotic new syntax that drizzle-orm's `pg` dialect wouldn't already support. Not a defect in the current plan — a "prefer the newer default next time" note rather than a required change.

## Recommended changes to the plan

- Pin `zod` to `^4.2` in package.json (not the broader `>=4.1.5` that `fastify-type-provider-zod`'s peerDependency technically allows) — v7 of the type-provider relies on Zod's `.encode()`/`.decode()` APIs, which only exist from Zod 4.2 onward, per the type-provider's own compatibility table.
- Pin `drizzle-orm` to `>=0.45.2` explicitly and document why in a comment/README line: 0.45.2 is the exact version that fixed GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped identifiers). Never float to `rc`/`beta` dist-tags in this project.
- Note in the README that Drizzle (`drizzle-orm` + `drizzle-kit`) is pre-1.0 (currently at `1.0.0-rc.4` on the `rc` dist-tag) — flag it as a known future breaking-change risk rather than treating 0.45.x as permanently stable.
- Replace `tsup` with `tsdown` for the Docker build step. tsup's own README states the project is no longer actively maintained and directs users to tsdown; tsdown is maintained by the Rolldown/VoidZero team, is MIT-licensed, has zero known vulnerabilities, and was published as recently as 2026-08-28. When adopting it, pin the Docker base image's Node 24 patch version to `>=24.11.0` (or use the `22.18+` line) to satisfy tsdown's `engines.node` constraint — the local toolchain (Node v24.18.0) already satisfies this.
- Consider `postgres:18-alpine` (or at least `17-alpine`) instead of `postgres:16-alpine` for a new project, purely to maximize runway before a major-version DB upgrade is needed; 16 remains fully supported through Nov 2028 so this is optional, not a fix.
- No change needed for `@google/generative-ai` vs `@google/genai` — the plan already picked correctly; `@google/generative-ai`'s own README confirms it reached end-of-life on 2025-11-30 (already past).
- No advisory or Shai-Hulud/2025–2026 npm-worm involvement was found for any of the 14 npm packages in this stack; this can be stated plainly in the README's dependency-justification section as "checked against OSV/GHSA and the CSA Singapore Shai-Hulud advisory list, no matches" rather than left unaddressed.

## Is Fastify 5 defensible vs Express 5 / NestJS for a government-agency reviewer?

Facts only, no opinion:

- **Governance/backing**: Fastify is an OpenJS Foundation project (Growth stage), the same neutral foundation that stewards Node.js, Express, and other core JS infrastructure — not a single-maintainer project. Source: https://openjsf.org/blog/fastify-graduation-performance-and-the-future.
- **Release maturity**: Fastify v5 is a stable major release (5.12.1 as of 2026-08-18), actively patched (10 historical GHSAs, all fixed). Express 5 only reached its first stable 5.0.0 release on **2024-09-10** (`npm view express time --json`) after years in pre-release limbo, and is now at 5.2.1 (2026-08-15) with a maintained `latest-4` line (4.22.2) still shipped in parallel — i.e., Express is still actively straddling two majors. NestJS's core (`@nestjs/core`) is at 12.0.1 (2026-08-27) and, notably, is commonly deployed *on top of* either Express or Fastify as its underlying HTTP adapter rather than being a competing low-level HTTP layer.
- **Ecosystem scale (npm weekly downloads, 2026-08-23 to 2026-08-29, via `https://api.npmjs.org/downloads/point/last-week/<pkg>`)**: `express` 132,879,571; `@nestjs/core` 14,315,401; `fastify` 12,594,645. Express's download count is far larger, but a large share of that reflects its role as a transitive dependency inside countless other tools and frameworks (including many that are not themselves web servers), not solely direct app-framework adoption — this figure should be read as ecosystem ubiquity, not a like-for-like popularity comparison with a framework chosen deliberately.
- **License**: `express` and `@nestjs/core` are both MIT-licensed, same permissive tier as `fastify`. Source: `npm view express license` / `npm view @nestjs/core license`.
- **Net read**: Fastify 5 is a defensible, well-governed, actively maintained, MIT-licensed choice with built-in JSON Schema/OpenAPI validation ergonomics (the reason it pairs naturally with `fastify-type-provider-zod` + `@fastify/swagger`) and no outstanding vulnerabilities in its latest release — that combination is sufficient grounds to justify it in a README without needing to claim it is "better" than Express or NestJS, both of which are also legitimate, permissively-licensed, actively maintained choices.

## Sources

- https://api.osv.dev/v1/query (POST, per-package OSV lookups) and https://api.osv.dev/v1/vulns/{id} (per-advisory detail) — used for every "Known vulnerabilities" fact above
- `npm view <pkg> version license repository.url time engines dist-tags peerDependencies dependencies deprecated --json` — used for every "Latest version/date/license/compatibility" fact above (exact commands quoted per-library)
- https://github.com/fastify/fastify (repository; PROJECT_CHARTER.md)
- https://openjsf.org/blog/fastify-graduation-performance-and-the-future
- https://openjsf.org/blog/fastifys-growth-and-success
- https://github.com/fastify/fastify-swagger (README compatibility table)
- https://github.com/fastify/fastify-swagger-ui (README compatibility table)
- https://github.com/turkerdev/fastify-type-provider-zod (README compatibility table)
- https://github.com/colinhacks/zod
- https://github.com/drizzle-team/drizzle-orm (releases, dist-tags)
- https://github.com/googleapis/js-genai (README, unified-SDK statement)
- https://github.com/google/generative-ai-js (README, deprecation + EOL date 2025-11-30)
- https://github.com/egoist/tsup and https://raw.githubusercontent.com/egoist/tsup/main/README.md (maintenance-mode notice)
- https://github.com/rolldown/tsdown (tsup's recommended successor)
- https://github.com/nodejs/Release (README.md release schedule table)
- https://nodejs.org/en/about/previous-releases
- https://www.postgresql.org/support/versioning/ (official PostgreSQL versioning/support policy)
- https://hub.docker.com/v2/repositories/library/node/tags?name=24-alpine (Docker Hub API, image freshness)
- https://hub.docker.com/v2/repositories/library/postgres/tags?name=16-alpine (Docker Hub API, image freshness)
- https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/ (Cyber Security Agency of Singapore — Shai-Hulud advisory, 2026-08-06)
- https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/ (GitHub's own statement on the Shai-Hulud incident, 2025-09-22)
- https://api.npmjs.org/downloads/point/last-week/fastify, .../express, .../@nestjs/core (npm download counts for the Fastify vs Express/Nest comparison)
- `npm view express version license dist-tags time --json`, `npm view @nestjs/core version license time --json` (Express/NestJS version facts for the comparison section)
