import { computed, effect, Injectable, NgZone, inject, signal } from '@angular/core';
import {
  alphabetOf,
  Automaton,
  AutomatonState,
  AutomatonTransition,
  EPSILON,
  MAX_IMPORT_SIZE,
  nextStateLabel,
  parseAutomaton,
  StateId,
  TransitionId,
  uid,
  validate,
} from '../models/automaton';
import { autoLayout } from '../algorithms/auto-layout';

export type Tool = 'select' | 'state' | 'transition' | 'pan' | 'erase';

export interface Selection {
  stateIds: StateId[];
  transitionIds: TransitionId[];
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const STORAGE_PREFIX = 'makina';
const THEME_STORAGE_KEY = 'makina:theme';
const DOC_STORAGE_KEY = 'makina:doc:v1';
const UNDO_LIMIT = 100;
const COALESCE_MS = 500;
const PERSIST_DEBOUNCE_MS = 300;

interface DocSnapshot {
  states: AutomatonState[];
  transitions: AutomatonTransition[];
  workspaceName: string;
}

interface PersistedDoc extends DocSnapshot {
  version: 1;
}

@Injectable({ providedIn: 'root' })
export class EditorStore {
  private readonly zone = inject(NgZone);

  readonly tool = signal<Tool>('select');
  readonly selection = signal<Selection>({ stateIds: [], transitionIds: [] });
  readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  readonly transitionDraft = signal<{ fromId: StateId } | null>(null);
  readonly activeStates = signal<Set<StateId>>(new Set());
  readonly theme = signal<'light' | 'dark'>(this.readInitialTheme());
  readonly simulationInput = signal<string>('');

  readonly states = signal<AutomatonState[]>([]);
  readonly transitions = signal<AutomatonTransition[]>([]);
  readonly workspaceName = signal<string>('Untitled');

  readonly documentReset = signal(0);

  readonly undoAvailable = signal(false);
  readonly redoAvailable = signal(false);

  readonly automaton = computed<Automaton>(() => ({
    states: this.states(),
    transitions: this.transitions(),
  }));
  readonly alphabet = computed(() => alphabetOf(this.automaton()));
  readonly validation = computed(() => validate(this.automaton()));

  readonly selectedStates = computed(() => {
    const ids = new Set(this.selection().stateIds);
    return this.states().filter((s) => ids.has(s.id));
  });
  readonly selectedTransitions = computed(() => {
    const ids = new Set(this.selection().transitionIds);
    return this.transitions().filter((t) => ids.has(t.id));
  });

  private undoStack: DocSnapshot[] = [];
  private redoStack: DocSnapshot[] = [];
  private lastCoalesceKey: string | null = null;
  private lastCommitAt = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();

    effect(() => {
      const t = this.theme();
      if (typeof document !== 'undefined') {
        document.documentElement.dataset['theme'] = t;
      }
      try {
        localStorage.setItem(THEME_STORAGE_KEY, t);
      } catch {
        // ignore quota
      }
    });
    effect(() => {
      const name = this.workspaceName();
      if (typeof document !== 'undefined') {
        document.title = `${name} · Makina`;
      }
    });
    effect(() => {
      // Watch all persisted fields so any change schedules a save.
      this.states();
      this.transitions();
      this.workspaceName();
      this.schedulePersist();
    });
  }

  workspaceId(): string {
    return 'local';
  }

  workspaceStorageKey(suffix: string): string {
    return `${STORAGE_PREFIX}:${suffix}:local`;
  }

  private readInitialTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // ignore
    }
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(DOC_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedDoc;
      if (parsed?.version !== 1) return;
      const auto = parseAutomaton({ states: parsed.states, transitions: parsed.transitions });
      this.states.set(auto.states);
      this.transitions.set(auto.transitions);
      if (typeof parsed.workspaceName === 'string' && parsed.workspaceName.trim()) {
        this.workspaceName.set(parsed.workspaceName);
      }
    } catch {
      // corrupt — ignore and start fresh
    }
  }

  private schedulePersist(): void {
    if (typeof localStorage === 'undefined') return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flushPersist(), PERSIST_DEBOUNCE_MS);
  }

  private flushPersist(): void {
    this.persistTimer = null;
    try {
      const payload: PersistedDoc = {
        version: 1,
        states: this.states(),
        transitions: this.transitions(),
        workspaceName: this.workspaceName(),
      };
      localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota
    }
  }

  private snapshot(): DocSnapshot {
    return {
      states: this.states().map((s) => ({ ...s })),
      transitions: this.transitions().map((t) => ({ ...t, symbols: [...t.symbols] })),
      workspaceName: this.workspaceName(),
    };
  }

  private restore(snap: DocSnapshot): void {
    this.zone.run(() => {
      this.states.set(snap.states.map((s) => ({ ...s })));
      this.transitions.set(snap.transitions.map((t) => ({ ...t, symbols: [...t.symbols] })));
      this.workspaceName.set(snap.workspaceName);
      const liveStateIds = new Set(snap.states.map((s) => s.id));
      const liveTransitionIds = new Set(snap.transitions.map((t) => t.id));
      const sel = this.selection();
      this.selection.set({
        stateIds: sel.stateIds.filter((id) => liveStateIds.has(id)),
        transitionIds: sel.transitionIds.filter((id) => liveTransitionIds.has(id)),
      });
      this.activeStates.set(new Set());
      this.transitionDraft.set(null);
    });
  }

  private commit(coalesceKey?: string): void {
    const now = Date.now();
    if (
      coalesceKey &&
      this.lastCoalesceKey === coalesceKey &&
      now - this.lastCommitAt < COALESCE_MS
    ) {
      this.lastCommitAt = now;
      return;
    }
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.lastCommitAt = now;
    this.lastCoalesceKey = coalesceKey ?? null;
    this.updateUndoState();
  }

  private updateUndoState(): void {
    this.zone.run(() => {
      this.undoAvailable.set(this.undoStack.length > 0);
      this.redoAvailable.set(this.redoStack.length > 0);
    });
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    this.lastCoalesceKey = null;
    this.updateUndoState();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.lastCoalesceKey = null;
    this.updateUndoState();
  }

  canUndo(): boolean {
    return this.undoAvailable();
  }

  canRedo(): boolean {
    return this.redoAvailable();
  }

  setTool(tool: Tool): void {
    this.tool.set(tool);
    if (tool !== 'transition') this.transitionDraft.set(null);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme.set(theme);
  }

  toggleTheme(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  setViewport(v: Partial<Viewport>): void {
    this.viewport.update((cur) => ({ ...cur, ...v }));
  }

  resetViewport(): void {
    this.viewport.set({ x: 0, y: 0, scale: 1 });
  }

  zoomBy(factor: number, cx: number, cy: number): void {
    const v = this.viewport();
    const newScale = clamp(v.scale * factor, 0.2, 3);
    const ratio = newScale / v.scale;
    this.viewport.set({
      x: cx - (cx - v.x) * ratio,
      y: cy - (cy - v.y) * ratio,
      scale: newScale,
    });
  }

  panBy(dx: number, dy: number): void {
    this.viewport.update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }

  selectOnly(stateIds: StateId[] = [], transitionIds: TransitionId[] = []): void {
    this.selection.set({ stateIds: [...stateIds], transitionIds: [...transitionIds] });
  }

  toggleSelectState(id: StateId, additive: boolean): void {
    this.selection.update((cur) => {
      if (!additive) return { stateIds: [id], transitionIds: [] };
      const has = cur.stateIds.includes(id);
      return {
        stateIds: has ? cur.stateIds.filter((x) => x !== id) : [...cur.stateIds, id],
        transitionIds: cur.transitionIds,
      };
    });
  }

  toggleSelectTransition(id: TransitionId, additive: boolean): void {
    this.selection.update((cur) => {
      if (!additive) return { stateIds: [], transitionIds: [id] };
      const has = cur.transitionIds.includes(id);
      return {
        stateIds: cur.stateIds,
        transitionIds: has ? cur.transitionIds.filter((x) => x !== id) : [...cur.transitionIds, id],
      };
    });
  }

  clearSelection(): void {
    this.selection.set({ stateIds: [], transitionIds: [] });
  }

  selectAll(): void {
    this.selection.set({
      stateIds: this.states().map((s) => s.id),
      transitionIds: this.transitions().map((t) => t.id),
    });
  }

  addState(x: number, y: number): AutomatonState | null {
    this.commit();
    const isFirst = this.states().length === 0;
    const id = uid('s');
    const label = nextStateLabel(this.automaton());
    const state: AutomatonState = {
      id,
      label,
      x,
      y,
      isStart: isFirst,
      isAccept: false,
    };
    this.states.update((cur) => [...cur, state]);
    return state;
  }

  moveState(id: StateId, x: number, y: number, _snapshot = false): void {
    this.commit(`move:${id}`);
    this.states.update((cur) =>
      cur.map((s) => (s.id === id ? { ...s, x, y } : s)),
    );
  }

  deleteSelected(): void {
    const sel = this.selection();
    if (!sel.stateIds.length && !sel.transitionIds.length) return;
    this.commit();
    const stateIds = new Set(sel.stateIds);
    const transIds = new Set(sel.transitionIds);
    const hadStates = this.states().length > 0;
    this.states.update((cur) =>
      cur.map((s) => (stateIds.has(s.id) && s.isStart ? { ...s, isStart: false } : s))
        .filter((s) => !stateIds.has(s.id)),
    );
    this.transitions.update((cur) =>
      cur.filter((t) => !transIds.has(t.id) && !stateIds.has(t.fromId) && !stateIds.has(t.toId)),
    );
    if (hadStates && this.states().length === 0) {
      this.documentReset.update((n) => n + 1);
    }
    this.clearSelection();
  }

  setStateLabel(id: StateId, label: string): void {
    this.commit(`label:${id}`);
    this.states.update((cur) => cur.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  setStart(id: StateId): void {
    if (!this.states().some((s) => s.id === id)) return;
    this.commit();
    this.states.update((cur) =>
      cur.map((s) => ({ ...s, isStart: s.id === id })),
    );
  }

  toggleAccept(id: StateId): void {
    const target = this.states().find((s) => s.id === id);
    if (!target) return;
    this.commit();
    this.states.update((cur) =>
      cur.map((s) => (s.id === id ? { ...s, isAccept: !s.isAccept } : s)),
    );
  }

  beginTransition(fromId: StateId): void {
    this.transitionDraft.set({ fromId });
  }

  cancelTransition(): void {
    this.transitionDraft.set(null);
  }

  completeTransition(toId: StateId, symbols: string[] = ['a']): AutomatonTransition | null {
    const draft = this.transitionDraft();
    if (!draft) return null;
    const cleaned = unique((symbols.length ? symbols : ['a']).filter((s) => s.length > 0));
    if (cleaned.length === 0) {
      this.transitionDraft.set(null);
      return null;
    }

    this.commit();
    const existing = this.transitions().find(
      (t) => t.fromId === draft.fromId && t.toId === toId,
    );

    let result: AutomatonTransition;
    if (existing) {
      const merged = unique([...existing.symbols, ...cleaned]);
      result = { ...existing, symbols: merged };
      this.transitions.update((cur) =>
        cur.map((t) => (t.id === existing.id ? result : t)),
      );
    } else {
      result = {
        id: uid('t'),
        fromId: draft.fromId,
        toId,
        symbols: cleaned,
      };
      this.transitions.update((cur) => [...cur, result]);
    }
    this.transitionDraft.set(null);
    return result;
  }

  setTransitionSymbols(id: TransitionId, symbols: string[]): void {
    const target = this.transitions().find((t) => t.id === id);
    if (!target) return;
    const cleaned = unique(symbols.filter((s) => s.length > 0));
    this.commit(`transition-symbols:${id}`);
    if (cleaned.length === 0) {
      this.transitions.update((cur) => cur.filter((t) => t.id !== id));
      this.selection.update((cur) => ({
        stateIds: cur.stateIds,
        transitionIds: cur.transitionIds.filter((x) => x !== id),
      }));
      return;
    }
    this.transitions.update((cur) =>
      cur.map((t) => (t.id === id ? { ...t, symbols: cleaned } : t)),
    );
  }

  loadAutomaton(a: Automaton, _replaceHistory = false): void {
    this.commit();
    const states = a.states.map((s) => ({ ...s }));
    if (states.length > 0) {
      // Translate so the bbox is centered past the ~316px inspector overlay.
      // Without this, loaded automata that use small world coordinates
      // (e.g. a 1-state DFA at (200, 320)) render underneath the inspector
      // and the canvas appears empty.
      const xs = states.map((s) => s.x);
      const ys = states.map((s) => s.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const dx = 640 - cx;
      const dy = 400 - cy;
      for (const s of states) {
        s.x += dx;
        s.y += dy;
      }
    }
    this.states.set(states);
    this.transitions.set(a.transitions.map((t) => ({ ...t, symbols: [...t.symbols] })));
    this.clearSelection();
    this.activeStates.set(new Set());
  }

  clear(): void {
    const hadStates = this.states().length > 0;
    this.commit();
    this.states.set([]);
    this.transitions.set([]);
    this.clearSelection();
    this.activeStates.set(new Set());
    this.simulationInput.set('');
    if (hadStates) this.documentReset.update((n) => n + 1);
  }

  tidyLayout(): void {
    if (this.states().length === 0) return;
    const laid = autoLayout(this.automaton());
    this.commit();
    const posById = new Map(laid.states.map((s) => [s.id, { x: s.x, y: s.y }]));
    this.states.update((cur) =>
      cur.map((s) => {
        const pos = posById.get(s.id);
        return pos ? { ...s, x: pos.x, y: pos.y } : s;
      }),
    );
  }

  setActiveStates(ids: Iterable<StateId>): void {
    this.activeStates.set(new Set(ids));
  }

  clearActiveStates(): void {
    this.activeStates.set(new Set());
  }

  setWorkspaceName(name: string): void {
    const trimmed = name.trim() || 'Untitled';
    if (trimmed === this.workspaceName()) return;
    this.commit('workspace-name');
    this.workspaceName.set(trimmed);
  }

  exportJson(): string {
    return JSON.stringify(
      { version: 1, automaton: this.automaton() },
      null,
      2,
    );
  }

  importJson(text: string): void {
    if (text.length > MAX_IMPORT_SIZE) {
      throw new Error('Import file is too large.');
    }
    const parsed = JSON.parse(text);
    const candidate =
      parsed && (parsed as { automaton?: unknown }).automaton
        ? (parsed as { automaton: unknown }).automaton
        : parsed;
    const auto = parseAutomaton(candidate);
    this.loadAutomaton(auto, true);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export { EPSILON };
