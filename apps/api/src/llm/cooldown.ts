/**
 * Remembers which models have recently answered HTTP 429, so the chain can skip one that is still
 * out of quota instead of spending a round trip to be refused again.
 *
 * The window is a flat `cooldownMs` rather than a delay read out of the error. The Gemini API
 * reports both per-minute (`rate_limit_exceeded`) and per-day (`quota_exceeded`) exhaustion as a
 * plain 429, and `ApiError` exposes only `status` and `message` — any `retryDelay` would have to be
 * dug out of the JSON error body the SDK stringifies into that message, which Google's current
 * api-errors page does not document. One minute is the shortest window that can actually clear a
 * per-minute limit, and it caps what a per-day exhaustion costs at one wasted request per minute
 * rather than one per task created.
 *
 * State is per process, which is all this app needs (a single API container). Several API replicas
 * would each learn the same limit separately — slower to settle, still correct.
 */
export class RateLimitCooldown {
  private readonly until = new Map<string, number>();

  constructor(
    private readonly cooldownMs: number,
    /** Injectable for tests; production uses the wall clock. */
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a 429 from `model`, holding it out of the chain for `cooldownMs`. */
  record(model: string): void {
    if (this.cooldownMs > 0) this.until.set(model, this.now() + this.cooldownMs);
  }

  /** Milliseconds until `model` is worth trying again; 0 when it is available now. */
  remainingMs(model: string): number {
    const until = this.until.get(model);
    if (until === undefined) return 0;
    const remaining = until - this.now();
    if (remaining > 0) return remaining;
    this.until.delete(model);
    return 0;
  }
}
