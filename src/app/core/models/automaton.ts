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

export const MAX_IMPORT_SIZE = 1_000_000;
export const MAX_STATES = 5000;
export const MAX_TRANSITIONS = 10_000;
export const MAX_LABEL_LENGTH = 200;
export const MAX_SYMBOL_LENGTH = 64;

export function parseAutomaton(value: unknown): Automaton {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid automaton file.');
  }
  const obj = value as { states?: unknown; transitions?: unknown };
  if (!Array.isArray(obj.states) || !Array.isArray(obj.transitions)) {
    throw new Error('Invalid automaton file.');
  }
  if (obj.states.length > MAX_STATES) {
    throw new Error(`Too many states (max ${MAX_STATES}).`);
  }
  if (obj.transitions.length > MAX_TRANSITIONS) {
    throw new Error(`Too many transitions (max ${MAX_TRANSITIONS}).`);
  }
  const ids = new Set<string>();
  const states: AutomatonState[] = obj.states.map((raw, i) => {
    const s = parseState(raw, i);
    if (ids.has(s.id)) {
      throw new Error(`Duplicate state id "${s.id}".`);
    }
    ids.add(s.id);
    return s;
  });
  const transitions: AutomatonTransition[] = obj.transitions.map((raw, i) =>
    parseTransition(raw, i, ids)
  );
  return { states, transitions };
}

function parseState(raw: unknown, i: number): AutomatonState {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`State #${i} is not an object.`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || r['id'].length === 0) {
    throw new Error(`State #${i} has invalid id.`);
  }
  if (typeof r['label'] !== 'string' || r['label'].length > MAX_LABEL_LENGTH) {
    throw new Error(`State "${r['id']}" has invalid label.`);
  }
  if (!Number.isFinite(r['x']) || !Number.isFinite(r['y'])) {
    throw new Error(`State "${r['id']}" has invalid coordinates.`);
  }
  return {
    id: r['id'],
    label: r['label'],
    x: r['x'] as number,
    y: r['y'] as number,
    isStart: Boolean(r['isStart']),
    isAccept: Boolean(r['isAccept']),
  };
}

function parseTransition(
  raw: unknown,
  i: number,
  validStateIds: Set<string>
): AutomatonTransition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Transition #${i} is not an object.`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || r['id'].length === 0) {
    throw new Error(`Transition #${i} has invalid id.`);
  }
  if (typeof r['fromId'] !== 'string' || !validStateIds.has(r['fromId'])) {
    throw new Error(`Transition "${r['id']}" references unknown fromId.`);
  }
  if (typeof r['toId'] !== 'string' || !validStateIds.has(r['toId'])) {
    throw new Error(`Transition "${r['id']}" references unknown toId.`);
  }
  if (!Array.isArray(r['symbols'])) {
    throw new Error(`Transition "${r['id']}" has invalid symbols.`);
  }
  const symbols = r['symbols'].map((s, j) => {
    if (typeof s !== 'string' || s.length === 0 || s.length > MAX_SYMBOL_LENGTH) {
      throw new Error(`Transition "${r['id']}" has invalid symbol at index ${j}.`);
    }
    return s;
  });
  return {
    id: r['id'],
    fromId: r['fromId'],
    toId: r['toId'],
    symbols,
  };
}
