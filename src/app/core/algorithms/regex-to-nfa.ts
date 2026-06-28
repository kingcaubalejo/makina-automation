import {
  Automaton,
  AutomatonState,
  AutomatonTransition,
  EPSILON,
  StateId,
  uid,
} from '../models/automaton';

interface Frag {
  startId: StateId;
  acceptId: StateId;
  states: AutomatonState[];
  transitions: AutomatonTransition[];
}

const META = new Set(['(', ')', '|', '*', '+', '?', '.', '\\']);

function preprocess(re: string): string {
  let out = '';
  for (let i = 0; i < re.length; i++) {
    const c = re[i];
    out += c;
    if (i + 1 >= re.length) continue;
    const next = re[i + 1];
    const concatLeft = c === ')' || c === '*' || c === '+' || c === '?' || (!META.has(c) && c !== '·');
    const concatRight = next === '(' || (!META.has(next) && next !== '·');
    if (concatLeft && concatRight) out += '·';
  }
  return out;
}

function precedence(op: string): number {
  switch (op) {
    case '*':
    case '+':
    case '?':
      return 3;
    case '·':
      return 2;
    case '|':
      return 1;
    default:
      return 0;
  }
}

function toPostfix(re: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  let i = 0;
  while (i < re.length) {
    const c = re[i];
    if (c === '\\' && i + 1 < re.length) {
      out.push(re[i + 1]);
      i += 2;
      continue;
    }
    if (c === '(') {
      stack.push(c);
    } else if (c === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') out.push(stack.pop()!);
      stack.pop();
    } else if (c === '|' || c === '·' || c === '*' || c === '+' || c === '?') {
      while (
        stack.length &&
        stack[stack.length - 1] !== '(' &&
        precedence(stack[stack.length - 1]) >= precedence(c)
      ) {
        out.push(stack.pop()!);
      }
      stack.push(c);
    } else {
      out.push(c);
    }
    i++;
  }
  while (stack.length) out.push(stack.pop()!);
  return out;
}

function newState(label: string, x = 0, y = 0): AutomatonState {
  return { id: uid('s'), label, x, y, isStart: false, isAccept: false };
}

function symbolFrag(sym: string): Frag {
  const start = newState('');
  const accept = newState('');
  return {
    startId: start.id,
    acceptId: accept.id,
    states: [start, accept],
    transitions: [{ id: uid('t'), fromId: start.id, toId: accept.id, symbols: [sym] }],
  };
}

function epsFrag(): Frag {
  return symbolFrag(EPSILON);
}

function concatFrag(a: Frag, b: Frag): Frag {
  return {
    startId: a.startId,
    acceptId: b.acceptId,
    states: [...a.states, ...b.states],
    transitions: [
      ...a.transitions,
      { id: uid('t'), fromId: a.acceptId, toId: b.startId, symbols: [EPSILON] },
      ...b.transitions,
    ],
  };
}

function unionFrag(a: Frag, b: Frag): Frag {
  const start = newState('');
  const accept = newState('');
  return {
    startId: start.id,
    acceptId: accept.id,
    states: [start, ...a.states, ...b.states, accept],
    transitions: [
      { id: uid('t'), fromId: start.id, toId: a.startId, symbols: [EPSILON] },
      { id: uid('t'), fromId: start.id, toId: b.startId, symbols: [EPSILON] },
      ...a.transitions,
      ...b.transitions,
      { id: uid('t'), fromId: a.acceptId, toId: accept.id, symbols: [EPSILON] },
      { id: uid('t'), fromId: b.acceptId, toId: accept.id, symbols: [EPSILON] },
    ],
  };
}

function starFrag(a: Frag): Frag {
  const start = newState('');
  const accept = newState('');
  return {
    startId: start.id,
    acceptId: accept.id,
    states: [start, ...a.states, accept],
    transitions: [
      { id: uid('t'), fromId: start.id, toId: a.startId, symbols: [EPSILON] },
      { id: uid('t'), fromId: start.id, toId: accept.id, symbols: [EPSILON] },
      ...a.transitions,
      { id: uid('t'), fromId: a.acceptId, toId: a.startId, symbols: [EPSILON] },
      { id: uid('t'), fromId: a.acceptId, toId: accept.id, symbols: [EPSILON] },
    ],
  };
}

function plusFrag(a: Frag): Frag {
  return concatFrag(cloneFrag(a), starFrag(a));
}

function questionFrag(a: Frag): Frag {
  const start = newState('');
  const accept = newState('');
  return {
    startId: start.id,
    acceptId: accept.id,
    states: [start, ...a.states, accept],
    transitions: [
      { id: uid('t'), fromId: start.id, toId: a.startId, symbols: [EPSILON] },
      { id: uid('t'), fromId: start.id, toId: accept.id, symbols: [EPSILON] },
      ...a.transitions,
      { id: uid('t'), fromId: a.acceptId, toId: accept.id, symbols: [EPSILON] },
    ],
  };
}

function cloneFrag(a: Frag): Frag {
  const map = new Map<StateId, StateId>();
  const states = a.states.map((s) => {
    const fresh = { ...s, id: uid('s') };
    map.set(s.id, fresh.id);
    return fresh;
  });
  const transitions = a.transitions.map((t) => ({
    id: uid('t'),
    fromId: map.get(t.fromId)!,
    toId: map.get(t.toId)!,
    symbols: [...t.symbols],
  }));
  return {
    startId: map.get(a.startId)!,
    acceptId: map.get(a.acceptId)!,
    states,
    transitions,
  };
}

export function regexToNfa(re: string): Automaton {
  if (re === '') {
    const f = epsFrag();
    return finalize(f);
  }
  const tokens = toPostfix(preprocess(re));
  const stack: Frag[] = [];
  for (const tok of tokens) {
    switch (tok) {
      case '·': {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(concatFrag(a, b));
        break;
      }
      case '|': {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(unionFrag(a, b));
        break;
      }
      case '*':
        stack.push(starFrag(stack.pop()!));
        break;
      case '+':
        stack.push(plusFrag(stack.pop()!));
        break;
      case '?':
        stack.push(questionFrag(stack.pop()!));
        break;
      default:
        stack.push(symbolFrag(tok));
    }
  }
  if (stack.length !== 1) throw new Error('Invalid regular expression');
  return finalize(stack[0]);
}

function finalize(f: Frag): Automaton {
  let label = 0;
  for (const s of f.states) {
    if (s.id === f.startId) {
      s.isStart = true;
      s.label = `q${label++}`;
    }
  }
  for (const s of f.states) {
    if (s.id === f.acceptId) {
      s.isAccept = true;
    }
    if (!s.label) s.label = `q${label++}`;
  }
  layout(f);
  return { states: f.states, transitions: f.transitions };
}

function layout(f: Frag): void {
  const byId = new Map(f.states.map((s) => [s.id, s]));
  const depth = new Map<StateId, number>();
  depth.set(f.startId, 0);
  const queue: StateId[] = [f.startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of f.transitions) {
      if (t.fromId === id && !depth.has(t.toId)) {
        depth.set(t.toId, (depth.get(id) ?? 0) + 1);
        queue.push(t.toId);
      }
    }
  }
  const layers = new Map<number, AutomatonState[]>();
  for (const s of f.states) {
    const d = depth.get(s.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(s);
  }
  const xStep = 130;
  const yStep = 110;
  for (const [d, list] of layers) {
    const yOff = -((list.length - 1) * yStep) / 2;
    list.forEach((s, i) => {
      s.x = 140 + d * xStep;
      s.y = 320 + yOff + i * yStep;
    });
  }
  byId.size;
}
