import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorStore } from '../../core/services/editor-store';
import { regexToNfa } from '../../core/algorithms/regex-to-nfa';

const MAX_REGEX_LENGTH = 200;

@Component({
  selector: 'app-regex-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <section>
        <h3>Regex → NFA</h3>
        <p class="desc">
          Build an NFA via Thompson's construction. Supports
          <code>|</code>, <code>*</code>, <code>+</code>, <code>?</code>, parentheses,
          and concatenation. Escape with <code>\\</code>.
        </p>
        <input
          class="input"
          type="text"
          [(ngModel)]="value"
          (keydown.enter)="buildAndLoad()"
          placeholder="(a|b)*abb"
        />
        @if (error()) {
          <div class="error">{{ error() }}</div>
        }
        <div class="examples">
          <span class="ex-label">Try:</span>
          @for (ex of examples; track ex) {
            <button class="ex" (click)="value = ex; buildAndLoad()">{{ ex }}</button>
          }
        </div>
        <div class="actions">
          <button class="primary" (click)="buildAndLoad()">Build NFA</button>
        </div>
      </section>

      <section class="syntax">
        <h3>Syntax</h3>
        <ul>
          <li><code>ab</code> — concatenation</li>
          <li><code>a|b</code> — alternation</li>
          <li><code>a*</code> — zero or more</li>
          <li><code>a+</code> — one or more</li>
          <li><code>a?</code> — optional</li>
          <li><code>(ab|c)*</code> — grouping</li>
        </ul>
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
      .desc code {
        background: var(--surface-2);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 11px;
      }
      .input {
        height: 38px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        padding: 0 12px;
        font-size: 14px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        outline: none;
      }
      .input:focus { border-color: var(--accent); background: var(--surface); }
      .error { color: var(--danger); font-size: 12px; }
      .examples { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .ex-label { font-size: 11px; color: var(--text-muted); }
      .ex {
        padding: 4px 10px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 11px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        color: var(--text);
      }
      .ex:hover {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }
      .actions { display: flex; gap: 8px; }
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

      .syntax ul { padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
      .syntax li { font-size: 12px; color: var(--text-muted); }
      .syntax code {
        background: var(--surface-2);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 11px;
        color: var(--text);
      }
    `,
  ],
})
export class RegexPanelComponent {
  protected readonly store = inject(EditorStore);
  protected value = '';
  protected readonly error = signal<string | null>(null);
  protected readonly examples = ['(a|b)*abb', 'ab*c', '(0|1)+', 'a(b|c)*d?'];

  protected buildAndLoad(): void {
    this.error.set(null);
    if (this.value.length > MAX_REGEX_LENGTH) {
      this.error.set(`Regex too long (max ${MAX_REGEX_LENGTH} characters).`);
      return;
    }
    try {
      const nfa = regexToNfa(this.value);
      this.store.loadAutomaton(nfa, true);
      this.store.resetViewport();
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }
}
