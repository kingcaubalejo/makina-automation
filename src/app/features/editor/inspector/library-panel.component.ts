import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EditorStore } from '../../../core/services/editor-store';
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
          <h3>Saved workspaces</h3>
          <button class="new-btn" (click)="newWorkspace()" title="Open a fresh workspace in a new tab">+ New</button>
        </div>
        @if (workspaces().length === 0) {
          <p class="hint">No saved workspaces yet.</p>
        } @else {
          <ul class="workspaces">
            @for (w of workspaces(); track w.id) {
              <li class="workspace" [class.current]="w.current">
                <button class="workspace-body" (click)="switchTo(w.id)" [disabled]="w.current" [title]="w.current ? 'Current workspace' : 'Open this workspace'">
                  <span class="workspace-name">{{ w.name }}</span>
                  <span class="workspace-meta">
                    {{ w.states }} {{ w.states === 1 ? 'state' : 'states' }}
                    @if (w.current) { <span class="badge">current</span> }
                  </span>
                </button>
                @if (!w.current) {
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
          <button class="sample" (click)="load(s.name)">
            <span class="sample-name">{{ s.name }}</span>
            <span class="sample-desc">{{ s.description }}</span>
          </button>
        }
      </section>

      <section>
        <h3>File</h3>
        <div class="actions">
          <button class="action" (click)="exportFile()">Export JSON</button>
          <button class="action" (click)="fileInputEl.click()">Import JSON…</button>
        </div>
        <input
          #fileInputEl
          type="file"
          accept="application/json"
          hidden
          (change)="importFile($event)"
        />
        <p class="hint">
          Auto-saved to your browser. Export as JSON to share or back up.
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
      .sample:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
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
      .action:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .hint, .about { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0; }
    `,
  ],
})
export class LibraryPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly modal = inject(ModalService);
  protected readonly samples = SAMPLES;
  protected readonly workspaces = signal(this.store.listWorkspaces());

  protected load(name: string): void {
    const sample = this.samples.find((s) => s.name === name);
    if (!sample) return;
    this.store.loadAutomaton(deepClone(sample.data), true);
    this.store.resetViewport();
    this.workspaces.set(this.store.listWorkspaces());
  }

  protected newWorkspace(): void {
    this.store.openNewWindow();
  }

  protected switchTo(id: string): void {
    this.store.switchWorkspace(id);
  }

  protected async removeWorkspace(id: string): Promise<void> {
    const target = this.workspaces().find((w) => w.id === id);
    const label = target?.name ?? 'this workspace';
    const confirmed = await this.modal.confirm({
      title: 'Delete workspace',
      message: `Delete "${label}"? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.store.deleteWorkspace(id);
    this.workspaces.set(this.store.listWorkspaces());
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
