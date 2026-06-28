# Architecture

A map of the codebase for anyone making changes. Conventions, the state model, and the bits that aren't obvious from skimming.

## Stack & idioms

- **Angular 21**, standalone components only, no NgModules.
- **Signals** for state (no RxJS for UI state; RxJS is a transitive dep only).
- `ChangeDetectionStrategy.OnPush` everywhere.
- **SCSS + Tailwind v4** for styles. Component-scoped styles live inline in `styles:` arrays; global tokens are in `src/styles.scss`.
- **Vitest** for unit tests. Algorithm modules are exhaustively tested; component tests are minimal by design (the canvas is integration-level).

## Folder layout

```
src/
├── main.ts                          Bootstrap (calls bootstrapApplication)
├── index.html                       Loads theme-init.js, contains the loader, CSP meta tag
├── styles.scss                      Paper/ink palette, dark theme overrides
└── app/
    ├── app.ts / app.html / app.scss Root component
    ├── app.config.ts                Global providers (error listeners only)
    ├── app.routes.ts                Empty — single-page SPA
    │
    ├── core/
    │   ├── models/automaton.ts      Domain types + validate() + uid()
    │   ├── services/editor-store.ts Central signal-based store (the brain)
    │   ├── algorithms/              Pure functions, no Angular imports
    │   │   ├── simulate.ts
    │   │   ├── epsilon-closure.ts
    │   │   ├── subset-construction.ts
    │   │   ├── minimize.ts          (Hopcroft)
    │   │   ├── regex-to-nfa.ts      (Thompson)
    │   │   ├── dfa-to-regex.ts      (state elimination)
    │   │   ├── auto-layout.ts       Layered BFS layout
    │   │   ├── generate-strings.ts
    │   │   └── algorithms.spec.ts   Vitest suite
    │   └── samples.ts               Pre-built example automata
    │
    ├── features/
    │   ├── editor/
    │   │   ├── toolbar/             Tools, workspace name, theme, undo/redo
    │   │   ├── canvas/              SVG canvas, drag/drop, marquee, context menu
    │   │   └── inspector/
    │   │       ├── inspector.component.ts        Tab container (incl. lock flag)
    │   │       ├── properties-panel.component.ts
    │   │       └── library-panel.component.ts
    │   ├── simulation/              Step-by-step trace
    │   ├── conversion/              NFA→DFA, minimize, DFA→regex
    │   ├── regex/                   Regex → NFA builder
    │   └── tests/                   Test-case manager with localStorage
    │
    └── shared/
        └── modal/                   ModalService + ModalHostComponent
```

Algorithms have **zero Angular imports** — they're pure functions that take an `Automaton` and return a value. This lets them be unit-tested without DOM/zone overhead and reused outside the app if needed.

## State model

### The store

[`EditorStore`](../src/app/core/services/editor-store.ts) (`providedIn: 'root'`) is the single source of truth. It holds:

```ts
readonly states       = signal<AutomatonState[]>([]);
readonly transitions  = signal<AutomatonTransition[]>([]);
readonly tool         = signal<Tool>('select');
readonly selection    = signal<Selection>(...);
readonly viewport     = signal<Viewport>({ x: 0, y: 0, scale: 1 });
readonly activeStates = signal<Set<StateId>>(new Set());     // simulation highlight
readonly theme        = signal<'light' | 'dark'>(...);
readonly workspaceId  = signal<string>(...);                 // from URL hash
readonly workspaceName = signal<string>('Untitled');
```

Components inject the store and read signals (`store.states()`) or write via methods (`store.addState(x, y)`, `store.deleteSelected()`, etc.). **Components never mutate the arrays directly** — every mutation goes through the store so undo/redo and validation stay correct.

### Computed signals

```ts
automaton = computed(() => ({ states: states(), transitions: transitions() }));
alphabet  = computed(() => alphabetOf(automaton()));
validation = computed(() => validate(automaton()));
```

Anything derived from primary state is a `computed`. Subscribers re-evaluate only when inputs change.

### Undo / redo

`snapshot()` is called **before** any mutating method does work. It pushes a `Snapshot` (states + transitions) to `undoStack`, clears `redoStack`, and trims to 100 entries. Undo pops `undoStack` and pushes the current state to `redoStack`. Selection is cleared on undo/redo to avoid stale references.

Viewport, theme, and selection are **not** undoable — by design; they're presentation state.

### Persistence

Three things are persisted to `localStorage`, all debounced **250ms** after the last change:

| Key                          | Contents                                 |
| ---------------------------- | ---------------------------------------- |
| `makina:document:<workspaceId>` | The automaton (states + transitions)  |
| `makina:name:<workspaceId>`     | Workspace name                        |
| `makina:tests:<workspaceId>`    | TestsPanel test cases (per-component) |
| `makina:theme`                  | Global theme choice (not per-workspace) |

The debounce is implemented as `setTimeout(flush, 250)` reset on every effect run. Flush happens immediately on `beforeunload` and `visibilitychange → hidden` so closing the tab doesn't lose data. See `flushDoc()` / `flushName()` in editor-store.

**Legacy migration**: keys `automata-studio:document` and `automata-studio:tests` are migrated to the new namespace on first load.

### Workspace IDs

Read once on store construction from `window.location.hash` via the regex `/w=([a-zA-Z0-9_-]+)/`. Default is `'default'`. `openNewWindow()` mints a fresh random ID and opens a new tab with `noopener`.

## Data model

```ts
interface Automaton {
  states: AutomatonState[];
  transitions: AutomatonTransition[];
}

interface AutomatonState {
  id: StateId;        // 'sX_…', uid()
  label: string;
  x: number; y: number;
  isStart: boolean;
  isAccept: boolean;
}

interface AutomatonTransition {
  id: TransitionId;   // 'tX_…'
  fromId: StateId;
  toId: StateId;
  symbols: string[];  // EPSILON ('ε') for ε-transitions
}

export const EPSILON = 'ε';
```

IDs come from `uid(prefix)` in [`automaton.ts`](../src/app/core/models/automaton.ts) — `Math.random()` base36 slice. They're local-only; not used as auth or shared identifiers, so cryptographic randomness isn't required.

## Algorithms

Each algorithm module is a few exported pure functions. Pulled in only where needed (tree-shakeable).

| Module                  | Exports                                      | Purpose                                      |
| ----------------------- | -------------------------------------------- | -------------------------------------------- |
| `simulate.ts`           | `simulate`, `move`                           | Step or run-to-completion over an input      |
| `epsilon-closure.ts`    | `epsilonClosure`                             | Set of states reachable by ε-transitions     |
| `subset-construction.ts`| `nfaToDfa`                                   | Classic NFA → DFA                            |
| `minimize.ts`           | `minimizeDfa`                                | Hopcroft's algorithm                         |
| `regex-to-nfa.ts`       | `regexToNfa`                                 | Thompson construction (postfix-based)        |
| `dfa-to-regex.ts`       | `automatonToRegex`                           | State-elimination method                     |
| `auto-layout.ts`        | `autoLayout`                                 | Layered BFS layout from start state          |
| `generate-strings.ts`   | `generateAcceptedStrings`                    | BFS over input strings up to a length cap    |

All have Vitest coverage in `algorithms.spec.ts`.

## Component patterns

### Standalone everything

Every component declares its own imports. No shared module. Root composition happens in `app.ts`.

### OnPush + signals = no manual change detection

Because signals are tracked by Angular's reactive system, components flagged `OnPush` re-render automatically when read signals change. **Don't add `markForCheck` calls** — if you find yourself wanting one, you're probably reading mutable state outside a signal.

### Templates

Use the new control-flow syntax (`@if`, `@for`, `@switch`) — not the structural directives. The canvas/inspector are loaded with `@for` over signal-derived arrays.

### Inspector tabs + the "locked" pattern

Tabs are defined in [`inspector.component.ts`](../src/app/features/editor/inspector/inspector.component.ts):

```ts
protected readonly tabs: Array<{ id: Tab; label: string; locked?: boolean }> = [
  { id: 'properties', label: 'Inspect'                 },
  { id: 'simulate',   label: 'Simulate'                },
  { id: 'convert',    label: 'Convert',  locked: true },
  ...
];

protected selectTab(t: { id: Tab; locked?: boolean }): void {
  if (t.locked) return;
  this.active.set(t.id);
}
```

Locked tabs render with an opacity dim, a "soon" pill, `aria-disabled="true"`, and `tabindex="-1"`. Their underlying panel components are still imported (~minor bundle cost, easier to unlock later). To unlock: delete the `locked: true` from the row.

## Modal service

`ModalService` (singleton) exposes `alert()`, `confirm()`, `prompt()` — each returns a promise. `ModalHostComponent` renders the current modal from the service's `state` signal. Includes:

- Focus management (restores prior focus on close).
- Escape-to-dismiss, click-outside-to-dismiss.
- Auto-focus the input (`prompt`) or the autofocus button (`alert` / `confirm`).

Use it instead of `window.alert/confirm/prompt` to keep the UI consistent and modal-host inside the dark theme.

## Bootstrap & the theme problem

The browser paints the page before the JS bundle finishes loading. Without intervention, a dark-mode user gets a flash of light theme.

We fix this in three places:

1. **[public/theme-init.js](../public/theme-init.js)** — runs before the bundle, reads `localStorage` → `prefers-color-scheme` → `light`, sets `data-theme` on `<html>`.
2. **[src/index.html](../src/index.html)** — has inline `<style>` for the `.app-loader`. Lives inside `<app-root>` so Angular replaces it on first render.
3. **[`EditorStore`](../src/app/core/services/editor-store.ts) `readInitialTheme()`** — re-reads the same source-of-truth so the signal starts in the right state. The theme effect both writes `data-theme` and persists to `localStorage`.

Important: `color-scheme` is bound to `data-theme` in [`styles.scss`](../src/styles.scss), not OS preference. Otherwise native form controls (input backgrounds, scrollbars) follow the OS while the app follows the user's chosen theme — leading to white-on-cream text in inputs.

## Security model

This is a client-only app with no auth, no backend, no user data leaving the browser. The threat surface is small but here's what's in place:

- **CSP meta tag** in [`src/index.html`](../src/index.html) restricts script/style/font sources to `self` and Google Fonts. No third-party scripts can execute even if injected.
- **Imported JSON** runs through `parseAutomaton()` in editor-store, which field-validates every state and transition and enforces size limits (5000 states, 10000 transitions, 1MB total).
- **Regex input** is capped at 200 characters in `RegexPanelComponent` to bound parser work.
- **`window.open`** uses `noopener` (workspace new-window).
- **Sanitization**: all user-rendered strings (state labels, symbols, test inputs) go through Angular's `{{ }}` interpolation or attribute bindings — no `[innerHTML]` or `bypassSecurityTrust*` anywhere.

Cloudflare provides the response-layer security headers in production (HSTS, X-Content-Type-Options, etc.) — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Adding a feature

The general recipe:

1. **Data first** — if it needs new state, add signals to `EditorStore` and write the mutator methods (don't forget `snapshot()` for undoable changes).
2. **Algorithm** — if it's a transform on the automaton, write a pure function in `core/algorithms/` and a Vitest spec.
3. **Panel** — add a new feature folder under `features/`, build a standalone component that injects `EditorStore` and uses the algorithm.
4. **Tab** — add an entry to `tabs` in `inspector.component.ts` and a case in the content `@switch`.
5. **Style** — reuse the existing CSS custom properties (`--surface`, `--accent`, `--text`, etc.) so dark theme works out of the box.

## Things that intentionally don't exist

- **No router** — single SPA, no navigation.
- **No HTTP client** — no API calls; nothing leaves the browser.
- **No DI tree beyond `providedIn: 'root'`** — all services are application-singletons.
- **No environment files** — no secrets or API URLs to vary by environment.
- **No SSR** — the app is pure client, with explicit `typeof window !== 'undefined'` guards where it matters.

## Known issues / loose ends

- `ng test` / Vitest config is in a partial state — `app.spec.ts` is Karma-style while `algorithms.spec.ts` is Vitest. Pick one.
- `Math.random()` IDs collide at ~2^20 entries; switch to `crypto.randomUUID()` if collision matters.
- `validate()` warnings are computed but not surfaced prominently in the UI.
- No file import/export UI (the store methods exist, just no buttons yet).
