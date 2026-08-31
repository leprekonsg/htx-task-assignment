# Frontend Dependency Vetting — Task Assignment App (HTX Take-Home)

**Researched:** 2026-08-31

**Question answered:** For each package in the planned frontend/tooling stack (vite, @vitejs/plugin-react, react, react-dom, react-router, @tanstack/react-query, tailwindcss, @tailwindcss/vite, vitest, @testing-library/react, @testing-library/jest-dom, jsdom, happy-dom, typescript, eslint, typescript-eslint, prettier, zod) — what is the latest stable version, is the license permissive, are there known vulnerabilities in that latest version, is it compatible with Node v24.18.0 / React 19 / the rest of this stack, and should it be kept, kept with a caveat, or swapped?

All version/date facts below were pulled live on 2026-08-31 via `npm view <pkg> --json` against the public npm registry, cross-checked against the OSV API (`https://api.osv.dev/v1/query`) and official project documentation. Local toolchain: Node v24.18.0, npm 11.16.0.

**Headline finding:** the npm registry has moved well past what a Jan-2026 training cutoff would assume. TypeScript's `latest` tag now points to **7.0.2**, the GA release of Microsoft's native Go-ported compiler (shipped 2026-07-08), React Router's `latest` tag points to **8.3.1** (a v7→v8 major happened 2026-06-17), ESLint is on **v10**, and Vite is on **v8** (which replaced esbuild/Rollup with Rolldown/Oxc by default). Most importantly: **`typescript-eslint` 8.68.0's own `peerDependencies` cap TypeScript support at `>=4.8.4 <6.1.0`** — it does not yet support TypeScript 7.x. This is a real, registry-enforced blocker for the plan as stated (see Recommended changes).

---

## Summary

| Package | Latest version (date) | License | Vulns in latest | Verdict |
|---|---|---|---|---|
| vite | 8.2.2 (2026-08-20) | MIT | None (22 historical GHSAs, all patched by 8.0.16) | KEEP |
| @vitejs/plugin-react | 6.1.1 (2026-08-28) | MIT | None found | KEEP |
| react | 19.2.8 (2026-07-21) | MIT | None (2 historical GHSAs, fixed in pre-1.0 releases) | KEEP |
| react-dom | 19.2.8 (2026-07-21) | MIT | None (1 historical GHSA, fixed in React 16.x) | KEEP |
| react-router | 8.3.1 (2026-08-28) | MIT | None (20 historical GHSAs on 6.x/7.x; only 1 ever touched 8.x and it's fixed as of 8.3.0) | KEEP WITH CAVEAT |
| @tanstack/react-query | 5.102.8 (2026-08-27) | MIT | None found | KEEP |
| tailwindcss | 4.3.3 (2026-07-16) | MIT | None found | KEEP WITH CAVEAT |
| @tailwindcss/vite | 4.3.3 (2026-07-16) | MIT | None found | KEEP |
| vitest | 4.1.11 (2026-08-18) | MIT | None (2 historical GHSAs, fixed by 4.1.0) | KEEP |
| @testing-library/react | 16.3.3 (2026-08-27) | MIT | None found | KEEP |
| @testing-library/jest-dom | 7.0.1 (2026-08-09) | MIT | None found | KEEP |
| jsdom | 30.0.1 (2026-07-29) | MIT | None found | KEEP WITH CAVEAT |
| happy-dom | 20.12.0 (2026-08-29) | MIT | None (5 historical GHSAs incl. 2 RCE-class, all patched by 20.8.9) | KEEP AS FALLBACK ONLY |
| typescript | 7.0.2 (2026-07-08) | Apache-2.0 | None found | KEEP WITH CAVEAT (pin to 6.0.3 for lint compatibility — see below) |
| eslint | 10.9.1 (2026-08-24) | MIT | None found | KEEP |
| typescript-eslint | 8.68.0 (2026-08-24) | MIT | None found | KEEP WITH CAVEAT (TS support capped at <6.1.0) |
| prettier | 3.9.6 (2026-07-21) | MIT | None found | KEEP |
| zod | 4.5.4 (2026-08-29) | MIT | None (1 historical GHSA, fixed in v3.22.3) | KEEP (use `zod/mini` only if bundle size becomes a measured problem) |

None of the 18 packages were named in the September 2025 "Shai-Hulud" npm worm or the September 8, 2025 chalk/debug maintainer-account-takeover incident — see each package's fact 3, and the cross-reference note at the end of Findings.

---

## Findings

### vite
1. Latest stable: **8.2.2**, published **2026-08-20T04:14:39Z**. Previous major (7.3.6) was tagged `previous` and last released 2026-06-25 — v8 has been GA since 2026-03-12 and is actively patched (multiple releases per month). Source: `npm view vite --json` (`.dist-tags`, `.time`).
2. License: **MIT**. Source: `npm view vite license`.
3. Vulnerabilities: OSV (`curl -s -X POST https://api.osv.dev/v1/query -d '{"package":{"name":"vite","ecosystem":"npm"}}'`) returned 22 historical GHSAs (mostly `server.fs.deny` dev-server path-traversal bypasses, e.g. [GHSA-859w-5945-r5v3](https://github.com/advisories/GHSA-859w-5945-r5v3)). Checked every advisory's fixed-version range against 8.2.2: the 5 that ever touched the 8.x line (e.g. [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583)) are all fixed by 8.0.16; 8.2.2 is clean. No advisory found affecting the latest version. Not named in Shai-Hulud (github.blog/security) or the chalk/debug incident (no GHSA of type "malware" exists for `vite`).
4. Compatibility: `engines.node` = `^20.19.0 || >=22.12.0` (satisfies Node 24.18.0). `@vitejs/plugin-react` 6.1.1 requires `vite: ^8.0.0` — matched. Official migration guide (https://vite.dev/guide/migration) confirms Vite 8's default bundler/transformer stack is now **Rolldown + Oxc**, replacing esbuild/Rollup (a ground-up internal change, not opt-in). ESM-first package.
5. **Verdict: KEEP.** Current major, permissive license, clean CVE record on latest, and the plugin ecosystem this project needs (`@vitejs/plugin-react`, `@tailwindcss/vite`, `vitest`) already declares peer support for Vite 8.

### @vitejs/plugin-react
1. Latest stable: **6.1.1**, published **2026-08-28T03:30:56Z** — 3 days before this research date. Source: `npm view @vitejs/plugin-react --json`.
2. License: **MIT**. Source: `npm view @vitejs/plugin-react license`.
3. Vulnerabilities: OSV query for `@vitejs/plugin-react` returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies.vite` = `^8.0.0` (matches vite 8.2.2 above). `engines.node` = `^20.19.0 || >=22.12.0` (Node 24.18.0 OK). Also lists optional peers `babel-plugin-react-compiler` and `oxc-transform-react` reflecting Vite 8's Oxc transform path.
5. **Verdict: KEEP.** Official Vite team package, tightly version-locked to the vite major in the plan, clean security record.

### react
1. Latest stable: **19.2.8**, published **2026-07-21T15:41:28Z** (~6 weeks before research date; React ships frequent patch releases). Source: `npm view react --json`.
2. License: **MIT**. Source: `npm view react license`.
3. Vulnerabilities: OSV returned 2 historical GHSAs ([GHSA-g53w-52xc-2j85](https://github.com/advisories/GHSA-g53w-52xc-2j85), [GHSA-hg79-j56m-fxgv](https://github.com/advisories/GHSA-hg79-j56m-fxgv)), both XSS issues fixed in pre-1.0 releases (0.4.2/0.5.2 and 0.14.0 respectively). None affect 19.2.8. No advisory found affecting latest. Not named in Shai-Hulud or chalk/debug incidents.
4. Compatibility: `engines.node` = `>=0.10.0` (trivially satisfied). No runtime peer deps. React 19 major confirmed as current stable (dist-tags also show `canary`/`experimental`/`next` channels active, but `latest` is 19.2.8).
5. **Verdict: KEEP.** Matches the planned React 19 target exactly.

### react-dom
1. Latest stable: **19.2.8**, published **2026-07-21T15:41:41Z**, same day/version as `react`. Source: `npm view react-dom --json`.
2. License: **MIT**. Source: `npm view react-dom license`.
3. Vulnerabilities: OSV returned 1 historical GHSA ([GHSA-mvjj-gqq2-p4hw](https://github.com/advisories/GHSA-mvjj-gqq2-p4hw), XSS), fixed across the 16.0.1–16.4.2 branches; irrelevant to 19.2.8. No advisory found affecting latest. Not named in either 2025 incident.
4. Compatibility: `peerDependencies.react` = `^19.2.8` — **must** be paired with `react` at exactly this version floor. Confirms react/react-dom must be upgraded in lockstep.
5. **Verdict: KEEP.**

### react-router
1. Latest stable: **8.3.1**, published **2026-08-28T14:47:42Z**. `react-router` shipped v8.0.0 GA on 2026-06-17; the v7 line is still receiving patches in parallel (7.18.3 released the same day as 8.3.1) via the `version-7` dist-tag, but `latest` points to 8.x. Source: `npm view react-router --json` (`.dist-tags`, `.time`).
2. License: **MIT**. Source: `npm view react-router license`.
3. Vulnerabilities: OSV returned **20** historical GHSAs — a notably high count, spanning open-redirect/XSS, CSRF, and DoS classes concentrated in **SSR/framework-mode/RSC-specific features** (e.g. [GHSA-cpj6-fhp6-mr6j](https://github.com/advisories/GHSA-cpj6-fhp6-mr6j) "pre-render data spoofing on React-Router framework mode", [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) "SSR Hydration"). I checked every advisory's `introduced`/`fixed` event pairs: only **one**, [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) ("RSC Mode CSRF Bypass"), ever had a range touching the 8.x line (`introduced: 8.0.0`, `fixed: 8.3.0`) — 8.3.1 is already patched. No unpatched advisory affects 8.3.1. Not named in Shai-Hulud or chalk/debug incidents (no malware-type GHSA exists for `react-router`).
4. Compatibility: `peerDependencies` = `{"react": ">=19.2.7", "react-dom": ">=19.2.7"}` — satisfied by react/react-dom 19.2.8. `engines.node` = `>=22.22.0` (Node 24.18.0 OK). **Modes:** confirmed via official docs (https://reactrouter.com/start/modes) that React Router has three modes — declarative, data, and framework — and framework mode is the one that adds a Vite plugin/full-stack conventions. **Package name:** confirmed via official docs (https://reactrouter.com/start/declarative/installation) that declarative-mode installation is simply `npm i react-router`; the current docs make **no mention of `react-router-dom`** anywhere in setup instructions — for a plain Vite SPA in declarative mode, `react-router` alone is the correct and complete package.
5. **Verdict: KEEP WITH CAVEAT.** The plan's intended usage (declarative mode, `react-router` only, no SSR/RSC) sidesteps almost the entire CVE surface above, since nearly all 20 historical advisories are in framework-mode/SSR/RSC code paths this project won't exercise. Caveat: use v8.3.1 (not v7, which the task brief anticipated) since that's current `latest`, and explicitly avoid any data-mode/framework-mode APIs (loaders/actions/RSC) unless intentionally adopted, to stay outside the historically riskier code paths.

### @tanstack/react-query
1. Latest stable: **5.102.8**, published **2026-08-27T16:06:57Z** — 4 days before research date, extremely active maintenance. Source: `npm view @tanstack/react-query --json`.
2. License: **MIT**. Source: `npm view @tanstack/react-query license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies.react` = `^18 || ^19` — matches React 19.2.8. `engines` unset (no Node restriction beyond what its own deps need).
5. **Verdict: KEEP.** Still on the planned v5 major, clean CVE record, explicit React 19 peer support.

### tailwindcss
1. Latest stable: **4.3.3**, published **2026-07-16T12:03:35Z** (~6.5 weeks before research date). Source: `npm view tailwindcss --json`.
2. License: **MIT**. Source: `npm view tailwindcss license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: no npm-level peer deps (it's a CSS build tool). **Browser support caveat (critical for a govtech app):** official compatibility docs (https://tailwindcss.com/docs/compatibility) state Tailwind v4's core functionality specifically depends on **Chrome 111 (Mar 2023), Safari 16.4 (Mar 2023), Firefox 128 (Jul 2024)** or newer — it does not support older browsers, including any pre-2023 Safari/Chrome or legacy Edge. This is a hard floor, not a progressive-enhancement fallback.
5. **Verdict: KEEP WITH CAVEAT.** The library itself is fine (permissive license, clean CVEs, current major), but the browser-support floor should be called out explicitly in the README as a documented risk for a government agency, since HTX's actual user base (agency-issued/enterprise devices) may run browsers older than the v4 floor. If that's a hard requirement, the only real mitigation is staying on the `v3-lts` dist-tag (Tailwind 3.4.19), which supports older browsers at the cost of losing v4's engine improvements.

### @tailwindcss/vite
1. Latest stable: **4.3.3**, published **2026-07-16T12:04:06Z** (same release train as `tailwindcss` core). Source: `npm view @tailwindcss/vite --json`.
2. License: **MIT**. Source: `npm view @tailwindcss/vite license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies.vite` = `^5.2.0 || ^6 || ^7 || ^8` — matches vite 8.2.2. Confirmed via official install docs (https://tailwindcss.com/docs/installation/using-vite) that `npm install tailwindcss @tailwindcss/vite` plus adding the `tailwindcss()` plugin to `vite.config.ts` is the **official, first-listed installation path** for Tailwind v4 in a Vite project (described by the docs as "the most seamless way to integrate"), superseding the old PostCSS-plugin setup for Vite users.
5. **Verdict: KEEP.** Official install path, current major, wide Vite peer range covering v8.

### vitest
1. Latest stable: **4.1.11**, published **2026-08-18T14:27:07Z** (~2 weeks before research date). Source: `npm view vitest --json`.
2. License: **MIT**. Source: `npm view vitest license`.
3. Vulnerabilities: OSV returned 2 historical GHSAs — [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (Vitest UI arbitrary file read, fixed 4.1.0) and [GHSA-9crc-q9x8-hgqq](https://github.com/advisories/GHSA-9crc-q9x8-hgqq) (RCE via malicious website while API server listening, fixed 3.0.5/2.1.9/1.6.1). Both are fixed well below 4.1.11. No advisory found affecting latest. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies.vite` = `^6.0.0 || ^7.0.0 || ^8.0.0` — matches vite 8.2.2. Also lists `jsdom: "*"` and `happy-dom: "*"` as optional peers (either DOM environment works). `engines.node` = `^20.0.0 || ^22.0.0 || >=24.0.0` (Node 24.18.0 OK).
5. **Verdict: KEEP.** Current major, actively patched, clean CVE record on latest, Vite 8 peer support confirmed.

### @testing-library/react
1. Latest stable: **16.3.3**, published **2026-08-27T17:41:18Z** — 4 days before research date. Source: `npm view @testing-library/react --json`.
2. License: **MIT**. Source: `npm view @testing-library/react license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies` = `{"react": "^18.0.0 || ^19.0.0", "react-dom": "^18.0.0 || ^19.0.0", "@types/react": "^18.0.0 || ^19.0.0", "@types/react-dom": "^18.0.0 || ^19.0.0", "@testing-library/dom": "^10.0.0"}` — matches React 19.2.8. **React 19 support confirmed** via GitHub releases (https://github.com/testing-library/react-testing-library/releases): added in **v16.1.0, 2024-12-05** ("Add support for React 19"); current 16.3.3 is well past that. `engines.node` = `>=18`.
5. **Verdict: KEEP.** Official React 19 support has been stable for well over a year at this point, current major, clean CVE record.

### @testing-library/jest-dom
1. Latest stable: **7.0.1**, published **2026-08-09T23:44:33Z** (~3 weeks before research date). Source: `npm view @testing-library/jest-dom --json`.
2. License: **MIT**. Source: `npm view @testing-library/jest-dom license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `peerDependencies` = `{"vitest": ">= 0.32", "@testing-library/dom": ">=10 <11"}` — matches vitest 4.1.11. `engines.node` = `>=22` (Node 24.18.0 OK). **Vitest setup confirmed** via official README (github.com/testing-library/jest-dom): import `@testing-library/jest-dom/vitest` (not the bare `@testing-library/jest-dom` import, which is Jest-specific) in a setup file registered via `setupFiles` in `vitest.config`, plus adding `"@testing-library/jest-dom"` to `tsconfig.json`'s `types` array for the custom matchers' TypeScript defs.
5. **Verdict: KEEP.** Explicit Vitest peer support and a documented Vitest-specific import path — this is the correct package for this stack (not the Jest-only default entrypoint).

### jsdom
1. Latest stable: **30.0.1**, published **2026-07-29T04:18:42Z** (~1 month before research date). Source: `npm view jsdom --json`.
2. License: **MIT**. Source: `npm view jsdom license`.
3. Vulnerabilities: OSV query returned 0 vulns — jsdom has no recorded advisories at all in the OSV/GHSA database. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: **`engines.node` = `^22.22.2 || ^24.15.0 || >=26.0.0`** — a notably narrow window in the Node 24 line. The local toolchain (24.18.0) satisfies `^24.15.0` (24.15.0 ≤ 24.18.0 < 25.0.0), but this is worth flagging explicitly: any teammate or CI runner on Node 24.0.0–24.14.x would fail to install jsdom 30. Optional peer `canvas: ^3.2.3` (only needed for `<canvas>` rendering in tests, not required otherwise).
5. **Verdict: KEEP WITH CAVEAT.** Recommend as the primary DOM environment for this stack over happy-dom (see happy-dom entry for the comparison) — but pin/document a Node engines floor of `>=24.15.0` in `package.json` so CI doesn't silently break on an older Node 24 patch.

### happy-dom
1. Latest stable: **20.12.0**, published **2026-08-29T16:12:16Z** — 2 days before research date, the most recently-published package in this entire stack. Source: `npm view happy-dom --json`.
2. License: **MIT**. Source: `npm view happy-dom license`.
3. Vulnerabilities: OSV returned **5** historical GHSAs, notably more severe than jsdom's record: [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f) "VM Context Escape can lead to Remote Code Execution" (fixed 20.0.0), [GHSA-96g7-g7g9-jxw8](https://github.com/advisories/GHSA-96g7-g7g9-jxw8) "server side code to be executed by a `<script>` tag" (fixed 15.10.2), [GHSA-qpm2-6cq5-7pq5](https://github.com/advisories/GHSA-qpm2-6cq5-7pq5) "`--disallow-code-generation-from-strings` is not sufficient for isolating untrusted JavaScript" (fixed 20.0.2), plus two more (6q6h, w4gp) fixed by 20.8.8/20.8.9. All five are fixed at or before 20.8.9; 20.12.0 is clean of known vulnerabilities. No advisory found affecting latest. Not named in either 2025 supply-chain incident.
4. Compatibility: `engines.node` = `>=20.0.0` — far more permissive than jsdom's. No peer deps declared (`peerDependencies: null`), and `vitest`'s own peers accept `happy-dom: "*"`.
5. **Verdict: KEEP AS FALLBACK ONLY, not primary.** happy-dom is community-reported as 2–10x faster than jsdom for Vitest suites and is a common Vitest-ecosystem default, but its security history includes two RCE-class advisories (VM sandbox escape, and untrusted-script execution via `<script>` tags) — a materially worse track record than jsdom's zero recorded advisories over its 10+ year history, even though the current version is patched. For a government-agency deliverable being reviewed for code quality/best-practice, jsdom's maturity and clean CVE record outweigh the speed gain; recommend `jsdom` as the configured `test.environment` and keep `happy-dom` documented as an available, actively-maintained swap-in if test-suite runtime becomes a measured problem.

### typescript
1. Latest stable: **7.0.2**, published **2026-07-08T15:55:18Z**. This is the GA release of **TypeScript 7**, Microsoft's native Go-ported compiler — officially announced the same day via the TypeScript team's own devblog: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ (project first announced 2025-03-11; RC shipped 2026-06-18; GA 2026-07-08). Reported speedup: roughly 8–12x on full builds per that announcement/coverage. The last pre-7 stable line topped out at **6.0.3** (published 2026-04-16); TypeScript jumped straight from 6.0.3 to the 7.0-rc/7.0.2 line with no 6.1+ releases. Source: `npm view typescript --json` (`.dist-tags`, `.time`).
2. License: **Apache-2.0** (not MIT, but still permissive/OSI-approved). Source: `npm view typescript license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `engines.node` = `>=16.20.0` (Node 24.18.0 OK). **Critical gap:** `typescript-eslint` 8.68.0's own `peerDependencies.typescript` is `>=4.8.4 <6.1.0` (confirmed via `npm view typescript-eslint peerDependencies` and the official docs at https://typescript-eslint.io/users/dependency-versions/, which state: *"The version range of TypeScript currently supported is `>=4.8.4 <6.1.0`"* and explicitly does not mention TS 7.x support). Installing `typescript@latest` (7.0.2) alongside `typescript-eslint@latest` (8.68.0) is a real peer-dependency conflict under npm's default strict resolution.
5. **Verdict: KEEP WITH CAVEAT — pin to `typescript@6.0.3`, not `latest`.** TypeScript 7 is a legitimate, officially-announced GA release with a clean security record and a permissive license, but adopting it today would break `typescript-eslint` peer resolution. Until typescript-eslint publishes TS 7 support, pin `typescript` to the last pre-7 release (`6.0.3`, Apache-2.0, 2026-04-16) so the lint toolchain installs cleanly; document this pin and the reason in the README, and revisit once typescript-eslint's supported range is updated.

### eslint
1. Latest stable: **10.9.1**, published **2026-08-24T18:21:58Z** — 7 days before research date. ESLint v10.0.0 itself GA'd per the official blog on 2026-02-XX (https://eslint.org/blog/2026/02/eslint-v10.0.0-released/); v9.x is kept alive only under a `maintenance` dist-tag (9.39.5). Source: `npm view eslint --json` (`.dist-tags`, `.time`) and https://eslint.org/blog/2026/02/eslint-v10.0.0-released/.
2. License: **MIT**. Source: `npm view eslint license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: **Flat config is now the only supported config format** — per the official release notes, ESLint v10.0.0 removes the legacy eslintrc system entirely: `.eslintrc.*`/`.eslintignore` are no longer honored, `ESLINT_USE_FLAT_CONFIG` is no longer read, and eslintrc-only CLI flags (`--no-eslintrc`, `--env`, `--resolve-plugins-relative-to`, `--rulesdir`, `--ignore-path`) are gone — matching the plan's intent to use `eslint.config.js`. `engines.node` = `^20.19.0 || ^22.13.0 || >=24` (matches the npm-registry `engines` field exactly; Node 24.18.0 OK).
5. **Verdict: KEEP.** v10 is current, flat config is now mandatory (not just default) which fits the plan directly, clean CVE record, Node 24 supported.

### typescript-eslint
1. Latest stable: **8.68.0**, published **2026-08-24T17:27:29Z** — 7 days before research date, same release day as ESLint 10.9.1. Source: `npm view typescript-eslint --json`.
2. License: **MIT**. Source: `npm view typescript-eslint license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: this is the **single unified `typescript-eslint` package** (superseding the old separate `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` install), confirmed as the officially recommended install path by typescript-eslint.io. `peerDependencies.eslint` = `^8.57.0 || ^9.0.0 || ^10.0.0` — matches eslint 10.9.1. `peerDependencies.typescript` = `>=4.8.4 <6.1.0` — **does not include TypeScript 7.x** (see the `typescript` entry above for the resolution). `engines.node` = `^18.18.0 || ^20.9.0 || >=21.1.0` (Node 24.18.0 OK). Docs also note that using an out-of-range TypeScript version logs a warning by default, configurable to either be suppressed or made to fail CI.
5. **Verdict: KEEP WITH CAVEAT.** Correct, officially-recommended unified package and current ESLint-10-compatible major — but its TypeScript peer ceiling is the actual root cause of the `typescript` pin recommended above. Pair with `typescript@6.0.3`, and revisit both once typescript-eslint extends support to TS 7.

### prettier
1. Latest stable: **3.9.6**, published **2026-07-21T05:51:53Z** (~6 weeks before research date). A `next` dist-tag (4.0.0-alpha.13) exists for the in-progress Prettier 4 line, but `latest` remains 3.9.6. Source: `npm view prettier --json`.
2. License: **MIT**. Source: `npm view prettier license`.
3. Vulnerabilities: OSV query returned 0 vulns. No advisory found. Not named in either 2025 supply-chain incident.
4. Compatibility: `engines.node` = `>=14` (Node 24.18.0 OK). No runtime peer deps against this stack. To integrate cleanly with the ESLint v9/10 flat-config setup, the standard companion package is `eslint-config-prettier` (disables ESLint's stylistic rules so Prettier owns formatting and ESLint owns correctness) — noted here as the expected pairing but not separately vetted in depth in this report.
5. **Verdict: KEEP.** Still the current stable major, clean CVE record, standard flat-config pairing available.

### zod
1. Latest stable: **4.5.4**, published **2026-08-29T17:55:42Z** — 2 days before research date. `latest` confirms Zod 4 is current (a `next` tag lingers on an old 3.25.0-beta pre-release and can be ignored; `canary`/`beta` point to newer 4.x/pre-4.6 builds, not a competing stable line). Source: `npm view zod --json` (`.dist-tags`).
2. License: **MIT**. Source: `npm view zod license`.
3. Vulnerabilities: OSV returned 1 historical GHSA, [GHSA-m95q-7qp3-xv42](https://github.com/advisories/GHSA-m95q-7qp3-xv42) ("Zod denial of service vulnerability"), fixed in **3.22.3** — a Zod-v3-era issue, irrelevant to 4.5.4. No advisory found affecting latest. Not named in either 2025 supply-chain incident.
4. Compatibility: `package.json` shows `"type": "module"` with conditional exports providing both `"import"` (ESM) and `"require"` (CJS) entrypoints per subpath (`.`, `./mini`, `./v4`, `./v4/mini`, `./locales`, etc.) — dual ESM/CJS, not ESM-only. `engines` unset (no Node floor beyond the toolchain's own baseline). **Bundle-size guidance (zod.dev/packages/mini):** Zod's default chaining API (`z.string().min(5)`) does not tree-shake well because bundlers can't drop unused method implementations off a shared prototype; `zod/mini` reworks the same schemas into a **functional API** (`z.string().check(z.minLength(5))`) that bundlers can tree-shake, with the docs citing concrete numbers — a 64% smaller gzip for a simple string schema (2.12kb vs 5.91kb) and roughly a 3x reduction for an object schema (4.0kb vs 13.1kb). Official docs candidly flag the tradeoff: `zod/mini`'s API is "more verbose and less discoverable" with weaker IntelliSense than the standard API, and recommend it mainly when "optimizing front-end bundles for a user base with slow mobile network connections."
5. **Verdict: KEEP — use the standard `zod` API by default.** Current major, clean CVE record on latest, dual ESM/CJS. Since this is validation code shared between a form layer and API calls (not a bundle-size-critical mobile target per the brief), the standard chaining API's better ergonomics/discoverability outweigh `zod/mini`'s savings; document `zod/mini` in the README as a known, low-risk lever if a later bundle-size audit calls for it.

---

### Shai-Hulud / 2025 npm supply-chain incidents — cross-check

Two distinct 2025 incidents were checked against all 18 packages:
- **September 8, 2025 — chalk/debug maintainer-account takeover.** A phishing attack compromised npm maintainer "Qix," leading to malicious publishes of `chalk`, `debug`, `ansi-styles`, `strip-ansi`, and ~14 other small terminal-color/string utilities (e.g. GitHub's own advisory for the affected `debug` release: [GHSA-4x49-vf9v-38px](https://github.com/advisories/GHSA-4x49-vf9v-38px), "debug@4.4.2 contains malware after npm account takeover"). None of the 18 packages in this stack are on that list.
- **September 14, 2025 onward — "Shai-Hulud" self-replicating worm.** Per GitHub's own security blog (https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/) and the CISA advisory (https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem), 500+ compromised packages were removed from npm and roughly 40 packages self-propagated the worm via stolen CI/CD credentials, none of which overlap with this stack's 18 packages.

For every package above, the direct per-package OSV/GHSA query (fact 3 in each section) returned zero "malware"-type advisories — a compromise of this kind produces a distinctly-labeled advisory (see the `debug` example above), and none exists for `vite`, `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `happy-dom`, `typescript`, `eslint`, `typescript-eslint`, `prettier`, `zod`, or `@vitejs/plugin-react`.

---

## Recommended changes to the plan

- **Pin `typescript` to `6.0.3`, not `latest`.** `typescript-eslint@8.68.0`'s own `peerDependencies` cap TypeScript support at `<6.1.0` (confirmed via `npm view typescript-eslint peerDependencies` and https://typescript-eslint.io/users/dependency-versions/); installing TypeScript 7.0.2 (the new Go-native compiler) alongside `typescript-eslint@latest` will hit a peer-dependency conflict under npm's default strict resolution. Document this pin and its reason in the README; revisit once typescript-eslint ships TS 7 support.
- **Install `react-router` only — do not add `react-router-dom`.** Confirmed via the current official docs (https://reactrouter.com/start/declarative/installation) that declarative-mode setup is `npm i react-router`, with no reference to `react-router-dom` anywhere in current install instructions. Note the registry's `latest` is now **8.3.1** (not v7 as the original brief assumed); v8's peer requirement (`react`/`react-dom` `>=19.2.7`) is satisfied by the planned React 19.2.8.
- **Use declarative mode only** (`<BrowserRouter>`, `<Link>`, `useNavigate`) and avoid data-mode/framework-mode APIs (loaders, actions, RSC) — nearly all 20 of react-router's historical advisories concentrate in SSR/framework-mode/RSC code paths this project won't exercise.
- **Install Tailwind via `@tailwindcss/vite`**, confirmed as Tailwind's own officially-recommended Vite install path (https://tailwindcss.com/docs/installation/using-vite) — matches the plan as written.
- **Document Tailwind v4's browser floor in the README as a known limitation**: Chrome 111+, Safari 16.4+, Firefox 128+ (all from official compatibility docs). Flag this explicitly for HTX review since a government agency's actual device fleet may include browsers below that floor; the fallback if that's a hard requirement is Tailwind's maintained `v3-lts` line (3.4.19).
- **Use `jsdom` as the primary Vitest test environment, not `happy-dom`.** happy-dom has a materially worse security history (5 historical advisories including 2 RCE-class: VM sandbox escape and untrusted-`<script>`-tag execution) versus jsdom's zero recorded advisories over 10+ years; both are now clean on their latest versions, but for a code-quality-reviewed government deliverable, jsdom's track record and completeness outweigh happy-dom's speed advantage. Keep happy-dom documented as an available, actively-maintained fallback if suite runtime later becomes a bottleneck.
- **Pin a Node engines floor of `>=24.15.0`** in `package.json` if staying on Node 24.x: jsdom 30's `engines.node` is the narrow `^22.22.2 || ^24.15.0 || >=26.0.0`, and the local toolchain (24.18.0) only just clears it.
- **Use the standard `zod` chaining API by default; document `zod/mini` as a documented, not-yet-needed fallback** for bundle-size-sensitive validation code, citing the official 64%/~3x size-reduction numbers from https://zod.dev/packages/mini should a later audit call for it.
- **Register `@testing-library/jest-dom/vitest`** (not the bare package import, which targets Jest) in the Vitest setup file, per the package's own README instructions.
- **Add `eslint-config-prettier`** alongside the planned `eslint` + `typescript-eslint` + `prettier` combination to disable ESLint's stylistic rules and avoid the two tools fighting over formatting — standard, widely-documented pairing; not separately deep-vetted in this report.
- **No further supply-chain mitigation needed** beyond normal lockfile hygiene: none of the 18 packages were named in either the September 2025 chalk/debug takeover or the Shai-Hulud worm.

---

## Sources

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://typescript-eslint.io/users/dependency-versions/
- https://reactrouter.com/start/modes
- https://reactrouter.com/start/declarative/installation
- https://tailwindcss.com/docs/compatibility
- https://tailwindcss.com/docs/installation/using-vite
- https://zod.dev/packages/mini
- https://github.com/testing-library/react-testing-library/releases
- https://github.com/testing-library/jest-dom#with-vitest
- https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- https://vite.dev/guide/migration
- https://api.osv.dev/v1/query (per-package POST queries, `{"package":{"name":"<pkg>","ecosystem":"npm"}}`)
- https://github.com/advisories/GHSA-859w-5945-r5v3
- https://github.com/advisories/GHSA-p9ff-h696-f583
- https://github.com/advisories/GHSA-g53w-52xc-2j85
- https://github.com/advisories/GHSA-hg79-j56m-fxgv
- https://github.com/advisories/GHSA-mvjj-gqq2-p4hw
- https://github.com/advisories/GHSA-cpj6-fhp6-mr6j
- https://github.com/advisories/GHSA-337j-9hxr-rhxg
- https://github.com/advisories/GHSA-qwww-vcr4-c8h2
- https://github.com/advisories/GHSA-5xrq-8626-4rwp
- https://github.com/advisories/GHSA-9crc-q9x8-hgqq
- https://github.com/advisories/GHSA-37j7-fg3j-429f
- https://github.com/advisories/GHSA-96g7-g7g9-jxw8
- https://github.com/advisories/GHSA-qpm2-6cq5-7pq5
- https://github.com/advisories/GHSA-m95q-7qp3-xv42
- https://github.com/advisories/GHSA-4x49-vf9v-38px
- https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/
- https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem
- `npm view <package> --json` (run for all 18 packages: vite, @vitejs/plugin-react, react, react-dom, react-router, @tanstack/react-query, tailwindcss, @tailwindcss/vite, vitest, @testing-library/react, @testing-library/jest-dom, jsdom, happy-dom, typescript, eslint, typescript-eslint, prettier, zod)
