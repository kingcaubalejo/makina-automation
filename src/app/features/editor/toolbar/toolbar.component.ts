import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStore, Tool } from '../../../core/services/editor-store';
import { AuthService } from '../../../core/services/auth.service';

interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- top-left: brand + workspace -->
    <div class="cluster top-left">
      <div class="card brand-card">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 36 16" width="34" height="15">
            <circle cx="6"  cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
            <circle cx="30" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
            <circle cx="30" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4" />
            <line   x1="10.8" y1="8" x2="23" y2="8" stroke="currentColor" stroke-width="1.4" />
            <polyline points="20.5,5.5 23.5,8 20.5,10.5" fill="none" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </span>
        <div class="brand-text">
          <strong>Makina</strong>
          <input
            class="workspace-name"
            type="text"
            [value]="store.workspaceName()"
            (input)="onWorkspaceInput($event)"
            (blur)="onWorkspaceBlur($event)"
            spellcheck="false"
            aria-label="Workspace name"
            title="Workspace name (rename this window)"
          />
        </div>
      </div>
    </div>

    <!-- top-center: tools -->
    <div class="cluster top-center">
      <div class="card tool-pill">
        @for (t of tools; track t.id; let i = $index) {
          <button
            class="tool-btn"
            [class.active]="store.tool() === t.id"
            (click)="store.setTool(t.id)"
            [title]="t.label + ' — ' + t.hint"
          >
            <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              @switch (t.id) {
                @case ('select') {
                  <path d="M5 3l14 7-6 2-2 6-6-15z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                }
                @case ('state') {
                  <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.7" />
                }
                @case ('transition') {
                  <path d="M4 12 H 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                  <path d="M14 8 L 18 12 L 14 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                }
                @case ('pan') {
                  <path d="M9 11V5a1.5 1.5 0 113 0v5M12 11V4a1.5 1.5 0 113 0v7M15 11V6a1.5 1.5 0 113 0v9a6 6 0 01-6 6h-1a6 6 0 01-6-6v-3a1.5 1.5 0 113 0v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                }
                @case ('erase') {
                  <path d="M3 17l8-8 6 6-8 8H5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M14 6l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                }
              }
            </svg>
            <span class="kbd">{{ t.hint }}</span>
          </button>
        }
      </div>
      <p class="tool-hint">
        Press <kbd>{{ toolHint() }}</kbd> or click a tool
      </p>
    </div>

    <!-- top-right: actions + account -->
    <div class="cluster top-right">
      <div class="card action-row">
        <button class="ghost" (click)="store.undo()" [disabled]="!store.canUndo()" title="Undo (⌘Z)">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M9 14l-4-4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M5 10h9a5 5 0 110 10h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button class="ghost" (click)="store.redo()" [disabled]="!store.canRedo()" title="Redo (⌘⇧Z)">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M15 14l4-4-4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M19 10h-9a5 5 0 100 10h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span class="divider"></span>
        <button class="ghost" (click)="store.clear()" title="Clear canvas">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button class="ghost" (click)="store.openNewWindow()" title="Open a new workspace in a new window">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="4" y="6" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M14 10h6V4h-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M16 6l4 -4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>
        <span class="divider"></span>
        <button class="ghost" (click)="store.toggleTheme()" [title]="'Toggle theme (currently ' + store.theme() + ')'">
          @if (store.theme() === 'dark') {
            <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          } @else {
            <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M21 12.8A8.5 8.5 0 1111.2 3a7 7 0 009.8 9.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          }
        </button>
      </div>

      @if (auth.isAuthenticated()) {
        <button class="account-btn card" (click)="auth.logout()" [title]="'Signed in as ' + auth.currentUser()?.email + ' — click to sign out'">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <span class="account-label">Sign out</span>
        </button>
      } @else {
        <button class="account-btn primary card" (click)="auth.openModal()" title="Sign in">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="account-label">Sign in</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        display: block;
      }
      .cluster {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
      }
      .cluster.top-left    { top: 16px; left: 16px; }
      .cluster.top-center  { top: 16px; left: 50%; transform: translateX(-50%); flex-direction: column; gap: 6px; }
      .cluster.top-right   { top: 16px; right: 16px; }

      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: var(--shadow);
        padding: 6px;
        display: inline-flex;
        align-items: center;
      }

      /* brand card */
      .brand-card {
        gap: 10px;
        padding: 6px 12px 6px 10px;
      }
      .brand-mark {
        color: var(--ink);
        display: inline-flex;
        align-items: center;
      }
      .brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.05;
      }
      .brand-text strong {
        font-family: var(--serif);
        font-style: italic;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .workspace-name {
        font-family: var(--serif);
        font-style: italic;
        font-size: 11px;
        color: var(--text-muted);
        background: transparent;
        border: 1px dashed transparent;
        padding: 1px 4px;
        margin: 1px 0 0 -4px;
        border-radius: 3px;
        outline: none;
        max-width: 160px;
        min-width: 80px;
        text-overflow: ellipsis;
      }
      .workspace-name:hover { border-color: var(--border); }
      .workspace-name:focus {
        border-color: var(--accent);
        border-style: solid;
        background: var(--surface-2);
        color: var(--text);
      }

      /* tool pill */
      .tool-pill {
        gap: 2px;
        padding: 5px;
      }
      .tool-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: var(--text);
        transition: background 120ms, color 120ms;
      }
      .tool-btn:hover { background: var(--surface-2); }
      .tool-btn.active {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .tool-btn .kbd {
        position: absolute;
        right: 3px;
        bottom: 2px;
        font-size: 8px;
        font-weight: 600;
        color: var(--text-muted);
        line-height: 1;
        letter-spacing: 0;
      }
      .tool-btn.active .kbd { color: var(--accent); }

      .tool-hint {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
        font-family: var(--serif);
        font-style: italic;
      }
      .tool-hint kbd {
        display: inline-block;
        min-width: 18px;
        text-align: center;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: var(--mono);
        font-style: normal;
        font-size: 10px;
        color: var(--text);
        margin: 0 2px;
      }

      /* action row */
      .action-row {
        gap: 2px;
      }
      .ghost {
        background: transparent;
        border: none;
        border-radius: 8px;
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--text);
      }
      .ghost:hover { background: var(--surface-2); }
      .ghost:disabled { opacity: 0.35; cursor: not-allowed; }
      .ghost:disabled:hover { background: transparent; }
      .divider {
        width: 1px;
        height: 20px;
        background: var(--border);
        margin: 0 4px;
      }

      /* account button */
      .account-btn {
        gap: 8px;
        padding: 6px 12px;
        height: 38px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
      }
      .account-btn:hover { background: var(--surface-2); }
      .account-btn.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
        box-shadow: var(--shadow);
      }
      .account-btn.primary:hover { filter: brightness(1.05); background: var(--accent); }
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .icon { width: 16px; height: 16px; display: block; flex-shrink: 0; }

      @media (max-width: 900px) {
        .tool-hint { display: none; }
        .account-label { display: none; }
        .account-btn { padding: 6px; width: 38px; height: 38px; justify-content: center; }
      }
      @media (max-width: 620px) {
        .cluster.top-left .brand-text strong { display: none; }
        .cluster.top-left .workspace-name { max-width: 100px; }
        .action-row .divider { display: none; }
      }
    `,
  ],
})
export class ToolbarComponent {
  protected readonly store = inject(EditorStore);
  protected readonly auth = inject(AuthService);

  protected readonly tools: ToolDef[] = [
    { id: 'select',     label: 'Select',     hint: 'V' },
    { id: 'state',      label: 'State',      hint: 'S' },
    { id: 'transition', label: 'Transition', hint: 'T' },
    { id: 'pan',        label: 'Pan',        hint: 'H' },
    { id: 'erase',      label: 'Erase',      hint: 'E' },
  ];

  protected readonly toolHint = computed(() => {
    const active = this.tools.find((t) => t.id === this.store.tool());
    return active?.hint ?? 'V';
  });

  protected readonly initials = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '?';
    const f = (user.firstName ?? '').trim()[0] ?? '';
    const l = (user.lastName ?? '').trim()[0] ?? '';
    const fallback = (user.email ?? '?').trim()[0] ?? '?';
    return (f + l) || fallback;
  });

  protected onWorkspaceInput(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.store.workspaceName.set(value || 'Untitled');
  }

  protected onWorkspaceBlur(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const trimmed = el.value.trim();
    this.store.setWorkspaceName(trimmed);
    if (!trimmed) el.value = 'Untitled';
  }
}
