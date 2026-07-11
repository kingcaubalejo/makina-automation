import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  Automaton,
  AutomatonState,
  AutomatonTransition,
  emptyAutomaton,
  EPSILON,
  nextStateLabel,
  StateId,
  TransitionId,
  uid,
  validate,
  alphabetOf,
} from '../models/automaton';
import { autoLayout } from '../algorithms/auto-layout';
import { WorkbookService } from './workbook-service';

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

interface Snapshot {
  states: AutomatonState[];
  transitions: AutomatonTransition[];
}

const HISTORY_LIMIT = 100;
const STORAGE_PREFIX = 'makina';
const LEGACY_DOC_KEY = 'automata-studio:document';
const MAX_IMPORT_SIZE = 1_000_000;
const MAX_STATES = 5000;
const MAX_TRANSITIONS = 10_000;
const MAX_LABEL_LENGTH = 200;
const MAX_SYMBOL_LENGTH = 64;
const PERSIST_DEBOUNCE_MS = 250;
const THEME_STORAGE_KEY = 'makina:theme';

@Injectable({ providedIn: 'root' })
export class EditorStore {
  readonly states = signal<AutomatonState[]>([]);
  readonly transitions = signal<AutomatonTransition[]>([]);
  readonly tool = signal<Tool>('select');
  readonly selection = signal<Selection>({ stateIds: [], transitionIds: [] });
  readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  readonly transitionDraft = signal<{ fromId: StateId } | null>(null);
  readonly activeStates = signal<Set<StateId>>(new Set());
  readonly theme = signal<'light' | 'dark'>(this.readInitialTheme());
  readonly workspaceId = signal<string>(this.readWorkspaceIdFromUrl());
  readonly workspaceName = signal<string>('Untitled');
  readonly simulationInput = signal<string>('');

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

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  private docTimer: ReturnType<typeof setTimeout> | undefined;
  private nameTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly workbooks = inject(WorkbookService);

  constructor() {
    this.load();
    void this.workbooks.ensure(this.workspaceId(), this.workspaceName());
    effect(() => {
      // touch signals so the effect re-runs on change
      this.states();
      this.transitions();
      if (this.docTimer) clearTimeout(this.docTimer);
      this.docTimer = setTimeout(() => this.flushDoc(), PERSIST_DEBOUNCE_MS);
    });
    effect(() => {
      const name = this.workspaceName();
      if (this.nameTimer) clearTimeout(this.nameTimer);
      this.nameTimer = setTimeout(() => this.flushName(), PERSIST_DEBOUNCE_MS);
      if (typeof document !== 'undefined') {
        document.title = `${name} · Makina`;
      }
    });
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
    if (typeof window !== 'undefined') {
      const flushAll = () => {
        this.flushDoc();
        this.flushName();
      };
      window.addEventListener('beforeunload', flushAll);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
      });
    }
  }

  setWorkspaceName(name: string): void {
    const trimmed = name.trim();
    this.workspaceName.set(trimmed || 'Untitled');
  }

  openNewWindow(): void {
    if (typeof window === 'undefined') return;
    const id = 'w_' + Math.random().toString(36).slice(2, 9);
    const url = window.location.pathname + (window.location.search ?? '') + '#w=' + id;
    window.open(url, '_blank', 'noopener');
  }

  switchTo(id: string): void {
    if (typeof window === 'undefined') return;
    if (id === this.workspaceId()) return;
    this.flushDoc();
    this.flushName();
    window.location.hash = 'w=' + encodeURIComponent(id);
    window.location.reload();
  }

  workspaceStorageKey(suffix: string): string {
    return `${STORAGE_PREFIX}:${suffix}:${this.workspaceId()}`;
  }

  private docKey(): string {
    return `${STORAGE_PREFIX}:document:${this.workspaceId()}`;
  }
  private nameKey(): string {
    return `${STORAGE_PREFIX}:name:${this.workspaceId()}`;
  }

  private readWorkspaceIdFromUrl(): string {
    if (typeof window === 'undefined') return 'default';
    const m = window.location.hash.match(/w=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : 'default';
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

  addState(x: number, y: number): AutomatonState {
    this.snapshot();
    const auto = this.automaton();
    const isFirst = auto.states.length === 0;
    const newState: AutomatonState = {
      id: uid('s'),
      label: nextStateLabel(auto),
      x,
      y,
      isStart: isFirst,
      isAccept: false,
    };
    this.states.update((arr) => [...arr, newState]);
    return newState;
  }

  moveState(id: StateId, x: number, y: number, snapshot = false): void {
    if (snapshot) this.snapshot();
    this.states.update((arr) => arr.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }

  deleteSelected(): void {
    const sel = this.selection();
    if (!sel.stateIds.length && !sel.transitionIds.length) return;
    this.snapshot();
    const stateIds = new Set(sel.stateIds);
    const transIds = new Set(sel.transitionIds);
    this.states.update((arr) => arr.filter((s) => !stateIds.has(s.id)));
    this.transitions.update((arr) =>
      arr.filter((t) => !transIds.has(t.id) && !stateIds.has(t.fromId) && !stateIds.has(t.toId))
    );
    this.clearSelection();
  }

  setStateLabel(id: StateId, label: string): void {
    this.snapshot();
    this.states.update((arr) => arr.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  setStart(id: StateId): void {
    this.snapshot();
    this.states.update((arr) => arr.map((s) => ({ ...s, isStart: s.id === id })));
  }

  toggleAccept(id: StateId): void {
    this.snapshot();
    this.states.update((arr) =>
      arr.map((s) => (s.id === id ? { ...s, isAccept: !s.isAccept } : s))
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
    this.snapshot();
    const cleaned = symbols.length ? symbols : ['a'];
    const existing = this.transitions().find(
      (t) => t.fromId === draft.fromId && t.toId === toId
    );
    let result: AutomatonTransition;
    if (existing) {
      const merged = unique([...existing.symbols, ...cleaned]);
      this.transitions.update((arr) =>
        arr.map((t) => (t.id === existing.id ? { ...t, symbols: merged } : t))
      );
      result = { ...existing, symbols: merged };
    } else {
      result = { id: uid('t'), fromId: draft.fromId, toId, symbols: cleaned };
      this.transitions.update((arr) => [...arr, result]);
    }
    this.transitionDraft.set(null);
    return result;
  }

  setTransitionSymbols(id: TransitionId, symbols: string[]): void {
    this.snapshot();
    const cleaned = unique(symbols.filter((s) => s.length > 0));
    if (cleaned.length === 0) {
      this.transitions.update((arr) => arr.filter((t) => t.id !== id));
      this.selection.update((cur) => ({
        stateIds: cur.stateIds,
        transitionIds: cur.transitionIds.filter((x) => x !== id),
      }));
      return;
    }
    this.transitions.update((arr) =>
      arr.map((t) => (t.id === id ? { ...t, symbols: cleaned } : t))
    );
  }

  loadAutomaton(a: Automaton, replaceHistory = false): void {
    if (!replaceHistory) this.snapshot();
    this.states.set(a.states.map((s) => ({ ...s })));
    this.transitions.set(a.transitions.map((t) => ({ ...t, symbols: [...t.symbols] })));
    this.clearSelection();
    this.activeStates.set(new Set());
    if (replaceHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  clear(): void {
    this.snapshot();
    this.states.set([]);
    this.transitions.set([]);
    this.clearSelection();
    this.activeStates.set(new Set());
    this.simulationInput.set('');
  }

  tidyLayout(): void {
    if (this.states().length === 0) return;
    this.snapshot();
    const laid = autoLayout(this.automaton());
    this.states.set(laid.states);
    this.transitions.set(laid.transitions);
  }

  setActiveStates(ids: Iterable<StateId>): void {
    this.activeStates.set(new Set(ids));
  }

  clearActiveStates(): void {
    this.activeStates.set(new Set());
  }

  exportJson(): string {
    return JSON.stringify(
      { version: 1, automaton: this.automaton() },
      null,
      2
    );
  }

  importJson(text: string): void {
    if (text.length > MAX_IMPORT_SIZE) {
      throw new Error('Import file is too large.');
    }
    const parsed = JSON.parse(text);
    const candidate = parsed && (parsed as { automaton?: unknown }).automaton
      ? (parsed as { automaton: unknown }).automaton
      : parsed;
    const auto = parseAutomaton(candidate);
    this.loadAutomaton(auto, true);
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.cloneSnapshot());
    this.states.set(prev.states);
    this.transitions.set(prev.transitions);
    this.clearSelection();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.cloneSnapshot());
    this.states.set(next.states);
    this.transitions.set(next.transitions);
    this.clearSelection();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private snapshot(): void {
    this.undoStack.push(this.cloneSnapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private cloneSnapshot(): Snapshot {
    return {
      states: this.states().map((s) => ({ ...s })),
      transitions: this.transitions().map((t) => ({ ...t, symbols: [...t.symbols] })),
    };
  }

  private flushDoc(): void {
    if (this.docTimer) {
      clearTimeout(this.docTimer);
      this.docTimer = undefined;
    }
    try {
      localStorage.setItem(
        this.docKey(),
        JSON.stringify({ states: this.states(), transitions: this.transitions() }),
      );
    } catch {
      // ignore quota
    }
    void this.workbooks.touch(this.workspaceId());
  }

  private flushName(): void {
    if (this.nameTimer) {
      clearTimeout(this.nameTimer);
      this.nameTimer = undefined;
    }
    try {
      localStorage.setItem(this.nameKey(), this.workspaceName());
    } catch {
      // ignore quota
    }
    void this.workbooks.rename(this.workspaceId(), this.workspaceName());
  }

  private load(): void {
    try {
      if (this.workspaceId() === 'default') {
        const legacy = localStorage.getItem(LEGACY_DOC_KEY);
        if (legacy && !localStorage.getItem(this.docKey())) {
          localStorage.setItem(this.docKey(), legacy);
          localStorage.removeItem(LEGACY_DOC_KEY);
        }
      }
      const raw = localStorage.getItem(this.docKey());
      if (raw && raw.length <= MAX_IMPORT_SIZE) {
        try {
          const auto = parseAutomaton(JSON.parse(raw));
          this.states.set(auto.states);
          this.transitions.set(auto.transitions);
        } catch {
          // corrupted document; start fresh rather than crash
        }
      }
      const storedName = localStorage.getItem(this.nameKey());
      if (storedName) {
        this.workspaceName.set(storedName);
      } else if (this.workspaceId() !== 'default') {
        this.workspaceName.set('Untitled');
      } else {
        this.workspaceName.set('Main');
      }
    } catch {
      // ignore
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function parseAutomaton(value: unknown): Automaton {
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

export { EPSILON };
