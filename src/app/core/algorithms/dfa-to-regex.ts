import { Automaton, EPSILON, getStartState } from '../models/automaton';

const NEW_START = '__regex_start__';
const NEW_ACCEPT = '__regex_accept__';
const EMPTY_LANG = '∅';

export function automatonToRegex(a: Automaton): string {
  const start = getStartState(a);
  if (!start) return EMPTY_LANG;
  const accepts = a.states.filter((s) => s.isAccept).map((s) => s.id);
  if (accepts.length === 0) return EMPTY_LANG;

  const edges = new Map<string, Map<string, string>>();
  const setEdge = (from: string, to: string, regex: string): void => {
    if (regex === EMPTY_LANG) return;
    if (!edges.has(from)) edges.set(from, new Map());
    edges.get(from)!.set(to, regex);
  };
  const getEdge = (from: string, to: string): string =>
    edges.get(from)?.get(to) ?? EMPTY_LANG;

  setEdge(NEW_START, start.id, 'ε');
  for (const id of accepts) setEdge(id, NEW_ACCEPT, 'ε');

  const grouped = new Map<string, string[]>();
  for (const t of a.transitions) {
    const key = `${t.fromId}|${t.toId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(...t.symbols);
  }
  for (const [key, syms] of grouped) {
    const [from, to] = key.split('|');
    const merged = unionRegex(syms.map((s) => atomFor(s)));
    const existing = getEdge(from, to);
    setEdge(from, to, unionRegex([existing, merged]));
  }

  for (const q of a.states.map((s) => s.id)) {
    const selfLoop = getEdge(q, q);
    const selfStar = starRegex(selfLoop);

    const incomers: Array<[string, string]> = [];
    for (const [from, m] of edges) {
      if (from === q) continue;
      const reg = m.get(q);
      if (reg) incomers.push([from, reg]);
    }
    const outgoers: Array<[string, string]> = [];
    const qOut = edges.get(q);
    if (qOut) {
      for (const [to, reg] of qOut) {
        if (to === q) continue;
        outgoers.push([to, reg]);
      }
    }

    for (const [p, P] of incomers) {
      for (const [r, R] of outgoers) {
        const composed = concatRegex([P, selfStar, R]);
        const existing = getEdge(p, r);
        setEdge(p, r, unionRegex([existing, composed]));
      }
    }

    edges.delete(q);
    for (const m of edges.values()) m.delete(q);
  }

  return getEdge(NEW_START, NEW_ACCEPT) || EMPTY_LANG;
}

function atomFor(symbol: string): string {
  if (symbol === EPSILON) return 'ε';
  if (symbol.length === 1 && !'()|*+?.\\'.includes(symbol)) return symbol;
  return symbol
    .split('')
    .map((c) => ('()|*+?.\\'.includes(c) ? `\\${c}` : c))
    .join('');
}

function unionRegex(parts: string[]): string {
  const filtered = parts.filter((p) => p && p !== EMPTY_LANG);
  if (filtered.length === 0) return EMPTY_LANG;
  if (filtered.length === 1) return filtered[0];
  const unique = [...new Set(filtered)];
  if (unique.length === 1) return unique[0];
  return unique.map((p) => (needsParensInUnion(p) ? p : p)).join('|');
}

function concatRegex(parts: string[]): string {
  const filtered = parts.filter((p) => p && p !== EMPTY_LANG);
  if (filtered.length === 0) return EMPTY_LANG;
  const cleaned = filtered.filter((p) => p !== 'ε');
  if (cleaned.length === 0) return 'ε';
  if (cleaned.length === 1) return cleaned[0];
  return cleaned.map((p) => (hasTopLevelUnion(p) ? `(${p})` : p)).join('');
}

function starRegex(r: string): string {
  if (!r || r === EMPTY_LANG || r === 'ε') return '';
  if (r.length === 1) return `${r}*`;
  if (isFullyParenthesised(r)) return `${r}*`;
  if (r.endsWith('*') && !hasTopLevelUnion(r)) return r;
  return `(${r})*`;
}

function hasTopLevelUnion(r: string): boolean {
  let depth = 0;
  for (const ch of r) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '|' && depth === 0) return true;
  }
  return false;
}

function isFullyParenthesised(r: string): boolean {
  if (!r.startsWith('(') || !r.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '(') depth++;
    else if (r[i] === ')') {
      depth--;
      if (depth === 0 && i !== r.length - 1) return false;
    }
  }
  return depth === 0;
}

function needsParensInUnion(_r: string): boolean {
  return false;
}
