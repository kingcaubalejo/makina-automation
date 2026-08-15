import { computed, effect, Injectable, NgZone, inject, signal } from '@angular/core';
import * as Y from 'yjs';
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
import { bindMapToSignal, bindTextToSignal, replaceText } from './yjs-bridge';

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

/**
 * Symbol used as the Y.js transaction origin for all local edits. The
 * WorkspaceService creates the Y.UndoManager with this origin in its
 * trackedOrigins set so undo only reverts this user's edits.
 */
export const LOCAL_ORIGIN: unique symbol = Symbol('editor-local-origin');

interface UndoMeta {
  selection: Selection;
}

@Injectable({ providedIn: 'root' })
export class EditorStore {
  private readonly zone = inject(NgZone);

  // Per-user local state — not part of the shared Y.Doc.
  readonly tool = signal<Tool>('select');
  readonly selection = signal<Selection>({ stateIds: [], transitionIds: [] });
  readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  readonly transitionDraft = signal<{ fromId: StateId } | null>(null);
  readonly activeStates = signal<Set<StateId>>(new Set());
  readonly theme = signal<'light' | 'dark'>(this.readInitialTheme());
  readonly simulationInput = signal<string>('');

  // Y.Doc-backed state — updated by observers after bind().
  readonly states = signal<AutomatonState[]>([]);
  readonly transitions = signal<AutomatonTransition[]>([]);
  readonly workspaceName = signal<string>('Untitled');

  // Increments each time the doc transitions from non-empty to empty. Simulation
  // panels subscribe to this and reset their local cursor / running state.
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

  private ydoc: Y.Doc | null = null;
  private yStates: Y.Map<Y.Map<unknown>> | null = null;
  private yTransitions: Y.Map<Y.Map<unknown>> | null = null;
  private yMeta: Y.Map<unknown> | null = null;
  private yWorkspaceName: Y.Text | null = null;
  private undoManager: Y.UndoManager | null = null;
  private disposers: Array<() => void> = [];
  private workspaceIdSignal = signal<string | null>(null);

  constructor() {
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
  }

  /**
   * WorkspaceService calls this after opening a workspace's providers. Takes
   * ownership of the Y.Doc + UndoManager for the lifetime of that workspace.
   */
  bind(ydoc: Y.Doc, undoManager: Y.UndoManager, workspaceId: string): void {
    if (this.ydoc) this.unbind();
    this.ydoc = ydoc;
    this.yStates = ydoc.getMap('states') as Y.Map<Y.Map<unknown>>;
    this.yTransitions = ydoc.getMap('transitions') as Y.Map<Y.Map<unknown>>;
    this.yMeta = ydoc.getMap('meta');
    this.yWorkspaceName = ydoc.getText('workspaceName');
    this.undoManager = undoManager;
    this.workspaceIdSignal.set(workspaceId);

    const yStates = this.yStates;
    const yTransitions = this.yTransitions;
    const yMeta = this.yMeta;

    const rebuildStates = () => {
      const startId = yMeta.get('startId') as string | null;
      const out: AutomatonState[] = [];
      yStates.forEach((entry, id) => {
        out.push({
          id,
          label: (entry.get('label') as string) ?? '',
          x: Number(entry.get('x') ?? 0),
          y: Number(entry.get('y') ?? 0),
          isStart: startId === id,
          isAccept: Boolean(entry.get('isAccept')),
        });
      });
      this.zone.run(() => this.states.set(out));
    };
    yStates.observeDeep(rebuildStates);
    const metaHandler = (event: Y.YMapEvent<unknown>) => {
      if (event.keysChanged.has('startId')) rebuildStates();
    };
    yMeta.observe(metaHandler);
    rebuildStates();
    this.disposers.push(() => {
      yStates.unobserveDeep(rebuildStates);
      yMeta.unobserve(metaHandler);
    });

    this.disposers.push(
      bindMapToSignal<AutomatonTransition>(
        yTransitions,
        this.transitions,
        (id, entry) => {
          const symbols = entry.get('symbols');
          const symArr: string[] =
            symbols instanceof Y.Array ? (symbols.toArray() as string[]) : [];
          return {
            id,
            fromId: (entry.get('fromId') as string) ?? '',
            toId: (entry.get('toId') as string) ?? '',
            symbols: symArr,
          };
        },
        this.zone,
      ),
    );

    this.disposers.push(bindTextToSignal(this.yWorkspaceName, this.workspaceName, this.zone));

    // Undo stack management: capture selection alongside each committed edit
    // and filter restored selections against the current Y state on pop.
    const onStackAdded = (e: { stackItem: { meta: Map<unknown, unknown> } }) => {
      const meta: UndoMeta = { selection: this.selection() };
      e.stackItem.meta.set('selection', meta.selection);
      this.updateUndoState();
    };
    const onStackPopped = (e: { stackItem: { meta: Map<unknown, unknown> } }) => {
      const sel = e.stackItem.meta.get('selection') as Selection | undefined;
      if (sel) {
        const restored: Selection = {
          stateIds: sel.stateIds.filter((id) => yStates.has(id)),
          transitionIds: sel.transitionIds.filter((id) => yTransitions.has(id)),
        };
        this.zone.run(() => this.selection.set(restored));
      }
      this.updateUndoState();
    };
    undoManager.on('stack-item-added', onStackAdded);
    undoManager.on('stack-item-popped', onStackPopped);
    this.disposers.push(() => {
      undoManager.off('stack-item-added', onStackAdded);
      undoManager.off('stack-item-popped', onStackPopped);
    });

    // Track non-empty → empty transitions so simulation panels can reset.
    let wasNonEmpty = yStates.size > 0;
    const detectReset = () => {
      const nowEmpty = yStates.size === 0;
      if (wasNonEmpty && nowEmpty) {
        this.zone.run(() => this.documentReset.update((n) => n + 1));
      }
      wasNonEmpty = !nowEmpty;
    };
    yStates.observe(detectReset);
    this.disposers.push(() => yStates.unobserve(detectReset));

    this.updateUndoState();
  }

  unbind(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.ydoc = null;
    this.yStates = null;
    this.yTransitions = null;
    this.yMeta = null;
    this.yWorkspaceName = null;
    this.undoManager = null;
    this.workspaceIdSignal.set(null);
    this.states.set([]);
    this.transitions.set([]);
    this.workspaceName.set('Untitled');
    this.selection.set({ stateIds: [], transitionIds: [] });
    this.activeStates.set(new Set());
    this.transitionDraft.set(null);
    this.simulationInput.set('');
    this.updateUndoState();
  }

  private updateUndoState(): void {
    const um = this.undoManager;
    const undo = um ? um.undoStack.length > 0 : false;
    const redo = um ? um.redoStack.length > 0 : false;
    this.zone.run(() => {
      this.undoAvailable.set(undo);
      this.redoAvailable.set(redo);
    });
  }

  workspaceId(): string | null {
    return this.workspaceIdSignal();
  }

  workspaceStorageKey(suffix: string): string {
    const id = this.workspaceIdSignal() ?? 'unbound';
    return `${STORAGE_PREFIX}:${suffix}:${id}`;
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

  addState(x: number, y: number): AutomatonState | null {
    if (!this.ydoc || !this.yStates || !this.yMeta) return null;
    const yStates = this.yStates;
    const yMeta = this.yMeta;
    const isFirst = yStates.size === 0;
    const id = uid('s');
    const label = nextStateLabel(this.automaton());
    this.ydoc.transact(() => {
      const s = new Y.Map<unknown>();
      s.set('label', label);
      s.set('x', x);
      s.set('y', y);
      s.set('isAccept', false);
      yStates.set(id, s);
      if (isFirst) yMeta.set('startId', id);
    }, LOCAL_ORIGIN);
    return { id, label, x, y, isStart: isFirst, isAccept: false };
  }

  moveState(id: StateId, x: number, y: number, _snapshot = false): void {
    if (!this.ydoc || !this.yStates) return;
    const s = this.yStates.get(id);
    if (!s) return;
    this.ydoc.transact(() => {
      s.set('x', x);
      s.set('y', y);
    }, LOCAL_ORIGIN);
  }

  deleteSelected(): void {
    if (!this.ydoc || !this.yStates || !this.yTransitions || !this.yMeta) return;
    const sel = this.selection();
    if (!sel.stateIds.length && !sel.transitionIds.length) return;
    const yStates = this.yStates;
    const yTransitions = this.yTransitions;
    const yMeta = this.yMeta;
    const stateIds = new Set(sel.stateIds);
    const transIds = new Set(sel.transitionIds);
    this.ydoc.transact(() => {
      const startId = yMeta.get('startId') as string | null;
      if (startId && stateIds.has(startId)) {
        yMeta.set('startId', null);
      }
      for (const id of stateIds) yStates.delete(id);
      const toDelete: string[] = [];
      yTransitions.forEach((t, id) => {
        const from = t.get('fromId') as string;
        const to = t.get('toId') as string;
        if (transIds.has(id) || stateIds.has(from) || stateIds.has(to)) {
          toDelete.push(id);
        }
      });
      for (const id of toDelete) yTransitions.delete(id);
    }, LOCAL_ORIGIN);
    this.clearSelection();
  }

  setStateLabel(id: StateId, label: string): void {
    if (!this.ydoc || !this.yStates) return;
    const s = this.yStates.get(id);
    if (!s) return;
    this.ydoc.transact(() => s.set('label', label), LOCAL_ORIGIN);
  }

  setStart(id: StateId): void {
    if (!this.ydoc || !this.yStates || !this.yMeta) return;
    if (!this.yStates.has(id)) return;
    const yMeta = this.yMeta;
    this.ydoc.transact(() => yMeta.set('startId', id), LOCAL_ORIGIN);
  }

  toggleAccept(id: StateId): void {
    if (!this.ydoc || !this.yStates) return;
    const s = this.yStates.get(id);
    if (!s) return;
    const next = !Boolean(s.get('isAccept'));
    this.ydoc.transact(() => s.set('isAccept', next), LOCAL_ORIGIN);
  }

  beginTransition(fromId: StateId): void {
    this.transitionDraft.set({ fromId });
  }

  cancelTransition(): void {
    this.transitionDraft.set(null);
  }

  completeTransition(toId: StateId, symbols: string[] = ['a']): AutomatonTransition | null {
    if (!this.ydoc || !this.yTransitions) return null;
    const draft = this.transitionDraft();
    if (!draft) return null;
    const cleaned = symbols.length ? symbols : ['a'];
    const yTransitions = this.yTransitions;

    let existingId: string | null = null;
    yTransitions.forEach((t, tid) => {
      if (t.get('fromId') === draft.fromId && t.get('toId') === toId) existingId = tid;
    });

    let result: AutomatonTransition | null = null;
    this.ydoc.transact(() => {
      if (existingId) {
        const t = yTransitions.get(existingId)!;
        const symArr = t.get('symbols') as Y.Array<string>;
        const currentSet = new Set(symArr.toArray());
        const toAdd = cleaned.filter((s) => !currentSet.has(s));
        if (toAdd.length) symArr.push(toAdd);
        result = {
          id: existingId,
          fromId: draft.fromId,
          toId,
          symbols: symArr.toArray(),
        };
      } else {
        const id = uid('t');
        const t = new Y.Map<unknown>();
        t.set('fromId', draft.fromId);
        t.set('toId', toId);
        const symArr = new Y.Array<string>();
        symArr.push([...cleaned]);
        t.set('symbols', symArr);
        yTransitions.set(id, t);
        result = { id, fromId: draft.fromId, toId, symbols: [...cleaned] };
      }
    }, LOCAL_ORIGIN);
    this.transitionDraft.set(null);
    return result;
  }

  setTransitionSymbols(id: TransitionId, symbols: string[]): void {
    if (!this.ydoc || !this.yTransitions) return;
    const t = this.yTransitions.get(id);
    if (!t) return;
    const yTransitions = this.yTransitions;
    const cleaned = unique(symbols.filter((s) => s.length > 0));
    this.ydoc.transact(() => {
      if (cleaned.length === 0) {
        yTransitions.delete(id);
        return;
      }
      const symArr = t.get('symbols') as Y.Array<string>;
      symArr.delete(0, symArr.length);
      symArr.push(cleaned);
    }, LOCAL_ORIGIN);
    if (cleaned.length === 0) {
      this.selection.update((cur) => ({
        stateIds: cur.stateIds,
        transitionIds: cur.transitionIds.filter((x) => x !== id),
      }));
    }
  }

  loadAutomaton(a: Automaton, _replaceHistory = false): void {
    if (!this.ydoc || !this.yStates || !this.yTransitions || !this.yMeta) return;
    const yStates = this.yStates;
    const yTransitions = this.yTransitions;
    const yMeta = this.yMeta;
    this.ydoc.transact(() => {
      yStates.clear();
      yTransitions.clear();
      let startId: string | null = null;
      for (const s of a.states) {
        const y = new Y.Map<unknown>();
        y.set('label', s.label);
        y.set('x', s.x);
        y.set('y', s.y);
        y.set('isAccept', s.isAccept);
        yStates.set(s.id, y);
        if (s.isStart) startId = s.id;
      }
      yMeta.set('startId', startId);
      for (const t of a.transitions) {
        const y = new Y.Map<unknown>();
        y.set('fromId', t.fromId);
        y.set('toId', t.toId);
        const arr = new Y.Array<string>();
        arr.push([...t.symbols]);
        y.set('symbols', arr);
        yTransitions.set(t.id, y);
      }
    }, LOCAL_ORIGIN);
    this.clearSelection();
    this.activeStates.set(new Set());
  }

  clear(): void {
    if (!this.ydoc || !this.yStates || !this.yTransitions || !this.yMeta) return;
    const yStates = this.yStates;
    const yTransitions = this.yTransitions;
    const yMeta = this.yMeta;
    this.ydoc.transact(() => {
      yStates.clear();
      yTransitions.clear();
      yMeta.set('startId', null);
    }, LOCAL_ORIGIN);
    this.clearSelection();
    this.activeStates.set(new Set());
    this.simulationInput.set('');
  }

  tidyLayout(): void {
    if (!this.ydoc || !this.yStates) return;
    if (this.yStates.size === 0) return;
    const yStates = this.yStates;
    const laid = autoLayout(this.automaton());
    this.ydoc.transact(() => {
      for (const s of laid.states) {
        const entry = yStates.get(s.id);
        if (entry) {
          entry.set('x', s.x);
          entry.set('y', s.y);
        }
      }
    }, LOCAL_ORIGIN);
  }

  setActiveStates(ids: Iterable<StateId>): void {
    this.activeStates.set(new Set(ids));
  }

  clearActiveStates(): void {
    this.activeStates.set(new Set());
  }

  setWorkspaceName(name: string): void {
    if (!this.yWorkspaceName) return;
    const trimmed = name.trim() || 'Untitled';
    replaceText(this.yWorkspaceName, trimmed);
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

  undo(): void {
    this.undoManager?.undo();
  }

  redo(): void {
    this.undoManager?.redo();
  }

  canUndo(): boolean {
    return this.undoAvailable();
  }

  canRedo(): boolean {
    return this.redoAvailable();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export { EPSILON };
