/** A programmable `SkillClassifier` for tests: queue up what the next `classify()` call returns. */
import type {
  ClassificationItem,
  ClassificationResult,
  ClassifiedItem,
  SkillClassifier,
} from '../../src/llm/classifier.js';

export interface RecordedCall {
  items: readonly ClassificationItem[];
  allowedSkills: readonly string[];
}

export class FakeClassifier implements SkillClassifier {
  readonly name = 'fake-classifier';
  calls: RecordedCall[] = [];

  private next: (() => Promise<ClassificationResult>) | undefined;

  /** The next `classify()` call resolves `ok: true` with these items. */
  resolveWith(items: ClassifiedItem[], model = this.name): void {
    this.next = () => Promise.resolve({ ok: true, model, items });
  }

  /** The next `classify()` call resolves `ok: false`. */
  failWith(reason: string): void {
    this.next = () => Promise.resolve({ ok: false, reason });
  }

  /** The next `classify()` call rejects. */
  throwWith(error: unknown): void {
    this.next = () => Promise.reject(error);
  }

  /** Clears recorded calls and any pending programmed result — call between tests. */
  reset(): void {
    this.calls = [];
    this.next = undefined;
  }

  classify(
    items: readonly ClassificationItem[],
    allowedSkills: readonly string[],
  ): Promise<ClassificationResult> {
    this.calls.push({ items, allowedSkills });
    const produce = this.next;
    this.next = undefined;
    // Unprogrammed calls default to "unresolved" rather than throwing, so tests that don't care
    // about skill inference (status/assignment/listing) don't have to program the classifier too.
    return (
      produce?.() ?? Promise.resolve({ ok: false, reason: 'FakeClassifier: no result programmed' })
    );
  }
}
