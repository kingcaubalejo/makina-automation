import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorStore } from '../../core/services/editor-store';
import { simulate } from '../../core/algorithms/simulate';
import { generateAcceptedStrings } from '../../core/algorithms/generate-strings';
import { ModalService } from '../../shared/modal/modal.service';

interface TestCase {
  id: string;
  input: string;
  expected: 'accept' | 'reject';
}

interface TestResult extends TestCase {
  actual: 'accept' | 'reject';
  pass: boolean;
}

const PERSIST_DEBOUNCE_MS = 250;

@Component({
  selector: 'app-tests-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <section>
        <div class="title-row">
          <h3>Test cases</h3>
          <span class="counter">
            <span class="pass">{{ passCount() }}</span> / {{ results().length }}
          </span>
        </div>
        <p class="desc">
          Add input strings with their expected verdict. Hit
          <strong>Run all</strong> to check the current automaton against the suite.
        </p>

        <div class="rows">
          @for (r of results(); track r.id) {
            <div class="row" [class.pass]="r.pass" [class.fail]="!r.pass">
              <span class="dot" [title]="r.pass ? 'pass' : 'fail'"></span>
              <input
                class="input"
                type="text"
                [ngModel]="r.input"
                (ngModelChange)="updateInput(r.id, $event)"
                placeholder="empty string"
              />
              <select
                class="expected"
                [ngModel]="r.expected"
                (ngModelChange)="updateExpected(r.id, $event)"
              >
                <option value="accept">accept</option>
                <option value="reject">reject</option>
              </select>
              <span class="actual">
                {{ hasAutomaton() ? r.actual : '—' }}
              </span>
              <button class="del" (click)="remove(r.id)" title="Remove">×</button>
            </div>
          }
          @if (results().length === 0) {
            <div class="empty-row">No test cases yet — add one below.</div>
          }
        </div>

        <div class="add-row">
          <input
            class="input"
            type="text"
            [(ngModel)]="newInput"
            (keydown.enter)="addCase()"
            placeholder="new test input…"
          />
          <select class="expected" [(ngModel)]="newExpected">
            <option value="accept">accept</option>
            <option value="reject">reject</option>
          </select>
          <button class="add" (click)="addCase()">Add</button>
        </div>
      </section>

      <section>
        <h3>Generate examples</h3>
        <p class="desc">
          Find the shortest strings the current automaton accepts.
          Useful for sanity-checking your construction.
        </p>
        <div class="actions">
          <button class="primary" (click)="generate()" [disabled]="!hasAutomaton()">
            Generate 8 accepted strings
          </button>
        </div>
        @if (generated().length) {
          <div class="generated">
            @for (s of generated(); track $index) {
              <button class="example" (click)="addGenerated(s)" title="Add as accept test">
                {{ s.length === 0 ? 'ε (empty)' : s }}
              </button>
            }
          </div>
        } @else if (hasGenerated()) {
          <div class="empty-row">No accepted strings up to length 8.</div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .panel { padding: 16px; display: flex; flex-direction: column; gap: 22px; }
      section { display: flex; flex-direction: column; gap: 10px; }
      .title-row { display: flex; align-items: center; justify-content: space-between; }
      h3 {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--margin-red);
        margin: 0;
      }
      .counter {
        font-size: 12px;
        color: var(--text-muted);
      }
      .counter .pass { color: var(--success); font-weight: 600; }
      .desc { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0; }

      .rows { display: flex; flex-direction: column; gap: 4px; }
      .row {
        display: grid;
        grid-template-columns: 14px 1fr 80px 60px 22px;
        gap: 6px;
        align-items: center;
        padding: 6px 8px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 8px;
      }
      .row.pass { border-color: color-mix(in srgb, var(--success) 50%, var(--border)); }
      .row.fail { border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--text-muted);
      }
      .row.pass .dot { background: var(--success); }
      .row.fail .dot { background: var(--danger); }
      .input {
        height: 28px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: var(--surface);
        padding: 0 8px;
        font-size: 12px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        outline: none;
      }
      .input:focus { border-color: var(--accent); }
      .expected {
        height: 28px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: var(--surface);
        padding: 0 6px;
        font-size: 12px;
        outline: none;
      }
      .expected:focus { border-color: var(--accent); }
      .actual {
        font-size: 11px;
        text-align: center;
        color: var(--text-muted);
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
      }
      .row.pass .actual { color: var(--success); }
      .row.fail .actual { color: var(--danger); }
      .del {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 14px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .del:hover { background: var(--surface); color: var(--danger); }
      .empty-row {
        font-size: 12px;
        color: var(--text-muted);
        text-align: center;
        padding: 10px;
      }

      .add-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 80px auto;
        gap: 6px;
        margin-top: 6px;
      }
      .add-row .input {
        background: var(--surface-2);
        border-color: var(--border);
        min-width: 0;
      }
      .add-row .expected {
        background: var(--surface-2);
        border-color: var(--border);
        min-width: 0;
      }
      .add {
        height: 28px;
        padding: 0 14px;
        border-radius: 6px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
      }

      .actions { display: flex; gap: 8px; }
      .primary {
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
      }
      .primary:disabled { opacity: 0.4; cursor: not-allowed; }

      .generated {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
      }
      .example {
        padding: 4px 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        font-size: 11px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
      }
      .example:hover {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }
    `,
  ],
})
export class TestsPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly modalService = inject(ModalService);

  private readonly storageKey = this.store.workspaceStorageKey('tests');
  protected readonly cases = signal<TestCase[]>(this.loadCases());
  protected readonly generated = signal<string[]>([]);
  protected readonly hasGenerated = signal<boolean>(false);

  protected newInput = '';
  protected newExpected: 'accept' | 'reject' = 'accept';

  protected readonly hasAutomaton = computed(
    () => this.store.validation().hasStart && this.store.validation().hasAccept
  );

  protected readonly results = computed<TestResult[]>(() => {
    const auto = this.store.automaton();
    const has = this.hasAutomaton();
    return this.cases().map((c) => {
      const actual = has && simulate(auto, c.input).accepted ? 'accept' : 'reject';
      return { ...c, actual, pass: has && actual === c.expected };
    });
  });

  protected readonly passCount = computed(() => this.results().filter((r) => r.pass).length);

  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.cases();
      if (this.persistTimer) clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.flush(), PERSIST_DEBOUNCE_MS);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
    }
  }

  private flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.cases()));
    } catch {
      // ignore quota
    }
  }

  protected async addCase(): Promise<void> {
    if (!this.newInput) {
      const ok = await this.modalService.confirm({
        title: 'Empty string',
        message: 'Add a test for the empty string (ε)?',
        confirmLabel: 'Add',
      });
      if (!ok) return;
    }
    this.cases.update((arr) => [
      ...arr,
      {
        id: 'tc_' + Math.random().toString(36).slice(2, 9),
        input: this.newInput,
        expected: this.newExpected,
      },
    ]);
    this.newInput = '';
  }

  protected updateInput(id: string, input: string): void {
    this.cases.update((arr) => arr.map((c) => (c.id === id ? { ...c, input } : c)));
  }

  protected updateExpected(id: string, expected: 'accept' | 'reject'): void {
    this.cases.update((arr) => arr.map((c) => (c.id === id ? { ...c, expected } : c)));
  }

  protected remove(id: string): void {
    this.cases.update((arr) => arr.filter((c) => c.id !== id));
  }

  protected generate(): void {
    const strings = generateAcceptedStrings(this.store.automaton(), 8, 8);
    this.generated.set(strings);
    this.hasGenerated.set(true);
  }

  protected addGenerated(s: string): void {
    this.cases.update((arr) => [
      ...arr,
      {
        id: 'tc_' + Math.random().toString(36).slice(2, 9),
        input: s,
        expected: 'accept',
      },
    ]);
  }

  private loadCases(): TestCase[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }
}
