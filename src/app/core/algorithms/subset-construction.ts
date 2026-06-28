import {
  alphabetOf,
  Automaton,
  AutomatonState,
  AutomatonTransition,
  emptyAutomaton,
  getStartState,
  StateId,
  uid,
} from '../models/automaton';
import { epsilonClosure, move } from './epsilon-closure';

export interface SubsetEntry {
  id: StateId;
  label: string;
  members: StateId[];
  transitions: Record<string, StateId>;
  isStart: boolean;
  isAccept: boolean;
  x?: number;
  y?: number;
}

export interface ConversionResult {
  dfa: Automaton;
  table: SubsetEntry[];
  alphabet: string[];
}

const setKey = (s: Set<StateId>): string => [...s].sort().join('|');

export function nfaToDfa(nfa: Automaton): ConversionResult {
  const start = getStartState(nfa);
  const alphabet = alphabetOf(nfa);
  if (!start) {
    return { dfa: emptyAutomaton(), table: [], alphabet };
  }

  const labelById = new Map(nfa.states.map((s) => [s.id, s.label]));
  const acceptIds = new Set(nfa.states.filter((s) => s.isAccept).map((s) => s.id));

  const startSet = epsilonClosure(nfa, [start.id]);
  const queue: Array<Set<StateId>> = [startSet];
  const seen = new Map<string, SubsetEntry>();

  const makeLabel = (members: StateId[]): string => {
    if (members.length === 0) return '∅';
    return `{${members.map((id) => labelById.get(id) ?? id).sort().join(',')}}`;
  };

  const startKey = setKey(startSet);
  const startMembers = [...startSet].sort();
  seen.set(startKey, {
    id: uid('dfa'),
    label: makeLabel(startMembers),
    members: startMembers,
    transitions: {},
    isStart: true,
    isAccept: startMembers.some((id) => acceptIds.has(id)),
  });

  while (queue.length) {
    const current = queue.shift()!;
    const currentKey = setKey(current);
    const entry = seen.get(currentKey)!;
    for (const sym of alphabet) {
      const moved = move(nfa, current, sym);
      const closure = epsilonClosure(nfa, moved);
      if (closure.size === 0) continue;
      const key = setKey(closure);
      if (!seen.has(key)) {
        const members = [...closure].sort();
        seen.set(key, {
          id: uid('dfa'),
          label: makeLabel(members),
          members,
          transitions: {},
          isStart: false,
          isAccept: members.some((id) => acceptIds.has(id)),
        });
        queue.push(closure);
      }
      entry.transitions[sym] = seen.get(key)!.id;
    }
  }

  const entries = [...seen.values()];
  layoutLayered(entries, alphabet);

  const states: AutomatonState[] = entries.map((e, i) => ({
    id: e.id,
    label: e.label,
    x: e.x ?? 120 + (i % 5) * 200,
    y: e.y ?? 100 + Math.floor(i / 5) * 200,
    isStart: e.isStart,
    isAccept: e.isAccept,
  }));

  const transitions: AutomatonTransition[] = [];
  const grouped = new Map<string, AutomatonTransition>();
  for (const e of entries) {
    for (const [sym, toId] of Object.entries(e.transitions)) {
      const k = `${e.id}->${toId}`;
      const existing = grouped.get(k);
      if (existing) {
        existing.symbols.push(sym);
      } else {
        const t: AutomatonTransition = {
          id: uid('t'),
          fromId: e.id,
          toId,
          symbols: [sym],
        };
        grouped.set(k, t);
        transitions.push(t);
      }
    }
  }
  for (const t of transitions) t.symbols.sort();

  return {
    dfa: { states, transitions },
    table: entries,
    alphabet,
  };
}

function layoutLayered(entries: SubsetEntry[], alphabet: string[]): void {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const startEntry = entries.find((e) => e.isStart);
  if (!startEntry) return;

  const depth = new Map<StateId, number>();
  depth.set(startEntry.id, 0);
  const queue: StateId[] = [startEntry.id];
  while (queue.length) {
    const id = queue.shift()!;
    const e = byId.get(id);
    if (!e) continue;
    for (const sym of alphabet) {
      const next = e.transitions[sym];
      if (next && !depth.has(next)) {
        depth.set(next, (depth.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
  }

  const layers = new Map<number, StateId[]>();
  for (const e of entries) {
    const d = depth.get(e.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(e.id);
  }

  const xStep = 220;
  const yStep = 140;
  for (const [d, ids] of layers) {
    const yOffset = -((ids.length - 1) * yStep) / 2;
    ids.forEach((id, i) => {
      const e = byId.get(id)!;
      e.x = 200 + d * xStep;
      e.y = 320 + yOffset + i * yStep;
    });
  }
}
