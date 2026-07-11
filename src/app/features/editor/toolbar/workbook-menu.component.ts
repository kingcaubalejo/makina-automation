import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { EditorStore } from '../../../core/services/editor-store';
import { WorkbookService } from '../../../core/services/workbook-service';
import { WorkbookMeta } from '../../../core/services/workbook-repository';
import { ModalService } from '../../../shared/modal/modal.service';

@Component({
  selector: 'app-workbook-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wb-menu">
      <button
        class="trigger"
        type="button"
        (click)="toggleOpen($event)"
        [attr.aria-expanded]="open()"
        title="Switch workbook"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      @if (open()) {
        <div class="popover" (click)="$event.stopPropagation()">
          <header class="pop-head">
            <span class="pop-title">Workbooks</span>
            <button class="new-btn" type="button" (click)="createNew()" title="New workbook">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              New
            </button>
          </header>

          <ul class="wb-list">
            @for (wb of workbooks(); track wb.id) {
              <li
                class="wb-row"
                [class.active]="wb.id === activeId()"
                (click)="switchTo(wb)"
              >
                <span class="wb-check">
                  @if (wb.id === activeId()) {
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                      <path
                        d="M5 12l4 4 10-10"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                </span>
                <span class="wb-name">{{ wb.name }}</span>
                <span class="wb-meta">{{ relative(wb.updatedAt) }}</span>
                <span class="wb-actions">
                  <button
                    type="button"
                    class="icon-btn"
                    title="Rename"
                    (click)="renameWorkbook($event, wb)"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                      <path
                        d="M4 20h4l10-10-4-4L4 16v4z"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="icon-btn danger"
                    title="Delete"
                    [disabled]="workbooks().length <= 1"
                    (click)="deleteWorkbook($event, wb)"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                      <path
                        d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </span>
              </li>
            }
          </ul>

          <footer class="pop-foot">
            <button class="foot-btn" type="button" (click)="openInNewWindow()">
              Open in new window
            </button>
          </footer>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .wb-menu {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .trigger {
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-muted);
        width: 22px;
        height: 22px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 2px;
      }
      .trigger:hover {
        background: var(--surface-2);
        color: var(--text);
      }
      .trigger[aria-expanded='true'] {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .popover {
        position: absolute;
        top: calc(100% + 6px);
        left: -60px;
        min-width: 300px;
        max-width: 360px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.12));
        z-index: 40;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .pop-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px 8px;
        border-bottom: 1px solid var(--border);
      }
      .pop-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--text-muted);
      }
      .new-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--accent-soft);
        color: var(--accent);
        border: none;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
      }
      .new-btn:hover {
        filter: brightness(0.95);
      }
      .wb-list {
        list-style: none;
        margin: 0;
        padding: 4px;
        max-height: 260px;
        overflow-y: auto;
      }
      .wb-row {
        display: grid;
        grid-template-columns: 16px 1fr auto auto;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        color: var(--text);
        font-size: 13px;
      }
      .wb-row:hover {
        background: var(--surface-2);
      }
      .wb-row.active {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .wb-check {
        display: inline-flex;
        justify-content: center;
        color: var(--accent);
      }
      .wb-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
      }
      .wb-meta {
        font-size: 11px;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
      }
      .wb-actions {
        display: inline-flex;
        gap: 2px;
        opacity: 0;
        transition: opacity 100ms;
      }
      .wb-row:hover .wb-actions {
        opacity: 1;
      }
      .icon-btn {
        background: transparent;
        border: none;
        color: var(--text-muted);
        width: 22px;
        height: 22px;
        border-radius: 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover {
        background: var(--surface);
        color: var(--text);
      }
      .icon-btn.danger:hover {
        color: var(--danger, #d43f3f);
      }
      .icon-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .pop-foot {
        border-top: 1px solid var(--border);
        padding: 6px;
      }
      .foot-btn {
        width: 100%;
        background: transparent;
        border: none;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 12px;
        color: var(--text-muted);
        text-align: left;
      }
      .foot-btn:hover {
        background: var(--surface-2);
        color: var(--text);
      }
    `,
  ],
})
export class WorkbookMenuComponent {
  protected readonly store = inject(EditorStore);
  protected readonly workbookService = inject(WorkbookService);
  private readonly modal = inject(ModalService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly activeId = computed(() => this.store.workspaceId());
  protected readonly workbooks = computed(() => this.workbookService.workbooks());

  protected toggleOpen(ev: Event): void {
    ev.stopPropagation();
    this.open.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const el = this.host.nativeElement as HTMLElement;
    if (!el.contains(ev.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) this.open.set(false);
  }

  protected switchTo(wb: WorkbookMeta): void {
    if (wb.id === this.activeId()) {
      this.open.set(false);
      return;
    }
    this.open.set(false);
    this.store.switchTo(wb.id);
  }

  protected async createNew(): Promise<void> {
    const name = await this.modal.prompt({
      title: 'New workbook',
      message: 'Name your new workbook.',
      default: 'Untitled',
      confirmLabel: 'Create',
    });
    if (name === null) return;
    const meta = await this.workbookService.create(name);
    this.open.set(false);
    this.store.switchTo(meta.id);
  }

  protected async renameWorkbook(ev: Event, wb: WorkbookMeta): Promise<void> {
    ev.stopPropagation();
    const name = await this.modal.prompt({
      title: 'Rename workbook',
      default: wb.name,
      confirmLabel: 'Rename',
    });
    if (name === null) return;
    await this.workbookService.rename(wb.id, name);
    if (wb.id === this.activeId()) {
      this.store.setWorkspaceName(name);
    }
  }

  protected async deleteWorkbook(ev: Event, wb: WorkbookMeta): Promise<void> {
    ev.stopPropagation();
    if (this.workbooks().length <= 1) return;
    const ok = await this.modal.confirm({
      title: 'Delete workbook?',
      message: `"${wb.name}" and its contents will be removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const wasActive = wb.id === this.activeId();
    await this.workbookService.remove(wb.id);
    if (wasActive) {
      const next = this.workbooks()[0];
      if (next) this.store.switchTo(next.id);
    }
  }

  protected openInNewWindow(): void {
    this.open.set(false);
    this.store.openNewWindow();
  }

  protected relative(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  }
}
