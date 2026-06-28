import { Automaton, EPSILON, StateId } from '../models/automaton';

export function epsilonClosure(a: Automaton, ids: Iterable<StateId>): Set<StateId> {
  const closure = new Set<StateId>(ids);
  const stack: StateId[] = [...closure];
  while (stack.length) {
    const id = stack.pop()!;
    for (const t of a.transitions) {
      if (t.fromId !== id) continue;
      if (!t.symbols.includes(EPSILON)) continue;
      if (!closure.has(t.toId)) {
        closure.add(t.toId);
        stack.push(t.toId);
      }
    }
  }
  return closure;
}

export function move(a: Automaton, ids: Iterable<StateId>, symbol: string): Set<StateId> {
  const out = new Set<StateId>();
  const fromSet = ids instanceof Set ? ids : new Set(ids);
  for (const t of a.transitions) {
    if (!fromSet.has(t.fromId)) continue;
    if (!t.symbols.includes(symbol)) continue;
    out.add(t.toId);
  }
  return out;
}
