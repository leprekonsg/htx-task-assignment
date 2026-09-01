# Gemini vs. Gemma for task-skill classification: rate limits, JSON mode, and SDK facts

Researched: 2026-08-31

**Question:** For a Node.js/TypeScript backend that makes ONE batched Gemini API call per task-creation HTTP request (all new task titles in one prompt, temperature 0, JSON/structured output, via `@google/genai`, free tier), will free-tier rate limits realistically bite with a reviewer creating ~10–30 tasks, and would switching the classifier to a Gemma model (also served through the Gemini API) avoid that risk?

All facts below were pulled from live pages on `ai.google.dev`, `github.com/googleapis/js-genai`, `github.com/google-gemini/deprecated-generative-ai-js`, `googleapis.github.io/js-genai`, and the npm registry on 2026-08-31, by downloading the raw HTML/JSON (not just a summarizer's paraphrase) and grepping for the literal strings. Where Google's own docs contradict something a candidate might remember from training data, that's called out explicitly.

## TL;DR

- **Gemma is not a shortcut around rate limits.** Google's `rate-limits` page no longer publishes any numeric RPM/TPM/RPD table for *any* model, Gemini or Gemma — free and paid — as of this writing (page last updated 2026-08-18). It only shows tier *qualification* rules and spend-based caps, and tells you to view your actual numbers in AI Studio after you have a key. There is no publicly documented number to compare "Gemini free tier" against "Gemma free tier."
- **Gemma has no paid tier at all.** Gemma 4 pricing is "Free of charge" for input/output and "Not available" for the paid columns — meaning if you ever *do* need more throughput, Gemini Flash-Lite can be unlocked via billing (Tier 1), but Gemma can never be. That makes Gemma a reasonable *burst-relief fallback*, not a long-term primary answer to rate-limit anxiety.
- **Gemma 4 is genuinely usable for this task.** It's called through the exact same `@google/genai` SDK and endpoint pattern as Gemini (`generateContent` / `interactions.create`), with model IDs `gemma-4-31b-it` and `gemma-4-26b-a4b-it`. Google's docs confirm system instructions and native function calling for Gemma 4. Google's Gemma-specific "Run Gemma with the Gemini API" page does **not** show a JSON-mode example, but Gemma 4 is listed as a plain, uncaveated entry in the Interactions API's "Supported models & agents" table — the same interface that documents `response_format: {mime_type: "application/json", schema: ...}` — so structured JSON output is very likely supported, just not demonstrated for Gemma specifically. Treat this as "probably yes, verify empirically," not a documented guarantee.
- **The bigger surprise: Google has quietly split structured output into two APIs.** The current canonical `structured-output` doc only shows the new **Interactions API** (`client.interactions.create({..., response_format: [...]})`) — zero occurrences of `generateContent`, `responseMimeType`, or `responseSchema` anywhere in that page's HTML. The classic `generateContent` + `config.responseMimeType`/`config.responseSchema` pattern (what the assignment plan assumes) still works — Google's own migration guide labels it "legacy" but says it "remains fully supported" — it's just no longer the flagship example.
- **The old JS SDK, `@google/generative-ai`, is not just "deprecated" — it is past its documented end-of-life** (November 30, 2025, per its own README). Don't let a candidate or a code-generation tool suggest it; `@google/genai` (currently v2.19.0, published 2026-08-25) is the only supported path.
- **`@google/genai` already retries 429s for you by default** — 5 attempts, exponential backoff (base 2.0, 1s initial delay, up to 60s max delay, jitter 1.0) on HTTP 408/429/5xx — configurable via `httpOptions.retryOptions`. A hand-rolled retry loop is redundant unless you want to shorten it for a synchronous HTTP request.
- **Singapore is confirmed as an available region**, and free-tier prompts/responses ARE used to improve Google's products (human review possible) unless the user is in the EEA/Switzerland/UK — Singapore gets no such carve-out.
- **Recommendation:** default to `gemini-2.5-flash-lite` (cheapest paid fallback path, Stable, and the exact model Google's own migration-guide JSON-schema example uses), with `gemma-4-26b-a4b-it` as an optional secondary fallback, both wrapped in the SDK's built-in retry-on-429 plus a deterministic no-key/heuristic fallback so the reviewer's demo never hard-fails.

---

## Findings

### 1. Gemini API rate limits today, per tier

Source: https://ai.google.dev/gemini-api/docs/rate-limits (fetched as raw HTML; footer states **"Last updated 2026-08-18 UTC."**)

**There is no public per-model RPM/TPM/RPD table on this page anymore.** The page's own "Gemini API rate limits" section reads, verbatim:

> "Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio. As your tier and account status change over time, your rate limits will automatically update."
>
> "[View your active rate limits in AI Studio](https://aistudio.google.com/rate-limit?timeRange=last-28-days)"
>
> "Specified rate limits are not guaranteed and actual capacity may vary."

I confirmed that `https://aistudio.google.com/rate-limit?...` redirects to a Google sign-in page — the real numbers are gated behind a logged-in AI Studio session tied to your own project, not published as a static doc. **No Gemma model is mentioned anywhere on this page** (grep for "gemma" against the full raw HTML returned zero matches).

What the page *does* still publish:

**Tier qualification table** (exact quote):

| Usage tier | Qualification | Billing tier cap |
|---|---|---|
| Free | Active project or free trial | N/A |
| Tier 1 | Set up and link an active billing account | $250 |
| Tier 2 | Paid $100 + 3 days from first successful payment | $2,000 |
| Tier 3 | Paid $1,000 + 30 days from first successful payment | $20,000 - $100,000+ |

The companion billing page (https://ai.google.dev/gemini-api/docs/billing) clarifies what "link a billing account" actually requires in practice: *"Upgrading from the Free Tier to the Paid Tier means linking a billing account and prepaying to add a minimum of $10 (or equivalent in other currencies) of credits to your account."* So Tier 1 isn't free to unlock — it costs a real $10 minimum prepay, which a take-home reviewer is very unlikely to do.

**Spend-based rate limits** (rolling 10-minute window; exact quote):

| Usage tier | Spend rate limit (per 10 minutes) |
|---|---|
| Free | N/A |
| Tier 1 | $10 |
| Tier 2 | $50 |
| Tier 3 | $200 |

(Note: Google's own machine-readable export of the same page, `rate-limits.md.txt`, shows Tier 2 as "$200" instead of "$50" in this row — the two live renderings of Google's own page disagree with each other on this one cell. Irrelevant to the Free-tier analysis, but flagged since the instructions ask to note discrepancies rather than silently pick one.)

If a spend-based limit is hit: *"the API returns a 429 RESOURCE_EXHAUSTED error."*

**Caveats stated explicitly on the page:**
- *"Rate limits are applied per project, not per API key."*
- *"Requests per day (RPD) quotas reset at midnight Pacific time."*
- *"Limits vary depending on the specific model being used, and some limits only apply to specific models."*
- *"Rate limits are more restricted for experimental and preview models."*
- *"Specified rate limits are not guaranteed and actual capacity may vary."*

**Practical implication:** neither this research nor the candidate can quote a hard "Free tier Flash-Lite = N RPM" number today — Google has moved that information behind an authenticated dashboard. Any number a candidate remembers from older training data or a blog post should be treated as stale.

### 2. Which models exist right now

Source: https://ai.google.dev/gemini-api/docs/models (raw HTML; footer: **"Last updated 2026-08-27 UTC."**)

Stable model IDs relevant to this task (from the "All Gemini 3 models" and "Gemini 2.5 …" tables):

**Flash family (Stable):**
- `gemini-3.7-flash` — "Our latest and most capable Flash model…"
- `gemini-3.6-flash` — "New Stable" badge
- `gemini-3.5-flash` — "Our legacy Flash model…"
- `gemini-2.5-flash` — "Our best price-performance model for low-latency, high-volume tasks that require reasoning."

**Flash-Lite family (Stable):**
- `gemini-3.5-flash-lite` — "Our fastest, most cost-effective 3.5 model…"
- `gemini-3.1-flash-lite` — "Frontier-class performance rivaling larger models at a fraction of the cost."
- `gemini-2.5-flash-lite` — "The fastest and most budget-friendly multimodal model in the 2.5 family."

**Pro family:**
- `gemini-2.5-pro` — Stable — "Our most advanced model for complex tasks…"
- `gemini-3.1-pro-preview` — **Preview only** (endpoint literally ends in `-preview`); there is currently no Stable Gemini 3.x Pro model.

**Deprecated/shut down** (explicitly listed under "Previous models," which is "deprecated and will be shut down soon"): `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-3-pro-preview`.

**Gemma models: not on this page.** A full-text grep of the raw HTML for "gemma" (case-insensitive) returned zero matches. Gemma is not part of `ai.google.dev/gemini-api/docs/models`'s catalog at all — it lives under a separate `ai.google.dev/gemma/docs` tree (see §3) and is only cross-linked from the *pricing* page and the newer *Interactions API* model table.

Naming convention (quoted from the page, "Model version name patterns" section, applicable "as of September, 2025"): Stable ("Most production apps should use a specific stable model," e.g. `gemini-3.6-flash`), Preview, Latest (e.g. `gemini-flash-latest`, hot-swapped with 2-week breaking-change notice), Experimental ("not stable," "not be suitable for production use").

### 3. Gemma through the Gemini API — capabilities that matter

Sources:
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemma/docs/core/model_card_4
- https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
- https://ai.google.dev/gemini-api/docs/interactions-overview

**Gemma 4 is served through the Gemini API.** The "Run Gemma with the Gemini API" page states: *"The Gemini API supports the following Gemma 4 models: `gemma-4-31b-it`, `gemma-4-26b-a4b-it`."* It shows the identical `@google/genai` call pattern used for Gemini models:

```js
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI();
const response = await ai.models.generateContent({
  model: "gemma-4-26b-a4b-it",
  contents: "Roses are red...",
});
```

**(a) Structured output / JSON mode — not documented for Gemma, but plausibly supported.** The "Run Gemma with the Gemini API" page has sections for Thinking, Image Understanding, System Instructions, Multi-turn Conversations, Function Calling, and Google Search grounding — but **no "Structured output"/JSON-mode section**, unlike the analogous general Gemini quickstart pages. Separately, the current `structured-output` doc page is now Interactions-API-only (see §5), and the Interactions API's "Supported models & agents" table lists both `gemma-4-31b-it` and `gemma-4-26b-a4b-it` as plain rows with no footnote or "not supported" marker, in the same table as every Gemini model. That's suggestive evidence structured `response_format` works for Gemma too, but it is not an explicit documented guarantee — Google simply never shows a Gemma + JSON example. **Recommendation for the candidate: test it directly with your own key; if Gemma's JSON mode misbehaves, the documented fallback pattern is prompt-only JSON (ask the model to emit JSON in the prompt) plus client-side `JSON.parse` with a repair/retry step** — this is a standard, defensible workaround Google itself demonstrates elsewhere (raw prompt-engineered JSON before `responseSchema` existed).

**(b) System instructions — yes, explicitly documented and new in Gemma 4.** The Gemma 4 model card states, as one of Gemma 4's headline new capabilities: *"Native System Prompt Support – Gemma 4 introduces native support for the system role, enabling more structured and controllable conversations."* The Gemini API page shows the identical `config: { systemInstruction: "..." }` call working against `gemma-4-26b-a4b-it`.

**(c) Function calling — yes, natively, and documented against the Gemini API.** Model card: *"Enhanced Coding & Agentic Capabilities – Achieves notable improvements in coding benchmarks alongside native function-calling support, powering highly capable autonomous agents."* The "Run Gemma with the Gemini API" page includes a full working Function Calling example (`tools: [{ functionDeclarations: [...] }]`) against `gemma-4-26b-a4b-it`.

**Other documented differences:**
- **Context window:** *"Gemma 4 features a context window of up to 256K tokens"* — model card further specifies *"The small models feature a 128K context window, while the medium models support 256K."* This is not the constraint it once was for small models — for a batch of task titles it's a non-issue either way.
- **Multimodality:** *"multimodal, handling text and image input (with audio supported on E2B, E4B, and 12B models) and generating text output."* Irrelevant for this text-classification use case.
- **Data use / pricing tier:** covered in §4 — Gemma is always "Free of charge," never has a paid tier, so it can never be moved off the free tier's data-use terms via billing (Gemini can).
- **Thinking mode:** Gemma 4 has a controllable "thinking" mode (`thinkingConfig: { thinkingLevel: "high" | "minimal" }`) — for a cheap classification task you'd want it set to minimal/off to save tokens and latency.

### 4. Free tier terms

Sources: https://ai.google.dev/gemini-api/terms, https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/available-regions

**Data use.** Exact quote from the Terms, "Unpaid Services" → "How Google Uses Your Data":

> "When you use Unpaid Services, including, for example, Google AI Studio and the unpaid quota on Gemini API, Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies... To help with quality and improve our products, human reviewers may read, annotate, and process your API input and output. Google takes steps to protect your privacy as part of this process. This includes disconnecting this data from your Google Account, API key, and Cloud project before reviewers see or annotate it. Do not submit sensitive, confidential, or personal information to the Unpaid Services."

Regional exception, quoted exactly: *"If you're in the European Economic Area, Switzerland, or the United Kingdom, the terms under 'How Google uses Your Data' in 'Paid Services' apply to all Services, including Google AI Studio and unpaid quota in the Gemini API, even though they are offered free of charge."* **Singapore gets no such exception** — free-tier task titles submitted from Singapore are used to improve Google's products and may be read by human reviewers (with account-disconnection applied first). This is directly relevant for a government-agency app: task titles are likely low-sensitivity (e.g. "Set up CI pipeline"), but this should be a conscious, documented decision, not an oversight.

By contrast, Paid Services: *"Google doesn't use your prompts... or responses to improve our products."* Also notable: *"Your access to Gemini API is a 'Paid Service' only when accessing the API through a Cloud Project associated with an active billing account."*

**Region availability.** https://ai.google.dev/gemini-api/docs/available-regions lists supported countries/territories alphabetically; **"Singapore"** appears in that list, confirming API access (and Google AI Studio access) is available there.

**Paid-tier pricing for the cheapest Flash-Lite model**, exact quotes from the pricing page (per 1M tokens, USD, Standard tier):

- `gemini-2.5-flash-lite`: Input **$0.10 (text/image/video)**, **$0.30 (audio)**; Output **$0.40**. (This is the cheapest of the current Flash-Lite models.)
- `gemini-3.5-flash-lite`: Input **$0.30 (text/image/video/audio)**; Output **$2.50**.
- All Flash/Flash-Lite models: Free tier is listed as **"Free of charge"** for input and output.
- Gemma 4: Free tier **"Free of charge"** for input/output/context caching; Paid tier is **"Not available"** across every column (input, output, caching, tuning, grounding) — Gemma literally has no paid pricing tier to fall back on.

### 5. SDK

Sources: https://github.com/googleapis/js-genai (README), https://github.com/google-gemini/deprecated-generative-ai-js (README), https://googleapis.github.io/js-genai/ (TypeDoc reference), npm registry.

**`@google/genai` is the supported SDK; `@google/generative-ai` is not just deprecated, it's past end-of-life.** The old repo's README states, verbatim:

> "**Please be advised that this repository is now considered legacy.** For the latest features, performance improvements, and active development, we strongly recommend migrating to the official **[Google Generative AI SDK for JavaScript](https://github.com/googleapis/js-genai)**."
>
> "**Limited Maintenance:** Development is now restricted to **critical bug fixes only**. No new features will be added."
>
> "**End-of-Life Date:** All support for this repository (including bug fixes) will permanently end on **November 30, 2025**."

That end-of-life date has already passed relative to today (2026-08-31) — the old SDK is fully unsupported now, not merely "discouraged."

**`@google/genai` npm facts** (via `npm view @google/genai version time --json`): latest version **2.19.0**, published **2026-08-25T22:04:10Z**. Dist-tags: `latest = 2.19.0`, `next = 2.9.0-rc.0` (a pre-release tag, evidently stale/orphaned relative to latest — not something to depend on).

**Structured output config**, confirmed against the SDK's own TypeDoc reference for `GenerateContentConfig` (https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html):

- `responseMimeType?: string` — *"Output response mimetype of the generated candidate text. Supported mimetype: `text/plain`: (default)... `application/json`: JSON response in the candidates. The model needs to be prompted to output the appropriate response type, otherwise the behavior is undefined."*
- `responseSchema?: unknown` — *"The Schema object allows the definition of input and output data types... Represents a select subset of an OpenAPI 3.0 schema object. If set, a compatible response_mime_type must also be set... If response_schema doesn't process your schema correctly, try using response_json_schema instead."*
- `responseJsonSchema?: unknown` — *"Optional. Output schema of the generated response. This is an alternative to response_schema that accepts JSON Schema. If set, response_schema must be omitted, but response_mime_type is required."* (Only a documented subset of JSON Schema keywords is supported: `$id, $defs, $ref, $anchor, type, format, title, description, enum, items, prefixItems, minItems, maxItems, minimum, maximum, anyOf, oneOf, properties, additionalProperties, required`, plus the non-standard `propertyOrdering`.)
- `temperature?: number` — present on the same config object, confirming `{ temperature: 0, responseMimeType: "application/json", responseSchema: {...} }` is a single valid config object for one `generateContent` call, exactly as the candidate's plan assumes.

**Timeout / cancellation**, confirmed on the same interface plus `HttpOptions` (https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html):

- `GenerateContentConfig.abortSignal?: AbortSignal` — *"Abort signal which can be used to cancel the request. NOTE: AbortSignal is a client-only operation. Using it to cancel an operation will not cancel the request in the service. You will still be charged usage for any applicable operations."*
- `GenerateContentConfig.httpOptions?: HttpOptions` → `HttpOptions.timeout?: number` — *"Timeout for the request in milliseconds."*

**Built-in retry**, from `HttpOptions.retryOptions?: HttpRetryOptions` (https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html) — this is a significant, easy-to-miss finding:

| Field | Documented default |
|---|---|
| `attempts` | *"Maximum number of attempts, including the original request. If 0 or 1, it means no retries. If not specified, default to 5."* |
| `expBase` | *"Multiplier by which the delay increases after each attempt. If not specified, default to 2.0."* |
| `initialDelay` | *"Initial delay before the first retry, in fractions of a second. If not specified, default to 1.0 second."* |
| `maxDelay` | *"Maximum delay between retries... default to 60.0 seconds."* |
| `jitter` | *"Randomness factor for the delay... default to 1.0."* |
| `httpStatusCodes` | *"List of HTTP status codes that should trigger a retry. If not specified, a default set of retryable codes (408, 429, and 5xx) may be used."* |

So **the SDK retries HTTP 429 automatically, 5 times, with exponential backoff, out of the box, with no code required.** The one caveat: with default settings a fully-exhausted retry sequence could take on the order of a minute or more (1s → 2s → 4s → 8s → 16s, capped at 60s, times jitter) before finally failing — likely too slow for a synchronous task-creation HTTP endpoint, so tuning `attempts`/`maxDelay` down is worth doing explicitly.

**How 429s are signaled**, from https://ai.google.dev/gemini-api/docs/api-errors (this page documents the new Interactions API's error format specifically) and the rate-limits page: HTTP status **429**. Error `code` values documented: `rate_limit_exceeded` ("You have exceeded the per-minute or per-second request or token limit." → "Wait and retry with exponential backoff."), `quota_exceeded` ("You have exceeded your daily quota." → "Wait until the quota resets or request a quota increase."), `too_many_requests` ("You have made too many requests in a short period of time." → "Wait and retry with exponential backoff."). Separately, the rate-limits page documents spend-based limit errors as **"429 RESOURCE_EXHAUSTED"** (the older gRPC-style status naming). I could not find an explicit `retryDelay`/`RetryInfo` field documented on the current API-errors page for either API surface — the only documented per-request guidance is "wait and retry with exponential backoff," which is exactly what the SDK's default `HttpRetryOptions` already implements.

### 6. Practical answer

Given the numbers above:

- **Neither Gemini's free-tier limits nor Gemma's free-tier limits are publicly quotable right now** — Google moved that information behind an authenticated AI Studio dashboard sometime before 2026-08-18. Nobody, including this research, can honestly tell you today's exact "Flash-Lite free tier = N RPM" figure from Google's own docs; the only correct answer a candidate could put in their own design doc is "check your project's live limits in AI Studio after generating a key," which is also literally what Google tells you to do.
- **The workload described is small and bursty, not sustained.** One batched call per task-creation HTTP request, with a reviewer creating "maybe 10–30 tasks in a session," is at most 10–30 LLM calls total (fewer if the reviewer creates tasks in groups), and only turns into a rate-limit problem if most of those requests land inside the same 60-second window and the account's free-tier per-minute allowance for that specific model is unusually low. That's a plausible-but-unconfirmed risk, not a certainty — which is exactly why defensive coding (batching + retry) is worth doing regardless of which model is chosen.
- **Switching to Gemma does not remove this uncertainty — it swaps one unverifiable free-tier number for another unverifiable free-tier number.** What Gemma *does* buy you is a rate-limit bucket separate from whichever Gemini model you use (the rate-limits page says limits vary per specific model), so it's a reasonable pressure-relief valve to fall back to if Flash-Lite gets rate-limited, at the cost of an undocumented JSON-mode guarantee and the permanent inability to raise its limits with billing later.

**Recommendation, grounded in the above:**

- **Default model:** `gemini-2.5-flash-lite`. It's Stable (not Preview, so no extra rate-limit penalty), it's the cheapest Flash-Lite paid-tier fallback ($0.10/$0.40 per 1M tokens) if the reviewer ever links billing, and — notably — it's the exact model Google's own migration guide uses in its worked `responseMimeType`/`responseSchema` JSON-extraction example, which is strong first-party evidence this pattern is well-trodden for this model.
- **Fallback model:** `gemma-4-26b-a4b-it` (the smaller Gemma 4 MoE variant) as a secondary attempt if the primary call 429s after retries are exhausted — free forever, separate rate-limit bucket, same `@google/genai` call shape, documented system-instruction and function-calling support. Verify JSON-mode behavior empirically before relying on it in production; if `responseSchema`/`responseMimeType` misbehaves for Gemma, fall back further to prompt-only JSON (instruct the model to emit only JSON, `temperature: 0`) with a `JSON.parse` + regex-fence-stripping recovery step client-side.
- **Batching:** keep the "one call per task-creation request" design — it's already the right lever for minimizing RPM pressure, since it turns N task titles into 1 request instead of N.
- **Retry with backoff on 429:** don't hand-roll this — `@google/genai`'s `httpOptions.retryOptions` already retries on 408/429/5xx with exponential backoff by default. Do explicitly tune it down for a synchronous HTTP endpoint (e.g. `{ attempts: 3, initialDelay: 0.5, maxDelay: 4 }`) so a worst-case retry sequence doesn't make the task-creation endpoint hang for a minute; also set `httpOptions.timeout` and/or pass an `abortSignal` tied to the incoming request so a stuck LLM call can't wedge the HTTP handler.
- **No-key/fake fallback:** given the free tier's uncertain, unpublished limits and the fact that reviewers are running with a candidate-supplied key (a shared resource across however many reviewers test it), the design should include a deterministic fallback classifier (e.g., simple keyword heuristics against the title) that fires when the API key is missing, or after retries + the Gemma fallback both fail — so a transient rate-limit or outage never blocks task creation for the reviewer.

---

## Recommended changes to the plan

- Set the default model via an env var, e.g. `LLM_MODEL=gemini-2.5-flash-lite`, with a documented fallback env var `LLM_FALLBACK_MODEL=gemma-4-26b-a4b-it`.
- Keep `temperature: 0` and JSON mode via `config: { responseMimeType: "application/json", responseSchema: {...} }` on `generateContent` — this remains fully supported even though Google's flagship docs now lead with the newer Interactions API (`client.interactions.create`); no need to migrate for a take-home project, but worth a one-line comment in code noting the migration exists in case this project is extended later.
- Explicitly configure `httpOptions.retryOptions` (shorter attempts/delays than the SDK default) and `httpOptions.timeout` (or an `AbortSignal` from the incoming HTTP request) rather than relying on un-tuned defaults, since the SDK's default retry ceiling (~5 attempts, up to 60s delay) is too slow for a synchronous task-creation endpoint.
- Add a secondary attempt against the Gemma fallback model only after the primary model's retries are exhausted — verify JSON-schema output empirically first, since Google's docs don't explicitly confirm it for Gemma.
- Add a deterministic no-key/heuristic classifier as the last-resort fallback so task creation never hard-fails on a 429, a missing key, or an outage.
- Document in the README/design notes that free-tier task titles are used by Google to improve its products (human review possible) for Singapore-based usage, since there's no EEA/UK/Switzerland-style carve-out — a one-line disclosure worth having for a government-agency reviewer.

---

## Sources

- https://ai.google.dev/gemini-api/docs/rate-limits (and its `.md.txt` export)
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/interactions-overview
- https://ai.google.dev/gemini-api/docs/migrate-to-interactions
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing
- https://ai.google.dev/gemini-api/docs/api-errors
- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/available-regions
- https://ai.google.dev/gemma/docs/core/model_card_4
- https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
- https://github.com/googleapis/js-genai (README)
- https://github.com/google-gemini/deprecated-generative-ai-js (README)
- https://googleapis.github.io/js-genai/
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html
- npm registry: `npm view @google/genai version time dist-tags`

---

## Errata (2026-08-31, verified against the published package)

The "retries by default" claim in the TL;DR and §5 is **wrong for `@google/genai` 2.19.0**. Inspecting the package fetched with `npm pack @google/genai@latest` (`package/dist/node/index.mjs`, `ApiClient.apiCall`, ~lines 13865–13920):

- `if (!retryOptions) { return runFetch(); }` — **no retries at all unless `httpOptions.retryOptions` is supplied** (an empty object `{}` opts in with the defaults).
- Defaults once opted in: `DEFAULT_RETRY_ATTEMPTS = 5` (including the initial call), `DEFAULT_RETRY_INITIAL_DELAY = 1.0` s, `DEFAULT_RETRY_MAX_DELAY = 60.0` s, `DEFAULT_RETRY_EXP_BASE = 2`, `DEFAULT_RETRY_JITTER = 1`, `DEFAULT_RETRY_HTTP_STATUS_CODES = [408, 429, 500, 502, 503, 504]`.
- `httpOptions.timeout` is in **milliseconds** (`setTimeout(() => controller.abort(), timeout)`) and bounds **each attempt**, not the whole retry sequence ("A fresh signal per attempt, so that `timeout` bounds this attempt rather than the whole retry sequence").
- Whole-call cancellation is via `GenerateContentConfig.abortSignal?: AbortSignal` (`package/dist/node/node.d.ts`, interface `GenerateContentConfig`, alongside `httpOptions`, `responseMimeType`, `responseSchema`, `responseJsonSchema`, `temperature`, `systemInstruction`, `thinkingConfig`). `HttpOptions` itself has no signal field — the reviewer's observation was correct.

Consequence for the plan: pass `httpOptions: { timeout, retryOptions: { attempts, initialDelay, maxDelay } }` explicitly and `config.abortSignal = AbortSignal.timeout(totalBudgetMs)`.

## Errata 2 (2026-08-31, found by the Playwright e2e run against the live API)

- `httpOptions.timeout` is **also sent to the server** as an `X-Server-Timeout` header (seconds), and the API rejects
  values under 10 s: `400 INVALID_ARGUMENT — "Manually set deadline 5s is too short. Minimum allowed deadline is 10s."`
  Every model in the chain failed the same way, so the task was created as `unresolved`.
- Consequence for the implementation: the classifier no longer uses `httpOptions.timeout` or the SDK's `retryOptions`.
  It runs its own attempt loop, each attempt bounded client-side by `AbortSignal.timeout(LLM_ATTEMPT_TIMEOUT_MS)`
  combined (`AbortSignal.any`) with the chain's whole-budget signal, retrying only on 408/429/5xx, network errors and
  attempt timeouts with 1 s → 2 s jittered backoff. The earlier "Consequence for the plan" line above is superseded.
- Also observed live: Gemma models (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`) return HTTP 200 when `responseMimeType`
  is set but ignore it, answering with prose around a fenced JSON block — hence prompt-only JSON plus lenient extraction.
- **Gemma 4 thinks by default.** Through the SDK the answer arrives as two parts, one flagged `thought: true`
  (`usageMetadata.thoughtsTokenCount ≈ 230–275` for a two-title prompt) and `response.text` is the clean JSON, but the
  request takes 6.6–9.7 s. Controls tried live on `gemma-4-31b-it`: `thinkingConfig.thinkingBudget: 0` → 400 "Thinking
  budget is not supported for this model"; `thinkingLevel: 'low'` → 400 "Thinking level is not supported";
  `includeThoughts: false` and a "do not reason" system instruction → no effect; `maxOutputTokens: 200` → truncated inside
  the thoughts, no answer at all. **`thinkingLevel: 'minimal'` works**: 0 thought tokens, 2.7–5.1 s (`gemma-4-31b-it`),
  4.8 s (`gemma-4-26b-a4b-it`), and `gemini-3.5-flash-lite` accepts it too (0.9 s vs 1.5 s). Adopted for every model;
  the per-attempt timeout default moved from 5 s to 8 s accordingly.


## Errata 3 (2026-09-01, from a review of the retry policy against the findings above)

Errata 2's description of the attempt loop ("retrying only on 408/429/5xx, network errors and attempt timeouts") is
superseded. Reviewing that policy against §1 and §5 turned up three mismatches between what the loop retries and what
the rate limits it was written for actually do:

- **Retrying a 429 against the same model cannot work.** §1 records that limits reset per minute (and RPD at midnight
  Pacific) and "vary depending on the specific model being used". The backoff is capped at 2 s so a synchronous create
  request stays bounded — three orders of magnitude short of a per-minute window. Meanwhile the fallback chain already
  holds the real remedy, a model with its own quota. 429 was therefore removed from the retryable set: it ends the
  model immediately and the chain falls through.
- **Retrying a timed-out attempt starved the fallback.** With the shipped defaults (15 s budget, 8 s per attempt, 2
  attempts) a primary that timed out twice consumed 8 s + ~1 s backoff + the remaining ~6 s, and `ChainClassifier`'s
  `if (combined.aborted) break` then skipped *both* Gemma models — the retry spent the budget the fallback needed. A
  timed-out attempt is no longer retried; the primary hands over at ~8 s with ~7 s left, enough for `gemma-4-31b-it`
  (measured above at 2.7–5.1 s).
- **A 429 cost a full round trip on every subsequent create.** Nothing remembered the refusal, so an exhausted quota —
  per-day especially, which does not reset until midnight Pacific — was rediscovered once per task created.
  `RateLimitCooldown` now holds a model that answered 429 out of the chain for `LLM_RATE_LIMIT_COOLDOWN_MS` (default
  60 s, the shortest window that can clear a per-minute limit).

What was *not* done, and why: §5 notes that no `retryDelay`/`RetryInfo` field is documented on the current api-errors
page, and `ApiError` exposes only `status` and `message` (the SDK stringifies the whole JSON error body into that
message, so a `RetryInfo` or `QuotaFailure` detail would survive there — unverified). Parsing it would let the cooldown
distinguish `rate_limit_exceeded` from `quota_exceeded` and honour a server-supplied delay. That needs a real 429 to
verify against before anything depends on it, so the flat window stands for now.
