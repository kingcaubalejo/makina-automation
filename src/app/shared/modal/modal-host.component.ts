import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalAction, ModalService } from './modal.service';

@Component({
  selector: 'app-modal-host',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modal.state(); as s) {
      <div
        class="backdrop"
        [class.entered]="entered()"
        (mousedown)="onBackdropMouseDown($event)"
      >
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          (mousedown)="$event.stopPropagation()"
        >
          <header class="head">
            <h2 [id]="titleId">{{ s.title }}</h2>
            <button class="close" (click)="dismiss()" aria-label="Close">×</button>
          </header>

          @if (s.message) {
            <p class="message">{{ s.message }}</p>
          }

          @if (s.kind === 'prompt') {
            <input
              #promptInput
              class="prompt-input"
              type="text"
              [ngModel]="s.inputValue"
              (ngModelChange)="modal.setInputValue($event)"
              [placeholder]="s.inputPlaceholder ?? ''"
              (keydown.enter)="resolveInput()"
              (keydown.escape)="dismiss()"
            />
          }

          <footer class="actions">
            @for (a of s.actions; track $index) {
              <button
                class="action"
                [class.primary]="a.variant === 'primary'"
                [class.danger]="a.variant === 'danger'"
                [class.ghost]="!a.variant || a.variant === 'ghost'"
                [attr.data-autofocus]="a.autofocus ? '' : null"
                (click)="pick(a)"
              >{{ a.label }}</button>
            }
          </footer>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1000;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(20, 21, 26, 0.45);
        display: grid;
        place-items: center;
        pointer-events: auto;
        opacity: 0;
        transition: opacity 140ms ease-out;
        backdrop-filter: blur(2px);
      }
      .backdrop.entered { opacity: 1; }
      [data-theme="dark"] .backdrop {
        background: rgba(0, 0, 0, 0.6);
      }
      .modal {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow-lg);
        width: min(92vw, 420px);
        padding: 18px 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transform: scale(0.96);
        opacity: 0;
        transition: opacity 160ms ease-out, transform 160ms ease-out;
      }
      .backdrop.entered .modal {
        transform: scale(1);
        opacity: 1;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      h2 {
        font-size: 15px;
        font-weight: 600;
        margin: 0;
        line-height: 1.25;
      }
      .close {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 20px;
        line-height: 1;
        margin: -4px -6px 0 0;
      }
      .close:hover { background: var(--surface-2); color: var(--text); }
      .message {
        font-size: 13px;
        color: var(--text-muted);
        margin: 0;
        line-height: 1.5;
      }
      .prompt-input {
        height: 36px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        padding: 0 12px;
        font-size: 14px;
        outline: none;
        transition: border-color 120ms;
      }
      .prompt-input:focus {
        border-color: var(--accent);
        background: var(--surface);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .action {
        height: 32px;
        padding: 0 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        transition: background 120ms, border-color 120ms, color 120ms;
      }
      .action.ghost { background: transparent; }
      .action.ghost:hover { background: var(--surface-2); }
      .action.primary {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }
      .action.primary:hover { filter: brightness(1.05); }
      .action.danger {
        border-color: var(--danger);
        background: var(--danger);
        color: #fff;
      }
      .action.danger:hover { filter: brightness(1.05); }
    `,
  ],
})
export class ModalHostComponent implements AfterViewInit {
  protected readonly modal = inject(ModalService);
  protected readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly promptInput = viewChild<ElementRef<HTMLInputElement>>('promptInput');

  protected readonly entered = signal(false);
  protected readonly titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const s = this.modal.state();
      if (s) {
        this.previouslyFocused = (document.activeElement as HTMLElement) ?? null;
        queueMicrotask(() => this.entered.set(true));
        queueMicrotask(() => this.focusInitial());
      } else {
        this.entered.set(false);
        const focusBack = this.previouslyFocused;
        this.previouslyFocused = null;
        focusBack?.focus?.();
      }
    });
  }

  ngAfterViewInit(): void {
    // no-op; effect handles focus
  }

  protected pick(a: ModalAction): void {
    if (a.value === '__INPUT__') {
      this.resolveInput();
      return;
    }
    this.modal.close(a.value);
  }

  protected resolveInput(): void {
    const s = this.modal.state();
    if (!s) return;
    this.modal.close(s.inputValue ?? '');
  }

  protected dismiss(): void {
    const s = this.modal.state();
    if (!s) return;
    this.modal.close(s.dismissValue);
  }

  protected onBackdropMouseDown(_ev: MouseEvent): void {
    this.dismiss();
  }

  @HostListener('window:keydown', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    if (!this.modal.state()) return;
    ev.preventDefault();
    this.dismiss();
  }

  private focusInitial(): void {
    const root = this.host.nativeElement;
    if (!root) return;
    const s = this.modal.state();
    if (s?.kind === 'prompt') {
      const input = this.promptInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }
    const auto = root.querySelector<HTMLElement>('[data-autofocus]');
    auto?.focus();
  }
}
