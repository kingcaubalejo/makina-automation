import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorStore } from '../../core/services/editor-store';
import { AuthService, FREE_SIMULATIONS } from '../../core/services/auth.service';
import { SimulationResult, simulate } from '../../core/algorithms/simulate';

@Component({
  selector: 'app-simulation-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <section>
        <h3>Input string</h3>
        <input
          class="input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          [ngModel]="store.simulationInput()"
          (ngModelChange)="setInput($event)"
          placeholder="e.g. abba"
        />
        <div class="ribbon">
          @for (ch of chars(); track $index) {
            <span
              class="cell"
              [class.consumed]="$index < cursor()"
              [class.current]="$index === cursor()"
            >{{ ch }}</span>
          }
          @if (chars().length === 0) {
            <span class="cell empty">empty</span>
          }
        </div>
      </section>

      <section>
        <h3>Controls</h3>
        <div class="controls">
          <button class="btn" (click)="reset()" [disabled]="!hasStart()">Reset</button>
          <button class="btn" (click)="step()" [disabled]="!canStep()">
            Step
          </button>
          <button class="btn primary" (click)="toggleRun()" [disabled]="!canRun()">
            {{ running() ? 'Pause' : 'Run' }}
          </button>
        </div>
        @if (!auth.isAuthenticated()) {
          <aside
            class="callout"
            [class.locked]="auth.remainingSimulations() === 0"
            role="note"
          >
            <span class="callout-icon" aria-hidden="true">
              @if (auth.remainingSimulations() > 0) {
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
              } @else {
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M6 10V8a6 6 0 1112 0v2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <rect
                    x="4.5"
                    y="10"
                    width="15"
                    height="10.5"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                  />
                </svg>
              }
            </span>
            <div class="callout-body">
              @if (auth.remainingSimulations() > 0) {
                <div class="callout-head">
                  <span class="callout-title">Free trial</span>
                  <span class="pips" aria-hidden="true">
                    @for (i of pips; track i) {
                      <span class="pip" [class.used]="i >= auth.remainingSimulations()"></span>
                    }
                  </span>
                </div>
                <p class="callout-text">
                  {{ auth.remainingSimulations() }} of {{ freeSimulations }} runs left.
                  <button class="link" type="button" (click)="auth.openModal()">Sign in</button>
                  for unlimited simulations.
                </p>
              } @else {
                <div class="callout-head">
                  <span class="callout-title">Trial ended</span>
                </div>
                <p class="callout-text">
                  You've used all {{ freeSimulations }} free runs.
                  <button class="link" type="button" (click)="auth.openModal()">Sign in or create an account</button>
                  to keep simulating.
                </p>
              }
            </div>
          </aside>
        }
      </section>

      @if (started() && result(); as r) {
        <section>
          <h3>Trace</h3>
          <div class="trace">
            @for (s of r.steps; track s.index) {
              <div class="step" [class.active]="s.index === cursor()">
                <span class="idx">{{ s.index }}</span>
                <span class="consumed">"{{ s.consumed || 'ε' }}"</span>
                <span class="active-set">{{ activeLabels(s.active) }}</span>
              </div>
            }
            @if (r.rejectedAt !== undefined && cursor() >= r.rejectedAt) {
              <div class="step rejected">
                <span class="idx">·</span>
                <span class="consumed">stuck</span>
                <span class="active-set">no transition on "{{ chars()[r.rejectedAt - 1] }}"</span>
              </div>
            }
          </div>
        </section>

        <section>
          <h3>Result</h3>
          <div class="verdict" [class.accept]="r.accepted && atEnd()" [class.reject]="!r.accepted && atEnd()">
            <span class="dot"></span>
            <strong>{{ verdictLabel() }}</strong>
            <span class="muted">@ position {{ cursor() }} / {{ chars().length }}</span>
          </div>
        </section>
      } @else if (!result()) {
        <section class="empty">
          <p>
            Define a start state and accept state, then enter input above to simulate
            the run. Active states are highlighted on the canvas as you step.
          </p>
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
      .input {
        width: 100%;
        height: 38px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        padding: 0 12px;
        font-size: 16px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        outline: none;
      }
      .input:focus { border-color: var(--accent); background: var(--surface); }

      .ribbon {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .cell {
        min-width: 28px;
        height: 32px;
        border-radius: 6px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 13px;
        color: var(--text-muted);
        padding: 0 6px;
      }
      .cell.consumed { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
      .cell.current {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
        font-weight: 600;
      }
      .cell.empty { font-style: italic; }

      .controls { display: flex; gap: 6px; }
      .btn {
        flex: 1;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-size: 12px;
        font-weight: 500;
      }
      .btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn.primary {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      .btn.primary:hover:not(:disabled) { color: #fff; filter: brightness(1.05); }

      .trace {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        max-height: 220px;
        overflow-y: auto;
      }
      .step {
        display: grid;
        grid-template-columns: 30px 80px 1fr;
        gap: 8px;
        align-items: center;
        padding: 6px 10px;
        font-size: 12px;
        border-bottom: 1px solid var(--border);
      }
      .step:last-child { border-bottom: none; }
      .step.active { background: var(--accent-soft); color: var(--accent); }
      .step.rejected { color: var(--danger); }
      .step .idx { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: var(--text-muted); }
      .step .consumed { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
      .step .active-set { color: var(--text-muted); }
      .step.active .active-set { color: var(--accent); }

      .verdict {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        font-size: 13px;
      }
      .verdict.accept { border-color: var(--success); background: color-mix(in srgb, var(--success) 8%, var(--surface-2)); }
      .verdict.reject { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--surface-2)); }
      .verdict .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--text-muted);
      }
      .verdict.accept .dot { background: var(--success); }
      .verdict.reject .dot { background: var(--danger); }
      .verdict .muted { color: var(--text-muted); margin-left: auto; font-size: 12px; }

      .empty p { font-size: 13px; color: var(--text-muted); line-height: 1.45; margin: 0; }

      .callout {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
        color: var(--text);
      }
      .callout.locked {
        background: color-mix(in srgb, var(--danger) 10%, var(--surface-2));
        border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
      }
      .callout-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--accent);
        flex-shrink: 0;
        margin-top: 1px;
      }
      .callout.locked .callout-icon {
        color: var(--danger);
        border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
      }
      .callout-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }
      .callout-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .callout-title {
        font-family: var(--serif);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.005em;
        color: var(--text);
      }
      .callout.locked .callout-title { color: var(--danger); }
      .callout-text {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-muted);
      }
      .pips {
        display: inline-flex;
        gap: 4px;
      }
      .pip {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--accent);
        border: 1px solid var(--accent);
      }
      .pip.used {
        background: transparent;
        border-color: color-mix(in srgb, var(--text-muted) 55%, transparent);
      }
      .link {
        background: none;
        border: none;
        padding: 0;
        color: var(--accent);
        font: inherit;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        text-decoration-thickness: 1px;
      }
      .callout.locked .link { color: var(--danger); }
      .link:hover { filter: brightness(1.15); }
    `,
  ],
})
export class SimulationPanelComponent implements OnDestroy {
  protected readonly store = inject(EditorStore);
  protected readonly auth = inject(AuthService);
  protected readonly freeSimulations = FREE_SIMULATIONS;
  protected readonly pips = Array.from({ length: FREE_SIMULATIONS }, (_, i) => i);

  protected readonly cursor = signal(0);
  protected readonly running = signal(false);
  protected readonly started = signal(false);

  protected readonly chars = computed(() => [...this.store.simulationInput()]);
  protected readonly hasStart = computed(() => this.store.validation().hasStart);

  protected readonly result = computed<SimulationResult | null>(() => {
    if (!this.store.validation().hasStart) return null;
    return simulate(this.store.automaton(), this.store.simulationInput());
  });

  protected readonly atEnd = computed(() => {
    const r = this.result();
    if (!r) return false;
    return this.cursor() >= r.steps.length - 1;
  });

  protected readonly canStep = computed(() => {
    const r = this.result();
    if (!r) return false;
    return this.cursor() < r.steps.length - 1;
  });

  protected readonly canRun = computed(() => this.result() !== null);

  protected readonly verdictLabel = computed(() => {
    const r = this.result();
    if (!r) return '';
    if (this.atEnd()) return r.accepted ? 'Accepted' : 'Rejected';
    if (this.running()) return 'Running…';
    return 'Paused';
  });

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const r = this.result();
      const idx = this.cursor();
      const started = this.started();
      if (!r || !started) {
        this.store.clearActiveStates();
        return;
      }
      const stepIndex = Math.min(idx, r.steps.length - 1);
      const step = r.steps[stepIndex];
      this.store.setActiveStates(step?.active ?? []);
    });

    effect(() => {
      this.store.simulationInput();
      this.store.automaton();
      untracked(() => {
        const r = this.result();
        const cur = this.cursor();
        if (r && cur > r.steps.length - 1) this.cursor.set(0);
        if (this.running()) {
          this.running.set(false);
          this.clearTimer();
        }
        this.started.set(false);
      });
    });
  }

  protected setInput(value: string): void {
    this.store.simulationInput.set(value);
    this.cursor.set(0);
    this.running.set(false);
    this.started.set(false);
    this.clearTimer();
  }

  protected reset(): void {
    this.cursor.set(0);
    this.running.set(false);
    this.started.set(false);
    this.clearTimer();
  }

  protected step(): void {
    const r = this.result();
    if (!r) return;
    this.started.set(true);
    const next = Math.min(this.cursor() + 1, r.steps.length - 1);
    this.cursor.set(next);
    if (next >= r.steps.length - 1) {
      this.running.set(false);
      this.clearTimer();
    }
  }

  protected toggleRun(): void {
    if (this.running()) {
      this.running.set(false);
      this.clearTimer();
      return;
    }
    if (!this.canRun()) return;
    if (!this.auth.tryConsumeSimulation()) return;
    if (this.atEnd()) this.cursor.set(0);
    this.started.set(true);
    this.running.set(true);
    this.timer = setInterval(() => {
      if (!this.canStep()) {
        this.running.set(false);
        this.clearTimer();
        return;
      }
      this.step();
    }, 600);
  }

  protected activeLabels(ids: string[]): string {
    if (ids.length === 0) return '∅';
    const map = new Map(this.store.states().map((s) => [s.id, s.label]));
    return ids.map((id) => map.get(id) ?? id).sort().join(', ');
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.store.clearActiveStates();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
