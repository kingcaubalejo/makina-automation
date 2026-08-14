import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

type Mode = 'login' | 'register';
type LoginMethod = 'password' | 'phone' | 'google';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.modalOpen()) {
      <div class="backdrop" (mousedown)="close()">
        <div class="modal" role="dialog" aria-modal="true" (mousedown)="$event.stopPropagation()">
          <header class="head">
            <div class="head-text">
              <span class="eyebrow">Automata Studio</span>
              <h2>{{ mode() === 'login' ? 'Sign in to save your work' : 'Create your account' }}</h2>
            </div>
            <button class="close" (click)="close()" aria-label="Close">×</button>
          </header>

          <aside class="callout" role="note">
            <span class="callout-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                <path d="M17 21v-8H7v8M7 3v5h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
              </svg>
            </span>
            <div class="callout-body">
              <p>
                Simulations are always free. Sign in to <strong>save projects</strong> and
                <strong>export</strong> your work.
              </p>
              <p class="mock-note">Mock backend — credentials are stored locally in your browser.</p>
            </div>
          </aside>

          <nav class="mode-tabs">
            <button
              class="mode-tab"
              [class.active]="mode() === 'login'"
              (click)="setMode('login')"
              type="button"
            >Login</button>
            <button
              class="mode-tab"
              [class.active]="mode() === 'register'"
              (click)="setMode('register')"
              type="button"
            >Register</button>
          </nav>

          @if (mode() === 'login') {
            <div class="method-tabs">
              <button
                class="method-tab"
                [class.active]="method() === 'password'"
                (click)="setMethod('password')"
                type="button"
              >Email + Password</button>
              <button
                class="method-tab"
                [class.active]="method() === 'phone'"
                (click)="setMethod('phone')"
                type="button"
              >Phone</button>
              <button
                class="method-tab"
                [class.active]="method() === 'google'"
                (click)="setMethod('google')"
                type="button"
              >Google</button>
            </div>

            @switch (method()) {
              @case ('password') {
                <form class="form" (submit)="submitPassword($event)">
                  <label class="field">
                    <span>Email</span>
                    <input type="email" [(ngModel)]="loginEmail" name="loginEmail" autocomplete="email" required />
                  </label>
                  <label class="field">
                    <span>Password</span>
                    <input type="password" [(ngModel)]="loginPassword" name="loginPassword" autocomplete="current-password" required />
                  </label>
                  @if (error()) {
                    <div class="error">{{ error() }}</div>
                  }
                  <button class="primary" type="submit">Sign in</button>
                </form>
              }
              @case ('phone') {
                <form class="form" (submit)="submitPhone($event)">
                  <label class="field">
                    <span>Phone number</span>
                    <input
                      type="tel"
                      [(ngModel)]="loginPhone"
                      name="loginPhone"
                      placeholder="+1 555 555 5555"
                      autocomplete="tel"
                      required
                    />
                  </label>
                  @if (!codeSent()) {
                    @if (error()) {
                      <div class="error">{{ error() }}</div>
                    }
                    <button class="primary" type="button" (click)="sendCode()">Send verification code</button>
                  } @else {
                    <label class="field">
                      <span>Verification code</span>
                      <input
                        type="text"
                        [(ngModel)]="loginCode"
                        name="loginCode"
                        placeholder="000000"
                        inputmode="numeric"
                        maxlength="6"
                        required
                      />
                      <small class="mock-hint">Mock code: 000000</small>
                    </label>
                    @if (error()) {
                      <div class="error">{{ error() }}</div>
                    }
                    <button class="primary" type="submit">Verify &amp; sign in</button>
                  }
                </form>
              }
              @case ('google') {
                <div class="google-panel">
                  @if (error()) {
                    <div class="error">{{ error() }}</div>
                  }
                  <button class="google-btn" type="button" (click)="submitGoogle()">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                    </svg>
                    Continue with Google
                  </button>
                  <p class="mock-hint">Mock provider — signs you in as Google User.</p>
                </div>
              }
            }
          } @else {
            <form class="form" (submit)="submitRegister($event)">
              <div class="row">
                <label class="field">
                  <span>First name</span>
                  <input type="text" [(ngModel)]="regFirst" name="regFirst" autocomplete="given-name" required />
                </label>
                <label class="field">
                  <span>Last name</span>
                  <input type="text" [(ngModel)]="regLast" name="regLast" autocomplete="family-name" required />
                </label>
              </div>
              <label class="field">
                <span>Email</span>
                <input type="email" [(ngModel)]="regEmail" name="regEmail" autocomplete="email" required />
              </label>
              <label class="field">
                <span>Phone number</span>
                <input
                  type="tel"
                  [(ngModel)]="regPhone"
                  name="regPhone"
                  placeholder="+1 555 555 5555"
                  autocomplete="tel"
                  required
                />
              </label>
              <label class="field">
                <span>Password</span>
                <input
                  type="password"
                  [(ngModel)]="regPassword"
                  name="regPassword"
                  autocomplete="new-password"
                  minlength="6"
                  required
                />
              </label>
              @if (error()) {
                <div class="error">{{ error() }}</div>
              }
              <button class="primary" type="submit">Create account</button>
            </form>
          }
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
        z-index: 1100;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(20, 21, 26, 0.5);
        backdrop-filter: blur(2px);
        display: grid;
        place-items: center;
        pointer-events: auto;
      }
      [data-theme="dark"] .backdrop {
        background: rgba(0, 0, 0, 0.65);
      }
      .modal {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border-strong);
        border-radius: 14px;
        box-shadow: var(--shadow-lg);
        width: min(94vw, 440px);
        padding: 22px 22px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .head-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .eyebrow {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--margin-red);
      }
      h2 {
        font-family: var(--serif);
        font-size: 22px;
        font-weight: 600;
        margin: 0;
        line-height: 1.15;
        letter-spacing: -0.005em;
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
      .callout {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
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
      .callout-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .callout-body p {
        margin: 0;
        color: var(--text);
        font-size: 12.5px;
        line-height: 1.5;
      }
      .callout-body strong { font-weight: 600; }
      .mock-note {
        color: var(--text-muted);
        font-size: 11px !important;
        font-style: italic;
      }
      .mode-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: var(--surface-2);
        border-radius: 10px;
        padding: 4px;
        gap: 2px;
      }
      .mode-tab {
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 13px;
        font-weight: 500;
        padding: 8px 12px;
        border-radius: 7px;
        transition: background 120ms, color 120ms;
      }
      .mode-tab:hover { color: var(--text); }
      .mode-tab.active {
        background: var(--surface);
        color: var(--accent);
        box-shadow: var(--shadow);
      }
      .method-tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
      }
      .method-tab {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 500;
        padding: 8px 6px;
        border-radius: 8px;
        transition: background 120ms, color 120ms, border-color 120ms;
      }
      .method-tab:hover { color: var(--text); border-color: var(--border-strong); }
      .method-tab.active {
        color: var(--accent);
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .field > span {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }
      .field input {
        height: 36px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        padding: 0 12px;
        font-size: 14px;
        outline: none;
        transition: border-color 120ms, background 120ms;
      }
      .field input:focus {
        border-color: var(--accent);
        background: var(--surface);
      }
      .mock-hint {
        font-size: 11px;
        color: var(--text-muted);
        font-style: italic;
      }
      .error {
        font-size: 12px;
        color: var(--danger);
        background: color-mix(in srgb, var(--danger) 10%, var(--surface-2));
        border: 1px solid var(--danger);
        padding: 6px 10px;
        border-radius: 8px;
      }
      .primary {
        height: 38px;
        border-radius: 8px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        margin-top: 4px;
      }
      .primary:hover { filter: brightness(1.05); }
      .google-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
      }
      .google-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 42px;
        border-radius: 8px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);
        font-size: 14px;
        font-weight: 500;
      }
      .google-btn:hover { background: var(--surface-2); }
    `,
  ],
})
export class AuthModalComponent {
  protected readonly auth = inject(AuthService);

  protected readonly mode = signal<Mode>('login');
  protected readonly method = signal<LoginMethod>('password');
  protected readonly error = signal<string | null>(null);
  protected readonly codeSent = signal(false);

  protected loginEmail = '';
  protected loginPassword = '';
  protected loginPhone = '';
  protected loginCode = '';

  protected regFirst = '';
  protected regLast = '';
  protected regEmail = '';
  protected regPhone = '';
  protected regPassword = '';

  protected readonly title = computed(() =>
    this.mode() === 'login' ? 'Sign in' : 'Create account',
  );

  protected setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set(null);
  }

  protected setMethod(m: LoginMethod): void {
    this.method.set(m);
    this.error.set(null);
    this.codeSent.set(false);
  }

  protected sendCode(): void {
    if (!this.loginPhone.trim()) {
      this.error.set('Please enter a phone number.');
      return;
    }
    this.error.set(null);
    this.codeSent.set(true);
  }

  protected submitPassword(ev: Event): void {
    ev.preventDefault();
    const result = this.auth.loginWithPassword(this.loginEmail, this.loginPassword);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.reset();
  }

  protected submitPhone(ev: Event): void {
    ev.preventDefault();
    const result = this.auth.loginWithPhone(this.loginPhone, this.loginCode);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.reset();
  }

  protected submitGoogle(): void {
    const result = this.auth.loginWithGoogle();
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.reset();
  }

  protected submitRegister(ev: Event): void {
    ev.preventDefault();
    const result = this.auth.register({
      email: this.regEmail,
      phone: this.regPhone,
      firstName: this.regFirst,
      lastName: this.regLast,
      password: this.regPassword,
    });
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.reset();
  }

  protected close(): void {
    this.auth.closeModal();
    this.error.set(null);
    this.codeSent.set(false);
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.auth.modalOpen()) this.close();
  }

  private reset(): void {
    this.loginEmail = '';
    this.loginPassword = '';
    this.loginPhone = '';
    this.loginCode = '';
    this.regFirst = '';
    this.regLast = '';
    this.regEmail = '';
    this.regPhone = '';
    this.regPassword = '';
    this.error.set(null);
    this.codeSent.set(false);
  }
}
