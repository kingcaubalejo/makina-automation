import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorStore } from '../../../core/services/editor-store';
import { EPSILON } from '../../../core/models/automaton';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      @if (selectedStates().length > 0) {
        <section>
          <h3>State</h3>
          @for (s of selectedStates(); track s.id) {
            <div class="card">
              <div class="row">
                <label>Label</label>
                <input
                  type="text"
                  [ngModel]="s.label"
                  (ngModelChange)="store.setStateLabel(s.id, $event)"
                />
              </div>
              <div class="row toggles">
                <button
                  class="chip"
                  [class.on]="s.isStart"
                  (click)="store.setStart(s.id)"
                  [disabled]="s.isStart"
                  title="Make this the start state (G)"
                >▶ Start state</button>
                <button
                  class="chip accept"
                  [class.on]="s.isAccept"
                  (click)="store.toggleAccept(s.id)"
                  title="Toggle final / accept state (F)"
                >◎ Final state</button>
              </div>
              <div class="row meta">
                <span>x: {{ s.x | number:'1.0-0' }}</span>
                <span>y: {{ s.y | number:'1.0-0' }}</span>
              </div>
            </div>
          }
        </section>
      }

      @if (selectedTransitions().length > 0) {
        <section>
          <h3>Transition</h3>
          @for (t of selectedTransitions(); track t.id) {
            <div class="card">
              <div class="row meta">
                <span>{{ labelFor(t.fromId) }} → {{ labelFor(t.toId) }}</span>
              </div>
              <div class="row">
                <label>Symbols</label>
                <input
                  type="text"
                  [ngModel]="t.symbols.join(', ')"
                  (ngModelChange)="updateSymbols(t.id, $event)"
                  placeholder="e.g. a, b, ε"
                />
              </div>
              <div class="hint">
                Comma-separated. Type <code>ε</code>, <code>eps</code>, or <code>epsilon</code>
                for an epsilon transition.
              </div>
            </div>
          }
        </section>
      }

      @if (selectedStates().length === 0 && selectedTransitions().length === 0) {
        <section class="empty">
          <h3>Nothing selected</h3>
          <p>
            Click on a state or transition to inspect or edit it. Drag with the
            <strong>Select</strong> tool to move states around the canvas.
          </p>
          <ul class="kbd-list">
            <li><kbd>V</kbd> Select</li>
            <li><kbd>S</kbd> Add state</li>
            <li><kbd>T</kbd> Add transition</li>
            <li><kbd>H</kbd> Pan</li>
            <li><kbd>E</kbd> Erase</li>
            <li><kbd>G</kbd> Mark start</li>
            <li><kbd>F</kbd> Mark final</li>
            <li><kbd>⌫</kbd> Delete</li>
            <li><kbd>⌘ Z</kbd> Undo</li>
            <li><kbd>⌘ ⇧ Z</kbd> Redo</li>
          </ul>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .panel { padding: 16px; display: flex; flex-direction: column; gap: 18px; }
      section { display: flex; flex-direction: column; gap: 8px; }
      h3 {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--margin-red);
        margin: 0;
      }
      .card {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .row.meta { font-size: 12px; color: var(--text-muted); justify-content: space-between; }
      .row label {
        font-size: 12px;
        color: var(--text-muted);
        min-width: 60px;
      }
      input[type="text"] {
        flex: 1;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        padding: 0 10px;
        font-size: 13px;
        outline: none;
        transition: border-color 120ms;
      }
      input[type="text"]:focus { border-color: var(--accent); }
      .toggles { gap: 6px; }
      .chip {
        height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 500;
      }
      .chip:hover { color: var(--text); }
      .chip.on {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }
      .chip.accept.on {
        box-shadow: inset 0 0 0 2px var(--surface), 0 0 0 1px var(--accent);
      }
      .hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
      .hint code {
        background: var(--surface);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 11px;
      }
      .empty p { font-size: 13px; color: var(--text-muted); line-height: 1.45; margin: 4px 0 12px; }
      .kbd-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
      }
      .kbd-list li {
        font-size: 12px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      kbd {
        display: inline-block;
        min-width: 22px;
        text-align: center;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 5px;
        padding: 1px 6px;
        font-size: 11px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
      }
    `,
  ],
})
export class PropertiesPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly selectedStates = computed(() => this.store.selectedStates());
  protected readonly selectedTransitions = computed(() => this.store.selectedTransitions());

  protected labelFor(id: string): string {
    return this.store.states().find((s) => s.id === id)?.label ?? '?';
  }

  protected updateSymbols(id: string, value: string): void {
    const symbols = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => (s === 'eps' || s === 'epsilon' || s === 'ε' ? EPSILON : s));
    this.store.setTransitionSymbols(id, symbols);
  }
}
