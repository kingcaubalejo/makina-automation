# User guide

Everything you need to drive Makina without reading the source.

## The canvas

An infinite SVG canvas with a faint paper grid. The toolbar across the top picks a **tool**; the inspector panel on the right shows context for the current selection.

### Tools

| Tool       | Key | What clicking does                                                                                                          |
| ---------- | --- | --------------------------------------------------------------------------------------------------------------------------- |
| Select     | `V` | Click to select; drag-empty to marquee-select; drag-state to move.                                                          |
| State      | `S` | Click empty space to create a new state. First state becomes the start state.                                               |
| Transition | `T` | Click source state, then click destination state. A prompt asks for symbols (e.g. `a, b`).                                  |
| Pan        | `H` | Drag the canvas to pan. Holding the **Space bar** does the same thing temporarily from any tool.                            |
| Erase      | `E` | Click a state or transition to delete it.                                                                                   |

### Mouse

- **Double-click** empty area → create a state (no matter the active tool).
- **Double-click** a state → rename it.
- **Right-click** a state → context menu (mark start, toggle accept, rename, delete).
- **Mouse wheel** → zoom around the cursor.
- **Shift+click** → add to selection.

### HUD (bottom-right)

- Tidy layout — runs an automatic graph layout on the current automaton.
- Delete all — wipes the canvas (undoable).
- Zoom in / zoom out / reset view.

## Keyboard shortcuts

### Tools

| Key | Tool       |
| --- | ---------- |
| `V` | Select     |
| `S` | State      |
| `T` | Transition |
| `H` | Pan        |
| `E` | Erase      |

### State actions (with selection)

| Key | Action                                |
| --- | ------------------------------------- |
| `G` | Mark selected state as **start**      |
| `F` | Toggle **accept** on selected state   |
| `Delete` / `Backspace` | Delete selection           |

### General

| Key                    | Action                                  |
| ---------------------- | --------------------------------------- |
| `⌘/Ctrl + Z`           | Undo                                    |
| `⌘/Ctrl + Shift + Z`   | Redo                                    |
| `⌘/Ctrl + Y`           | Redo (alternate)                        |
| `⌘/Ctrl + A`           | Select all                              |
| `Esc`                  | Cancel transition draft, clear selection |
| `Space` (hold)         | Temporarily switch to pan               |

Shortcuts are suppressed while typing into a text input.

## States

- The **start state** is drawn with an inbound arrow on its left.
- An **accept state** has a second inner ring (the classic double-circle).
- A new automaton's first state is automatically the start state.
- A state's label can be any string; it shows centered inside the circle.

## Transitions

- Drawn as arrows between states. Symbols sit in a pill on the arrow.
- **Epsilon (ε) transitions**: in the symbol prompt, type any of `ε`, `eps`, or `epsilon` — they're all normalized to ε.
- Multiple symbols on one transition: comma-separated (`a, b, c`). Use the inspector to edit them later.
- Drawing a transition between two states that already have one **merges** the new symbols into the existing transition instead of creating a duplicate arrow.

## Inspector tabs

- **Inspect** — properties of the currently selected state or transition. Rename a state, toggle start/accept, edit transition symbols.
- **Simulate** — feed an input string and step through the automaton state-by-state. Active states light up on the canvas.
- **Convert** *(coming soon)* — NFA → DFA via subset construction, DFA minimization (Hopcroft), DFA → regex.
- **Regex** *(coming soon)* — build an NFA from a regex via Thompson's construction.
- **Tests** *(coming soon)* — persistent test-case suite with pass/fail badges, plus example-string generation.
- **Library** *(coming soon)* — pre-built sample automata.

### Status line (bottom of inspector)

Shows the validation verdict for the current diagram:

- "**DFA** — alphabet: a, b" → valid and deterministic
- "**NFA** — alphabet: …" → valid but non-deterministic (ε transitions, missing transitions, or duplicates)
- Errors (e.g. "No start state defined") in red

## Workspaces

Each browser tab is a **workspace**. The workspace ID lives in the URL hash:

```
https://makina.thelawrence.site/#w=abc123
```

- The toolbar shows the workspace **name** — editable inline. Sets the browser tab title too.
- **Open in new window** (toolbar button next to undo/redo) creates a fresh workspace with a new ID.
- Each workspace has its own autosave in localStorage. Sharing a URL with the same hash lets another user on the same browser open the same workspace — there is no cross-device sync.

## Theme

- Top-right sun/moon toggle.
- First load follows your OS preference (via `prefers-color-scheme`).
- After that, the choice is sticky per browser (`localStorage`).

## Saving and loading

- **Autosave**: every change is persisted to `localStorage` ~250ms after you stop interacting. Closing the tab flushes immediately.
- There's no file import/export UI yet, but the underlying functions (`exportJson` / `importJson` on the store) are wired and validated.

## Regex syntax (when the Regex tab is unlocked)

| Form          | Meaning                                  |
| ------------- | ---------------------------------------- |
| `ab`          | Concatenation                            |
| `a\|b`        | Alternation                              |
| `a*`          | Zero or more                             |
| `a+`          | One or more                              |
| `a?`          | Optional                                 |
| `(ab\|c)*`    | Grouping with repetition                 |
| `\\*`         | Escape: a literal `*`                    |

Input is capped at 200 characters to prevent pathological parser input.
