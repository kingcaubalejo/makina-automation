import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStore } from '../../../core/services/editor-store';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { SAMPLES } from '../../../core/samples';
import { ModalService } from '../../../shared/modal/modal.service';

@Component({
  selector: 'app-library-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <section>
        <div class="title-row">
          <h3>Collab workspaces</h3>
          @if (auth.isAuthenticated()) {
            <button class="new-btn" (click)="createWorkspace()" title="Create a new collab workspace">+ New</button>
          }
        </div>
        @if (!auth.isAuthenticated()) {
          <p class="hint">
            Sign in to create shareable workspaces and invite collaborators.
          </p>
          <button class="signin-btn" (click)="auth.openModal()">Sign in</button>
        } @else if (workspaces.loading()) {
          <p class="hint">Loading…</p>
        } @else if (workspaces.loadError()) {
          <p class="hint error">Couldn't load workspaces: {{ workspaces.loadError() }}</p>
        } @else if (rows().length === 0) {
          <p class="hint">No collab workspaces yet. Create one to invite others.</p>
        } @else {
          <ul class="workspaces">
            @for (w of rows(); track w.id) {
              <li class="workspace" [class.current]="w.current">
                <button
                  class="workspace-body"
                  (click)="switchTo(w.id)"
                  [disabled]="w.current"
                  [title]="w.current ? 'Current workspace' : 'Open this workspace'"
                >
                  <span class="workspace-name">{{ w.name }}</span>
                  <span class="workspace-meta">
                    {{ w.role }}
                    @if (w.current) { <span class="badge">current</span> }
                  </span>
                </button>
                @if (!w.current && w.role === 'owner') {
                  <button class="del" (click)="removeWorkspace(w.id)" title="Delete this workspace">×</button>
                }
              </li>
            }
          </ul>
        }
      </section>

      <section>
        <h3>Samples</h3>
        @for (s of samples; track s.name) {
          <button class="sample" (click)="load(s.name)" [disabled]="!workspaces.ready()">
            <span class="sample-name">{{ s.name }}</span>
            <span class="sample-desc">{{ s.description }}</span>
          </button>
        }
      </section>

      <section>
        <h3>File</h3>
        <div class="actions">
          <button class="action" (click)="exportFile()" [disabled]="!workspaces.ready()">Export JSON</button>
          <button class="action" (click)="fileInputEl.click()" [disabled]="!workspaces.ready()">Import JSON…</button>
        </div>
        <input
          #fileInputEl
          type="file"
          accept="application/json"
          hidden
          (change)="importFile($event)"
        />
        <p class="hint">
          Workspaces sync to the server automatically. Export as JSON to share
          a snapshot outside the app.
        </p>
      </section>

      <section>
        <h3>About</h3>
        <p class="about">
          Visual editor for finite automata. Build NFAs (with ε-transitions),
          convert to DFA via subset construction, minimize with Hopcroft's
          algorithm, and simulate input strings step by step.
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      .panel { padding: 16px; display: flex; flex-direction: column; gap: 20px; }
      section { display: flex; flex-direction: column; gap: 8px; }
      h3 {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--margin-red);
        margin: 0;
      }
      .title-row { display: flex; align-items: center; justify-content: space-between; }
      .new-btn {
        font-size: 11px;
        font-weight: 600;
        color: var(--accent);
        background: transparent;
        border: 1px solid var(--accent);
        border-radius: 6px;
        padding: 3px 8px;
        cursor: pointer;
      }
      .new-btn:hover { background: var(--accent-soft); }
      .signin-btn {
        align-self: flex-start;
        font-size: 12px;
        font-weight: 600;
        color: white;
        background: var(--accent);
        border: 1px solid var(--accent);
        border-radius: 8px;
        padding: 6px 14px;
        cursor: pointer;
      }
      .signin-btn:hover { filter: brightness(1.05); }
      .workspaces { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .workspace {
        display: flex;
        align-items: stretch;
        gap: 4px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        overflow: hidden;
        transition: border-color 120ms;
      }
      .workspace:hover { border-color: var(--accent); }
      .workspace.current { border-color: var(--accent); background: var(--accent-soft); }
      .workspace-body {
        flex: 1;
        text-align: left;
        background: transparent;
        border: none;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        cursor: pointer;
      }
      .workspace-body:disabled { cursor: default; }
      .workspace-name { font-size: 13px; font-weight: 600; color: var(--text); }
      .workspace-meta {
        font-size: 11px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
        text-transform: capitalize;
      }
      .badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        background: var(--surface);
        border: 1px solid var(--accent);
        border-radius: 999px;
        padding: 1px 6px;
      }
      .del {
        background: transparent;
        border: none;
        color: var(--text-muted);
        font-size: 18px;
        line-height: 1;
        padding: 0 10px;
        cursor: pointer;
      }
      .del:hover { color: var(--danger); }
      .sample {
        text-align: left;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        transition: border-color 120ms, background 120ms;
      }
      .sample:hover:not(:disabled) {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .sample:disabled { opacity: 0.5; cursor: not-allowed; }
      .sample-name { font-size: 13px; font-weight: 600; }
      .sample-desc { font-size: 12px; color: var(--text-muted); }
      .actions { display: flex; gap: 8px; }
      .action {
        flex: 1;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-size: 12px;
        font-weight: 500;
      }
      .action:disabled { opacity: 0.5; cursor: not-allowed; }
      .action:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
      }
      .hint, .about { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0; }
      .hint.error { color: var(--danger); }
    `,
  ],
})
export class LibraryPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly workspaces = inject(WorkspaceService);
  protected readonly auth = inject(AuthService);
  protected readonly modal = inject(ModalService);
  protected readonly samples = SAMPLES;

  protected readonly rows = computed(() => {
    const currentId = this.workspaces.currentWorkspaceId();
    return this.workspaces.workspaces().map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      current: w.id === currentId,
    }));
  });

  protected load(name: string): void {
    const sample = this.samples.find((s) => s.name === name);
    if (!sample) return;
    this.store.loadAutomaton(deepClone(sample.data), true);
    this.store.resetViewport();
  }

  protected async createWorkspace(): Promise<void> {
    const name = await this.modal.prompt({
      title: 'New workspace',
      message: 'Name this workspace.',
      placeholder: 'Untitled',
      confirmLabel: 'Create',
    });
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;
    try {
      const created = await this.workspaces.createWorkspace(trimmed);
      await this.workspaces.openWorkspace(created.id, created.role);
    } catch (err) {
      this.modal.alert({ title: 'Create failed', message: (err as Error).message });
    }
  }

  protected async switchTo(id: string): Promise<void> {
    const target = this.workspaces.workspaces().find((w) => w.id === id);
    if (!target) return;
    await this.workspaces.openWorkspace(id, target.role);
  }

  protected async removeWorkspace(id: string): Promise<void> {
    const target = this.workspaces.workspaces().find((w) => w.id === id);
    const label = target?.name ?? 'this workspace';
    const confirmed = await this.modal.confirm({
      title: 'Delete workspace',
      message: `Delete "${label}"? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.workspaces.deleteWorkspace(id);
    } catch (err) {
      this.modal.alert({ title: 'Delete failed', message: (err as Error).message });
    }
  }

  protected exportFile(): void {
    const json = this.store.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automaton.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected importFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.store.importJson(String(reader.result));
        this.store.resetViewport();
      } catch (err) {
        this.modal.alert({
          title: 'Import failed',
          message: (err as Error).message,
        });
      }
      input.value = '';
    };
    reader.readAsText(file);
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
