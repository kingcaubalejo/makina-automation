import { Automaton, AutomatonState, getStartState } from '../models/automaton';

export function autoLayout(a: Automaton): Automaton {
  if (a.states.length === 0) return a;
  const start = getStartState(a) ?? a.states[0];

  const depth = new Map<string, number>();
  depth.set(start.id, 0);
  const queue: string[] = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    for (const t of a.transitions) {
      if (t.fromId === id && !depth.has(t.toId)) {
        depth.set(t.toId, d + 1);
        queue.push(t.toId);
      }
    }
  }
  const maxDepth = depth.size ? Math.max(...depth.values()) : 0;
  for (const s of a.states) {
    if (!depth.has(s.id)) depth.set(s.id, maxDepth + 1);
  }

  const layers = new Map<number, AutomatonState[]>();
  for (const s of a.states) {
    const d = depth.get(s.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(s);
  }

  const xStep = 200;
  const yStep = 130;
  const states = a.states.map((s) => ({ ...s }));
  const byId = new Map(states.map((s) => [s.id, s]));
  const sortedDepths = [...layers.keys()].sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const list = layers.get(d)!;
    list.sort((x, y) => x.label.localeCompare(y.label));
    const yOff = -((list.length - 1) * yStep) / 2;
    list.forEach((s, i) => {
      const target = byId.get(s.id);
      if (!target) return;
      target.x = 220 + d * xStep;
      target.y = 360 + yOff + i * yStep;
    });
  }

  return {
    states,
    transitions: a.transitions.map((t) => ({ ...t, symbols: [...t.symbols] })),
  };
}
