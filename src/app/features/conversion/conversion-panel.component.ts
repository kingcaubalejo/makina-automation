import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { EditorStore } from '../../core/services/editor-store';
import { ConversionResult, nfaToDfa } from '../../core/algorithms/subset-construction';
import { minimizeDfa, MinimizationResult } from '../../core/algorithms/minimize';
import { automatonToRegex } from '../../core/algorithms/dfa-to-regex';

@Component({
  selector: 'app-conversion-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <section>
        <h3>NFA → DFA</h3>
        <p class="desc">
          Builds a deterministic equivalent using subset construction with ε-closure.
          Each row of the table is a DFA state and the NFA states it represents.
        </p>
        <div class="actions">
          <button class="primary" (click)="convert()" [disabled]="!canConvert()">
            Convert to DFA
          </button>
          @if (conversion()) {
            <button class="secondary" (click)="loadIntoEditor()">Load on canvas</button>
          }
        </div>
      </section>

      @if (conversion(); as c) {
        <section>
          <h3>Subset table</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  @for (sym of c.alphabet; track sym) {
                    <th>{{ sym }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of c.table; track row.id) {
                  <tr>
                    <td>
                      <div class="state-cell">
                        <span class="lab">{{ row.label }}</span>
                        <span class="badges">
                          @if (row.isStart) { <span class="badge start">start</span> }
                          @if (row.isAccept) { <span class="badge accept">accept</span> }
                        </span>
                      </div>
                    </td>
                    @for (sym of c.alphabet; track sym) {
                      <td>{{ destinationLabel(c, row.transitions[sym]) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section>
        <h3>Minimize DFA (Hopcroft)</h3>
        <p class="desc">
          Reduce a DFA to the equivalent minimum-state DFA. The current automaton
          must already be deterministic.
        </p>
        <div class="actions">
          <button class="primary" (click)="minimize()" [disabled]="!isDfa()">
            Minimize current DFA
          </button>
          @if (minimization()) {
            <button class="secondary" (click)="loadMinimized()">Load on canvas</button>
          }
        </div>
        @if (!isDfa()) {
          <p class="warning">Current automaton isn't a DFA. Convert it first.</p>
        }
      </section>

      @if (minimization(); as m) {
        <section>
          <h3>Equivalence classes</h3>
          <ul class="part-list">
            @for (p of m.partitions; track p.label) {
              <li>
                <span class="lab">{{ p.label }}</span>
                <span class="members">{{ p.members.join(', ') }}</span>
              </li>
            }
          </ul>
        </section>
      }

      <section>
        <h3>Automaton → Regex</h3>
        <p class="desc">
          Extract a regular expression from the current automaton via the
          state-elimination algorithm.
        </p>
        <div class="actions">
          <button class="primary" (click)="extractRegex()" [disabled]="!canConvert()">
            Extract regex
          </button>
          @if (regex()) {
            <button class="secondary" (click)="copyRegex()">Copy</button>
          }
        </div>
        @if (regex(); as re) {
          <div class="regex-out" [class.copied]="copied()">
            <code>{{ re }}</code>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .panel { padding: 16px; display: flex; flex-direction: column; gap: 22px; }
      section { display: flex; flex-direction: column; gap: 10px; }
      h3 {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--margin-red);
        margin: 0;
      }
      .desc { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0; }
      .warning {
        font-size: 12px;
        color: var(--warning);
        margin: 0;
      }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .primary {
        height: 34px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
      }
      .primary:hover { filter: brightness(1.05); }
      .primary:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }
      .secondary {
        height: 34px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-size: 12px;
        font-weight: 500;
      }
      .secondary:hover { border-color: var(--accent); color: var(--accent); }

      .table-wrap {
        border: 1px solid var(--border);
        border-radius: 10px;
        overflow: auto;
        background: var(--surface-2);
        max-height: 280px;
      }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td {
        padding: 8px 10px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
      }
      th {
        position: sticky;
        top: 0;
        background: var(--surface);
        font-weight: 600;
        color: var(--text-muted);
      }
      tr:last-child td { border-bottom: none; }
      .state-cell { display: flex; align-items: center; gap: 6px; }
      .lab { font-weight: 600; }
      .badges { display: inline-flex; gap: 4px; }
      .badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        font-weight: 600;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text-muted);
      }
      .badge.start { color: var(--accent); border-color: var(--accent); }
      .badge.accept { color: var(--success); border-color: var(--success); }

      .part-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
      .part-list li {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        display: flex;
        gap: 8px;
        align-items: baseline;
      }
      .part-list .members { color: var(--text-muted); }

      .regex-out {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 13px;
        color: var(--text);
        word-break: break-all;
        transition: border-color 200ms;
      }
      .regex-out.copied { border-color: var(--success); }
    `,
  ],
})
export class ConversionPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly conversion = signal<ConversionResult | null>(null);
  protected readonly minimization = signal<MinimizationResult | null>(null);
  protected readonly regex = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly canConvert = computed(() => this.store.validation().hasStart);
  protected readonly isDfa = computed(() => this.store.validation().isDfa && this.store.states().length > 0);

  protected convert(): void {
    const result = nfaToDfa(this.store.automaton());
    this.conversion.set(result);
    this.minimization.set(null);
  }

  protected loadIntoEditor(): void {
    const c = this.conversion();
    if (!c) return;
    this.store.loadAutomaton(c.dfa, true);
    this.store.resetViewport();
  }

  protected minimize(): void {
    const result = minimizeDfa(this.store.automaton());
    this.minimization.set(result);
    this.conversion.set(null);
  }

  protected loadMinimized(): void {
    const m = this.minimization();
    if (!m) return;
    this.store.loadAutomaton(m.dfa, true);
    this.store.resetViewport();
  }

  protected destinationLabel(c: ConversionResult, id: string | undefined): string {
    if (!id) return '—';
    return c.table.find((r) => r.id === id)?.label ?? '—';
  }

  protected extractRegex(): void {
    const re = automatonToRegex(this.store.automaton());
    this.regex.set(re);
  }

  protected async copyRegex(): Promise<void> {
    const re = this.regex();
    if (!re) return;
    try {
      await navigator.clipboard.writeText(re);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1200);
    } catch {
      // ignore
    }
  }
}
