export const EPSILON = 'ε';

export type StateId = string;
export type TransitionId = string;

export interface AutomatonState {
  id: StateId;
  label: string;
  x: number;
  y: number;
  isStart: boolean;
  isAccept: boolean;
}

export interface AutomatonTransition {
  id: TransitionId;
  fromId: StateId;
  toId: StateId;
  symbols: string[];
}

export interface Automaton {
  states: AutomatonState[];
  transitions: AutomatonTransition[];
}

export interface ValidationResult {
  isDfa: boolean;
  hasStart: boolean;
  hasAccept: boolean;
  alphabet: string[];
  errors: string[];
  warnings: string[];
}

export function emptyAutomaton(): Automaton {
  return { states: [], transitions: [] };
}

export function getStartState(a: Automaton): AutomatonState | undefined {
  return a.states.find((s) => s.isStart);
}

export function alphabetOf(a: Automaton): string[] {
  const set = new Set<string>();
  for (const t of a.transitions) {
    for (const sym of t.symbols) {
      if (sym !== EPSILON) set.add(sym);
    }
  }
  return [...set].sort();
}

export function validate(a: Automaton): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const start = getStartState(a);
  const alphabet = alphabetOf(a);
  const accepts = a.states.filter((s) => s.isAccept);

  if (!start) errors.push('No start state defined.');
  if (accepts.length === 0) warnings.push('No accept state defined — every input will be rejected.');

  let isDfa = true;
  if (a.transitions.some((t) => t.symbols.includes(EPSILON))) isDfa = false;

  const seen = new Map<string, number>();
  for (const t of a.transitions) {
    for (const sym of t.symbols) {
      if (sym === EPSILON) continue;
      const key = `${t.fromId}|${sym}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const count of seen.values()) {
    if (count > 1) {
      isDfa = false;
      break;
    }
  }

  if (isDfa) {
    for (const state of a.states) {
      for (const sym of alphabet) {
        if (!seen.has(`${state.id}|${sym}`)) {
          isDfa = false;
          warnings.push(`State "${state.label}" missing transition on "${sym}" (DFA must be total).`);
          break;
        }
      }
    }
  }

  return {
    isDfa,
    hasStart: !!start,
    hasAccept: accepts.length > 0,
    alphabet,
    errors,
    warnings,
  };
}

export function nextStateLabel(a: Automaton): string {
  const used = new Set(a.states.map((s) => s.label));
  let i = 0;
  while (used.has(`q${i}`)) i++;
  return `q${i}`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
