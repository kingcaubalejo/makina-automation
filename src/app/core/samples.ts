import { Automaton, EPSILON } from './models/automaton';

export interface SampleAutomaton {
  name: string;
  description: string;
  data: Automaton;
}

export const SAMPLES: SampleAutomaton[] = [
  {
    name: 'NFA: ends with "ab"',
    description: 'Strings over {a,b} that end with "ab".',
    data: {
      states: [
        { id: 's_q0', label: 'q0', x: 200, y: 320, isStart: true, isAccept: false },
        { id: 's_q1', label: 'q1', x: 420, y: 320, isStart: false, isAccept: false },
        { id: 's_q2', label: 'q2', x: 640, y: 320, isStart: false, isAccept: true },
      ],
      transitions: [
        { id: 't_1', fromId: 's_q0', toId: 's_q0', symbols: ['a', 'b'] },
        { id: 't_2', fromId: 's_q0', toId: 's_q1', symbols: ['a'] },
        { id: 't_3', fromId: 's_q1', toId: 's_q2', symbols: ['b'] },
      ],
    },
  },
  {
    name: 'NFA with ε: a(b|c)*',
    description: "ε-NFA accepting 'a' followed by any sequence of b's and c's.",
    data: {
      states: [
        { id: 's_p0', label: 'q0', x: 160, y: 320, isStart: true, isAccept: false },
        { id: 's_p1', label: 'q1', x: 340, y: 320, isStart: false, isAccept: false },
        { id: 's_p2', label: 'q2', x: 520, y: 220, isStart: false, isAccept: false },
        { id: 's_p3', label: 'q3', x: 520, y: 420, isStart: false, isAccept: false },
        { id: 's_p4', label: 'q4', x: 700, y: 320, isStart: false, isAccept: true },
      ],
      transitions: [
        { id: 't_a1', fromId: 's_p0', toId: 's_p1', symbols: ['a'] },
        { id: 't_e1', fromId: 's_p1', toId: 's_p2', symbols: [EPSILON] },
        { id: 't_e2', fromId: 's_p1', toId: 's_p3', symbols: [EPSILON] },
        { id: 't_e3', fromId: 's_p1', toId: 's_p4', symbols: [EPSILON] },
        { id: 't_b', fromId: 's_p2', toId: 's_p1', symbols: ['b'] },
        { id: 't_c', fromId: 's_p3', toId: 's_p1', symbols: ['c'] },
      ],
    },
  },
  {
    name: 'DFA: divisible by 3 (binary)',
    description: 'DFA over {0,1} accepting binary numbers divisible by 3.',
    data: {
      states: [
        { id: 's_r0', label: 'r0', x: 200, y: 320, isStart: true, isAccept: true },
        { id: 's_r1', label: 'r1', x: 440, y: 220, isStart: false, isAccept: false },
        { id: 's_r2', label: 'r2', x: 440, y: 420, isStart: false, isAccept: false },
      ],
      transitions: [
        { id: 't_x1', fromId: 's_r0', toId: 's_r0', symbols: ['0'] },
        { id: 't_x2', fromId: 's_r0', toId: 's_r1', symbols: ['1'] },
        { id: 't_x3', fromId: 's_r1', toId: 's_r2', symbols: ['0'] },
        { id: 't_x4', fromId: 's_r1', toId: 's_r0', symbols: ['1'] },
        { id: 't_x5', fromId: 's_r2', toId: 's_r1', symbols: ['0'] },
        { id: 't_x6', fromId: 's_r2', toId: 's_r2', symbols: ['1'] },
      ],
    },
  },
];
