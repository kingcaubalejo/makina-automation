import { Automaton, alphabetOf, getStartState, StateId } from '../models/automaton';
import { initialActive, step } from './simulate';

export function generateAcceptedStrings(
  a: Automaton,
  count = 5,
  maxLength = 8
): string[] {
  const start = getStartState(a);
  if (!start) return [];
  const acceptIds = new Set(a.states.filter((s) => s.isAccept).map((s) => s.id));
  if (acceptIds.size === 0) return [];

  const alphabet = alphabetOf(a);
  const init = initialActive(a);
  const results: string[] = [];
  const seen = new Set<string>();

  const queue: Array<{ str: string; active: Set<StateId> }> = [
    { str: '', active: init },
  ];

  while (queue.length && results.length < count) {
    const { str, active } = queue.shift()!;
    const key = `${str}|${[...active].sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if ([...active].some((id) => acceptIds.has(id)) && !results.includes(str)) {
      results.push(str);
      if (results.length >= count) break;
    }
    if (str.length >= maxLength) continue;

    for (const sym of alphabet) {
      const next = step(a, active, sym);
      if (next.size === 0) continue;
      queue.push({ str: str + sym, active: next });
    }
  }

  return results;
}
