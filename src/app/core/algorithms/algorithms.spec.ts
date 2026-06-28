import { describe, it, expect } from 'vitest';
import { Automaton, EPSILON } from '../models/automaton';
import { epsilonClosure, move } from './epsilon-closure';
import { simulate } from './simulate';
import { nfaToDfa } from './subset-construction';
import { minimizeDfa } from './minimize';
import { regexToNfa } from './regex-to-nfa';
import { automatonToRegex } from './dfa-to-regex';
import { generateAcceptedStrings } from './generate-strings';
import { autoLayout } from './auto-layout';

const endsWithAb: Automaton = {
  states: [
    { id: 'q0', label: 'q0', x: 0, y: 0, isStart: true, isAccept: false },
    { id: 'q1', label: 'q1', x: 0, y: 0, isStart: false, isAccept: false },
    { id: 'q2', label: 'q2', x: 0, y: 0, isStart: false, isAccept: true },
  ],
  transitions: [
    { id: 't1', fromId: 'q0', toId: 'q0', symbols: ['a', 'b'] },
    { id: 't2', fromId: 'q0', toId: 'q1', symbols: ['a'] },
    { id: 't3', fromId: 'q1', toId: 'q2', symbols: ['b'] },
  ],
};

const epsNfa: Automaton = {
  states: [
    { id: 'p0', label: 'p0', x: 0, y: 0, isStart: true, isAccept: false },
    { id: 'p1', label: 'p1', x: 0, y: 0, isStart: false, isAccept: true },
  ],
  transitions: [{ id: 'e', fromId: 'p0', toId: 'p1', symbols: [EPSILON] }],
};

describe('epsilonClosure', () => {
  it('includes the seed state', () => {
    expect(epsilonClosure(epsNfa, ['p0'])).toEqual(new Set(['p0', 'p1']));
  });

  it('returns just the state when no eps transitions', () => {
    expect(epsilonClosure(endsWithAb, ['q0'])).toEqual(new Set(['q0']));
  });
});

describe('move', () => {
  it('returns destinations for a symbol', () => {
    expect(move(endsWithAb, ['q0'], 'a')).toEqual(new Set(['q0', 'q1']));
  });
});

describe('simulate (NFA)', () => {
  it('accepts strings ending with ab', () => {
    expect(simulate(endsWithAb, 'aab').accepted).toBe(true);
    expect(simulate(endsWithAb, 'bbab').accepted).toBe(true);
  });
  it('rejects strings not ending with ab', () => {
    expect(simulate(endsWithAb, 'abb').accepted).toBe(false);
    expect(simulate(endsWithAb, '').accepted).toBe(false);
  });
});

describe('nfaToDfa', () => {
  it('produces a DFA with same language', () => {
    const { dfa } = nfaToDfa(endsWithAb);
    expect(simulate(dfa, 'aab').accepted).toBe(true);
    expect(simulate(dfa, 'abb').accepted).toBe(false);
    expect(simulate(dfa, 'ab').accepted).toBe(true);
  });

  it('handles eps transitions', () => {
    const { dfa } = nfaToDfa(epsNfa);
    expect(simulate(dfa, '').accepted).toBe(true);
  });
});

describe('minimizeDfa', () => {
  it('preserves language and reduces states for ends-with-ab', () => {
    const { dfa } = nfaToDfa(endsWithAb);
    const { dfa: min } = minimizeDfa(dfa);
    expect(simulate(min, 'aab').accepted).toBe(true);
    expect(simulate(min, 'abb').accepted).toBe(false);
    expect(min.states.length).toBeLessThanOrEqual(dfa.states.length);
  });
});

describe('automatonToRegex', () => {
  it('round-trips through regex → NFA → simulate', () => {
    const { dfa } = nfaToDfa(endsWithAb);
    const regex = automatonToRegex(dfa);
    const rebuilt = regexToNfa(regex);
    expect(simulate(rebuilt, 'aab').accepted).toBe(true);
    expect(simulate(rebuilt, 'abb').accepted).toBe(false);
    expect(simulate(rebuilt, 'ab').accepted).toBe(true);
  });
});

describe('generateAcceptedStrings', () => {
  it('returns shortest accepted strings', () => {
    const strings = generateAcceptedStrings(endsWithAb, 3, 6);
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) {
      expect(simulate(endsWithAb, s).accepted).toBe(true);
    }
  });

  it('returns empty when no accept reachable', () => {
    const a: Automaton = {
      states: [{ id: 'a', label: 'a', x: 0, y: 0, isStart: true, isAccept: false }],
      transitions: [],
    };
    expect(generateAcceptedStrings(a, 5, 5)).toEqual([]);
  });
});

describe('autoLayout', () => {
  it('repositions states without changing topology', () => {
    const result = autoLayout(endsWithAb);
    expect(result.states.length).toBe(endsWithAb.states.length);
    expect(result.transitions.length).toBe(endsWithAb.transitions.length);
    expect(simulate(result, 'aab').accepted).toBe(true);
  });
});

describe('regexToNfa', () => {
  it('builds NFA from (a|b)*abb and accepts proper strings', () => {
    const nfa = regexToNfa('(a|b)*abb');
    expect(simulate(nfa, 'abb').accepted).toBe(true);
    expect(simulate(nfa, 'aababb').accepted).toBe(true);
    expect(simulate(nfa, 'abba').accepted).toBe(false);
  });

  it('handles +, ?, alternation', () => {
    const nfa = regexToNfa('a(b|c)+');
    expect(simulate(nfa, 'ab').accepted).toBe(true);
    expect(simulate(nfa, 'abc').accepted).toBe(true);
    expect(simulate(nfa, 'a').accepted).toBe(false);
  });
});
