import { describe, expect, it } from 'vitest';
import { canAssign, eligibleDevelopers, missingSkills } from './eligibility.js';
import type { Developer } from './developer.js';

const frontend = { id: 1, name: 'Frontend' };
const backend = { id: 2, name: 'Backend' };
const alice: Developer = { id: 1, name: 'Alice', skills: [frontend] };
const bob: Developer = { id: 2, name: 'Bob', skills: [backend] };
const carol: Developer = { id: 3, name: 'Carol', skills: [frontend, backend] };

describe('canAssign (Rule A)', () => {
  it('requires the developer to hold every task skill', () => {
    expect(canAssign([1], [1])).toBe(true);
    expect(canAssign([1], [2])).toBe(false);
    expect(canAssign([1, 2], [1, 2])).toBe(true);
    expect(canAssign([1], [1, 2])).toBe(false);
  });
  it('allows anyone on a task with no skills', () => {
    expect(canAssign([], [])).toBe(true);
    expect(canAssign([2], [])).toBe(true);
  });
});

describe('missingSkills / eligibleDevelopers', () => {
  it('lists what the developer lacks', () => {
    expect(missingSkills(bob, [frontend, backend])).toEqual([frontend]);
    expect(missingSkills(carol, [frontend, backend])).toEqual([]);
  });
  it('filters developers to the eligible ones', () => {
    expect(eligibleDevelopers([alice, bob, carol], [frontend]).map((d) => d.name)).toEqual([
      'Alice',
      'Carol',
    ]);
    expect(eligibleDevelopers([alice, bob, carol], [frontend, backend]).map((d) => d.name)).toEqual(
      ['Carol'],
    );
  });
});
