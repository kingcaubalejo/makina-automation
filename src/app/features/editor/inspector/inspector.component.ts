import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorStore } from '../../../core/services/editor-store';
import { AuthService } from '../../../core/services/auth.service';
import { PropertiesPanelComponent } from './properties-panel.component';
import { ConversionPanelComponent } from '../../conversion/conversion-panel.component';
import { SimulationPanelComponent } from '../../simulation/simulation-panel.component';
import { RegexPanelComponent } from '../../regex/regex-panel.component';
import { TestsPanelComponent } from '../../tests/tests-panel.component';
import { LibraryPanelComponent } from './library-panel.component';

type Tab = 'properties' | 'simulate' | 'convert' | 'regex' | 'tests' | 'library';

interface TabDef {
  id: Tab;
  label: string;
  requiresAuth?: boolean;
}

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [
    FormsModule,
    PropertiesPanelComponent,
    ConversionPanelComponent,
    SimulationPanelComponent,
    RegexPanelComponent,
    TestsPanelComponent,
    LibraryPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="inspector">
      <nav class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button
            class="tab"
            [class.active]="active() === t.id"
            [class.locked]="isLocked(t)"
            [attr.aria-selected]="active() === t.id"
            [attr.aria-disabled]="isLocked(t) ? 'true' : null"
            (click)="selectTab(t)"
            [title]="tooltip(t)"
            role="tab"
          >
            <svg class="tab-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              @switch (t.id) {
                @case ('properties') {
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7" />
                  <line x1="12" y1="8" x2="12" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M11 11h1v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                }
                @case ('simulate') {
                  <path d="M7 5l11 7-11 7V5z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" />
                }
                @case ('convert') {
                  <path d="M3 9h13M14 6l3 3-3 3M21 15H8M11 18l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                }
                @case ('regex') {
                  <path d="M12 4v8M9 6l6 4M9 10l6-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                  <circle cx="6" cy="18" r="1.6" fill="currentColor" />
                }
                @case ('tests') {
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7" />
                  <path d="M8 12l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                }
                @case ('library') {
                  <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
                  <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" stroke-width="1.7" />
                  <line x1="14" y1="4" x2="14" y2="20" stroke="currentColor" stroke-width="1.7" />
                }
              }
            </svg>
            @if (isLocked(t)) {
              <span class="lock-badge" aria-label="Sign in to unlock" title="Sign in to unlock">
                <svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true">
                  <rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor" />
                  <path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
            }
          </button>
        }
      </nav>

      <div class="tab-label">{{ activeLabel() }}</div>

      <div class="content">
        @switch (active()) {
          @case ('properties') { <app-properties-panel /> }
          @case ('simulate')   { <app-simulation-panel /> }
          @case ('convert')    { <app-conversion-panel /> }
          @case ('regex')      { <app-regex-panel /> }
          @case ('tests')      { <app-tests-panel /> }
          @case ('library')    { <app-library-panel /> }
        }
      </div>

      <div class="status">
        @if (validation().errors.length) {
          @for (e of validation().errors; track e) {
            <div class="status-row error">
              <span class="status-dot" aria-hidden="true"></span>{{ e }}
            </div>
          }
        } @else if (!validation().isDfa) {
          <div class="status-row info">
            <span class="status-dot" aria-hidden="true"></span>NFA · alphabet {{ alphabetLabel() }}
          </div>
        } @else {
          <div class="status-row ok">
            <span class="status-dot" aria-hidden="true"></span>DFA · alphabet {{ alphabetLabel() }}
          </div>
        }
      </div>
    </aside>
  `,
  styles: [
    `
      :host {
        position: absolute;
        top: 76px;
        left: 16px;
        bottom: 16px;
        width: 300px;
        pointer-events: auto;
        display: block;
      }
      .inspector {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100%;
        overflow: hidden;
      }
      .tabs {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 2px;
        padding: 6px;
        background: var(--surface-2);
        border-radius: 12px 12px 0 0;
        border-bottom: 1px solid var(--border);
      }
      .tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--text-muted);
        transition: background 120ms, color 120ms;
      }
      .tab-icon { width: 16px; height: 16px; display: block; flex-shrink: 0; }
      .tab:hover { background: var(--surface); color: var(--text); }
      .tab.active {
        background: var(--surface);
        color: var(--accent);
        box-shadow: var(--shadow);
      }
      .tab.locked { opacity: 0.55; cursor: pointer; }
      .tab.locked:hover { background: var(--surface); color: var(--text); opacity: 0.75; }
      .lock-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 13px;
        height: 13px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .tab.locked:hover .lock-badge { color: var(--accent); border-color: var(--accent); }
      .tab-label {
        font-family: var(--serif);
        font-style: italic;
        font-size: 12px;
        color: var(--text-muted);
        padding: 8px 16px 0;
        letter-spacing: 0.005em;
      }
      .content {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .status {
        border-top: 1px solid var(--border);
        padding: 8px 14px;
        background: var(--surface-2);
        border-radius: 0 0 12px 12px;
      }
      .status-row {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted);
      }
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: currentColor;
        flex-shrink: 0;
      }
      .status-row.error { color: var(--danger); }
      .status-row.ok    { color: var(--success); }
      .status-row.info  { color: var(--accent); }

      @media (max-height: 640px) {
        :host { bottom: auto; max-height: calc(100vh - 92px); }
      }
      @media (max-width: 720px) {
        :host { width: calc(100vw - 32px); max-width: 320px; }
      }
    `,
  ],
})
export class InspectorComponent {
  protected readonly store = inject(EditorStore);
  protected readonly auth = inject(AuthService);
  protected readonly active = signal<Tab>('properties');

  protected readonly tabs: TabDef[] = [
    { id: 'properties', label: 'Inspect'                      },
    { id: 'simulate',   label: 'Simulate'                     },
    { id: 'convert',    label: 'Convert', requiresAuth: true  },
    { id: 'regex',      label: 'Regex',   requiresAuth: true  },
    { id: 'tests',      label: 'Tests',   requiresAuth: true  },
    { id: 'library',    label: 'Library', requiresAuth: true  },
  ];

  protected isLocked(t: TabDef): boolean {
    return !!t.requiresAuth && !this.auth.isAuthenticated();
  }

  protected tooltip(t: TabDef): string {
    return this.isLocked(t) ? `${t.label} — sign in to unlock` : t.label;
  }

  protected selectTab(t: TabDef): void {
    if (this.isLocked(t)) {
      this.auth.openModal();
      return;
    }
    this.active.set(t.id);
  }

  protected readonly validation = computed(() => this.store.validation());
  protected readonly alphabetLabel = computed(() => {
    const a = this.store.alphabet();
    return a.length ? a.join(', ') : '∅';
  });
  protected readonly activeLabel = computed(() => {
    const id = this.active();
    return this.tabs.find((t) => t.id === id)?.label ?? '';
  });
}

