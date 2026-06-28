import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStore, Tool } from '../../../core/services/editor-store';

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
    <div class="toolbar">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 36 16" width="42" height="18" aria-hidden="true">
          <circle cx="6"  cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
          <circle cx="30" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
          <circle cx="30" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4" />
          <line   x1="10.8" y1="8" x2="23" y2="8" stroke="currentColor" stroke-width="1.4" />
          <polyline points="20.5,5.5 23.5,8 20.5,10.5" fill="none" stroke="currentColor" stroke-width="1.4" />
        </svg>
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

      <div class="tools">
        @for (t of tools; track t.id) {
          <button
            class="tool-btn"
            [class.active]="store.tool() === t.id"
            (click)="store.setTool(t.id)"
            [title]="t.label + ' (' + t.hint + ')'"
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
            <span class="label">{{ t.label }}</span>
          </button>
        }
      </div>

      <div class="spacer"></div>

      <div class="actions">
        <button class="ghost" (click)="store.openNewWindow()" title="Open a new workspace in a new window">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="4" y="6" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M14 10h6V4h-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M16 6l4 -4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>
        <span class="divider"></span>
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
        <button class="ghost" (click)="store.clear()" title="Clear canvas">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
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
    </div>
  `,
  styles: [
    `
      .toolbar {
        height: 56px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-right: 14px;
        border-right: 1px solid var(--border);
        margin-right: 4px;
      }
      .brand-mark {
        color: var(--ink);
        flex-shrink: 0;
      }
      .brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.05;
      }
      .brand-text strong {
        font-family: "Newsreader", ui-serif, Georgia, serif;
        font-style: italic;
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .brand-text span {
        font-family: "Newsreader", ui-serif, Georgia, serif;
        font-style: italic;
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 2px;
      }
      .workspace-name {
        font-family: "Newsreader", ui-serif, Georgia, serif;
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
      .workspace-name:hover {
        border-color: var(--border);
      }
      .workspace-name:focus {
        border-color: var(--accent);
        border-style: solid;
        background: var(--surface);
        color: var(--text);
      }
      .tools {
        display: flex;
        gap: 4px;
        background: var(--surface-2);
        padding: 4px;
        border-radius: 10px;
      }
      .tool-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 7px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 13px;
        font-weight: 500;
        transition: background 120ms, color 120ms;
      }
      .tool-btn:hover {
        background: var(--surface);
        color: var(--text);
      }
      .tool-btn.active {
        background: var(--surface);
        color: var(--accent);
        box-shadow: var(--shadow);
      }
      .icon {
        width: 16px;
        height: 16px;
        display: block;
        flex-shrink: 0;
      }
      .spacer {
        flex: 1;
      }
      .actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .ghost {
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
      }
      .ghost:hover {
        background: var(--surface-2);
        color: var(--text);
      }
      .ghost:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .divider {
        width: 1px;
        height: 22px;
        background: var(--border);
        margin: 0 6px;
      }
    `,
  ],
})
export class ToolbarComponent {
  protected readonly store = inject(EditorStore);

  protected readonly tools: ToolDef[] = [
    { id: 'select',     label: 'Select',     hint: 'V' },
    { id: 'state',      label: 'State',      hint: 'S' },
    { id: 'transition', label: 'Transition', hint: 'T' },
    { id: 'pan',        label: 'Pan',        hint: 'H' },
    { id: 'erase',      label: 'Erase',      hint: 'E' },
  ];

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

