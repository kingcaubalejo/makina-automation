import {
  alphabetOf,
  Automaton,
  AutomatonState,
  AutomatonTransition,
  getStartState,
  StateId,
  uid,
} from '../models/automaton';

interface PartitionEntry {
  id: number;
  members: Set<StateId>;
}

export interface MinimizationResult {
  dfa: Automaton;
  partitions: Array<{ label: string; members: string[] }>;
}

export function minimizeDfa(dfa: Automaton): MinimizationResult {
  const start = getStartState(dfa);
  const alphabet = alphabetOf(dfa);
  if (!start || dfa.states.length === 0) {
    return { dfa: { states: [], transitions: [] }, partitions: [] };
  }

  const labelById = new Map(dfa.states.map((s) => [s.id, s.label]));
  const reachable = bfsReachable(dfa, start.id);
  const liveStates = dfa.states.filter((s) => reachable.has(s.id));

  const transTable = new Map<StateId, Map<string, StateId>>();
  for (const s of liveStates) transTable.set(s.id, new Map());
  for (const t of dfa.transitions) {
    if (!reachable.has(t.fromId)) continue;
    for (const sym of t.symbols) {
      transTable.get(t.fromId)!.set(sym, t.toId);
    }
  }

  const accepts = new Set(liveStates.filter((s) => s.isAccept).map((s) => s.id));
  const nonAccepts = new Set(liveStates.filter((s) => !s.isAccept).map((s) => s.id));

  let partitions: Array<Set<StateId>> = [];
  if (accepts.size) partitions.push(accepts);
  if (nonAccepts.size) partitions.push(nonAccepts);

  let changed = true;
  while (changed) {
    changed = false;
    const next: Array<Set<StateId>> = [];
    const partitionOf = (id: StateId): number => partitions.findIndex((p) => p.has(id));
    for (const group of partitions) {
      const buckets = new Map<string, Set<StateId>>();
      for (const id of group) {
        const sig = alphabet
          .map((sym) => {
            const dest = transTable.get(id)?.get(sym);
            return dest === undefined ? '-' : String(partitionOf(dest));
          })
          .join(',');
        if (!buckets.has(sig)) buckets.set(sig, new Set());
        buckets.get(sig)!.add(id);
      }
      if (buckets.size > 1) changed = true;
      for (const b of buckets.values()) next.push(b);
    }
    partitions = next;
  }

  const partitionOf = (id: StateId): number => partitions.findIndex((p) => p.has(id));
  const groupReps: AutomatonState[] = partitions.map((group, i) => {
    const memberIds = [...group];
    const memberLabels = memberIds.map((id) => labelById.get(id) ?? id).sort();
    const containsStart = memberIds.includes(start.id);
    const isAccept = memberIds.some((id) => accepts.has(id));
    return {
      id: uid('min'),
      label: memberLabels.length === 1 ? memberLabels[0] : `{${memberLabels.join(',')}}`,
      x: 200 + i * 220,
      y: 320,
      isStart: containsStart,
      isAccept,
    };
  });

  const transitions: AutomatonTransition[] = [];
  const grouped = new Map<string, AutomatonTransition>();
  for (let i = 0; i < partitions.length; i++) {
    const rep = [...partitions[i]][0];
    for (const sym of alphabet) {
      const dest = transTable.get(rep)?.get(sym);
      if (dest === undefined) continue;
      const targetIdx = partitionOf(dest);
      const k = `${i}->${targetIdx}`;
      const existing = grouped.get(k);
      if (existing) {
        existing.symbols.push(sym);
      } else {
        const t: AutomatonTransition = {
          id: uid('t'),
          fromId: groupReps[i].id,
          toId: groupReps[targetIdx].id,
          symbols: [sym],
        };
        grouped.set(k, t);
        transitions.push(t);
      }
    }
  }
  for (const t of transitions) t.symbols.sort();

  layoutBfs(groupReps, transitions);

  return {
    dfa: { states: groupReps, transitions },
    partitions: partitions.map((g, i) => ({
      label: groupReps[i].label,
      members: [...g].map((id) => labelById.get(id) ?? id).sort(),
    })),
  };
}

function bfsReachable(a: Automaton, startId: StateId): Set<StateId> {
  const reach = new Set<StateId>([startId]);
  const queue: StateId[] = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of a.transitions) {
      if (t.fromId === id && !reach.has(t.toId)) {
        reach.add(t.toId);
        queue.push(t.toId);
      }
    }
  }
  return reach;
}

function layoutBfs(states: AutomatonState[], transitions: AutomatonTransition[]): void {
  const start = states.find((s) => s.isStart);
  if (!start) return;
  const depth = new Map<StateId, number>();
  depth.set(start.id, 0);
  const queue: StateId[] = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of transitions) {
      if (t.fromId === id && !depth.has(t.toId)) {
        depth.set(t.toId, (depth.get(id) ?? 0) + 1);
        queue.push(t.toId);
      }
    }
  }
  const layers = new Map<number, AutomatonState[]>();
  for (const s of states) {
    const d = depth.get(s.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(s);
  }
  const xStep = 220;
  const yStep = 140;
  for (const [d, list] of layers) {
    const yOffset = -((list.length - 1) * yStep) / 2;
    list.forEach((s, i) => {
      s.x = 200 + d * xStep;
      s.y = 320 + yOffset + i * yStep;
    });
  }
}
