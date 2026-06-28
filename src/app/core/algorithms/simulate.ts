import { Automaton, getStartState, StateId } from '../models/automaton';
import { epsilonClosure, move } from './epsilon-closure';

export interface SimulationStep {
  index: number;
  consumed: string;
  remaining: string;
  active: StateId[];
}

export interface SimulationResult {
  accepted: boolean;
  steps: SimulationStep[];
  finalActive: StateId[];
  rejectedAt?: number;
}

export function initialActive(a: Automaton): Set<StateId> {
  const start = getStartState(a);
  if (!start) return new Set();
  return epsilonClosure(a, [start.id]);
}

export function step(a: Automaton, active: Set<StateId>, symbol: string): Set<StateId> {
  const moved = move(a, active, symbol);
  return epsilonClosure(a, moved);
}

export function simulate(a: Automaton, input: string): SimulationResult {
  const acceptIds = new Set(a.states.filter((s) => s.isAccept).map((s) => s.id));
  let active = initialActive(a);
  const steps: SimulationStep[] = [
    {
      index: 0,
      consumed: '',
      remaining: input,
      active: [...active],
    },
  ];

  if (active.size === 0) {
    return { accepted: false, steps, finalActive: [], rejectedAt: 0 };
  }

  for (let i = 0; i < input.length; i++) {
    const sym = input[i];
    active = step(a, active, sym);
    steps.push({
      index: i + 1,
      consumed: input.slice(0, i + 1),
      remaining: input.slice(i + 1),
      active: [...active],
    });
    if (active.size === 0) {
      return { accepted: false, steps, finalActive: [], rejectedAt: i + 1 };
    }
  }

  const accepted = [...active].some((id) => acceptIds.has(id));
  return { accepted, steps, finalActive: [...active] };
}
