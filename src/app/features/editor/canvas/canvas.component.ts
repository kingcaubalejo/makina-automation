import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { EditorStore } from '../../../core/services/editor-store';
import { AutomatonState, AutomatonTransition } from '../../../core/models/automaton';
import { ModalService } from '../../../shared/modal/modal.service';

interface RenderedTransition {
  t: AutomatonTransition;
  path: string;
  labelX: number;
  labelY: number;
  labelText: string;
  arrowX: number;
  arrowY: number;
  arrowAngle: number;
  selfLoop: boolean;
}

const STATE_R = 32;
const ACCEPT_GAP = 4;

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="canvas-host"
      #host
      (wheel)="onWheel($event)"
      (pointerdown)="onCanvasPointerDown($event)"
      (pointermove)="onCanvasPointerMove($event)"
      (pointerup)="onCanvasPointerUp($event)"
      (pointercancel)="onCanvasPointerUp($event)"
      (dblclick)="onDoubleClick($event)"
      (contextmenu)="onContextMenu($event)"
      [class.tool-state]="store.tool() === 'state'"
      [class.tool-pan]="store.tool() === 'pan' || spaceHeld()"
      [class.tool-erase]="store.tool() === 'erase'"
      [class.tool-transition]="store.tool() === 'transition'"
    >
      <svg class="canvas" [attr.viewBox]="viewBox()" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill="var(--text)" />
          </marker>
          <marker
            id="arrow-accent"
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill="var(--accent)" />
          </marker>
        </defs>

        <!-- transitions layer -->
        <g class="transitions">
          @for (rt of renderedTransitions(); track rt.t.id) {
            <g
              class="transition"
              [class.selected]="isTransitionSelected(rt.t.id)"
              (pointerdown)="onTransitionPointerDown($event, rt.t.id)"
            >
              <path class="hit" [attr.d]="rt.path" />
              <path class="line" [attr.d]="rt.path" />
              <polygon
                class="arrowhead"
                [attr.points]="arrowPoints(rt)"
              />
              <g [attr.transform]="'translate(' + rt.labelX + ',' + rt.labelY + ')'">
                <rect
                  class="label-bg"
                  [attr.x]="-labelWidth(rt.labelText) / 2 - 6"
                  y="-11"
                  [attr.width]="labelWidth(rt.labelText) + 12"
                  height="22"
                  rx="6"
                />
                <text class="label" text-anchor="middle" dy="4">{{ rt.labelText }}</text>
              </g>
            </g>
          }

          @if (store.transitionDraft(); as draft) {
            <path
              class="draft-line"
              [attr.d]="draftPath(draft.fromId)"
              marker-end="url(#arrow-accent)"
            />
          }
        </g>

        <!-- states layer -->
        <g class="states">
          @for (s of store.states(); track s.id) {
            <g
              class="state"
              [attr.data-state-id]="s.id"
              [class.selected]="isStateSelected(s.id)"
              [class.active]="store.activeStates().has(s.id)"
              [class.start]="s.isStart"
              [attr.transform]="'translate(' + s.x + ',' + s.y + ')'"
              (pointerdown)="onStatePointerDown($event, s.id)"
              (dblclick)="onStateDoubleClick($event, s.id)"
            >
              @if (s.isStart) {
                <path class="start-arrow" [attr.d]="startArrowPath()" marker-end="url(#arrow)" />
              }
              <circle class="ring" [attr.r]="STATE_R" />
              @if (s.isAccept) {
                <circle class="ring-accept" [attr.r]="STATE_R - ACCEPT_GAP - 1.5" fill="none" />
              }
              <text class="state-label" text-anchor="middle" dy="5">{{ s.label }}</text>
            </g>
          }
        </g>

        <!-- marquee -->
        @if (marquee(); as m) {
          <rect
            class="marquee"
            [attr.x]="Math.min(m.x0, m.x1)"
            [attr.y]="Math.min(m.y0, m.y1)"
            [attr.width]="Math.abs(m.x1 - m.x0)"
            [attr.height]="Math.abs(m.y1 - m.y0)"
          />
        }
      </svg>

      <div class="hud">
        <button class="hud-btn" (click)="store.tidyLayout()" title="Tidy layout">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <button
          class="hud-btn hud-danger"
          (click)="deleteAll()"
          [disabled]="store.states().length === 0 && store.transitions().length === 0"
          title="Delete all (clears the canvas)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M6 6l1 14h10l1-14"/>
            <line x1="10" y1="10" x2="10" y2="17"/>
            <line x1="14" y1="10" x2="14" y2="17"/>
          </svg>
        </button>
        <span class="hud-divider"></span>
        <button class="hud-btn" (click)="zoomIn()" title="Zoom in">+</button>
        <button class="hud-btn" (click)="zoomOut()" title="Zoom out">−</button>
        <button class="hud-btn" (click)="resetView()" title="Reset view">⌖</button>
        <span class="zoom-label">{{ (store.viewport().scale * 100) | number:'1.0-0' }}%</span>
      </div>

      @if (contextMenu(); as cm) {
        <div
          class="ctx-menu"
          [style.left.px]="cm.x"
          [style.top.px]="cm.y"
          (pointerdown)="$event.stopPropagation()"
        >
          <button class="ctx-item" (click)="ctxMakeStart(cm.stateId)">
            <span class="ctx-icon">▶</span> Mark as start <span class="ctx-kbd">G</span>
          </button>
          <button class="ctx-item" (click)="ctxToggleAccept(cm.stateId)">
            <span class="ctx-icon">◎</span>
            {{ isAccept(cm.stateId) ? 'Unmark final' : 'Mark as final' }}
            <span class="ctx-kbd">F</span>
          </button>
          <button class="ctx-item" (click)="ctxRename(cm.stateId)">
            <span class="ctx-icon">✎</span> Rename…
          </button>
          <span class="ctx-sep"></span>
          <button class="ctx-item ctx-danger" (click)="ctxDelete(cm.stateId)">
            <span class="ctx-icon">×</span> Delete <span class="ctx-kbd">⌫</span>
          </button>
        </div>
      }

      @if (store.states().length === 0) {
        <div class="empty">
          <div class="empty-card">
            <div class="empty-title">Start building your automaton</div>
            <div class="empty-body">
              Pick the <strong>State</strong> tool and click anywhere, or load a sample from the
              side panel. Use the <strong>Transition</strong> tool to draw arrows by clicking
              two states in turn.
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
      .canvas-host {
        position: absolute;
        inset: 0;
        background: var(--bg);
        cursor: default;
        touch-action: none;
      }
      .canvas-host.tool-state { cursor: crosshair; }
      .canvas-host.tool-pan { cursor: grab; }
      .canvas-host.tool-pan:active { cursor: grabbing; }
      .canvas-host.tool-erase { cursor: not-allowed; }
      .canvas-host.tool-transition { cursor: cell; }

      svg.canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        user-select: none;
      }

      .state .ring {
        fill: var(--surface);
        stroke: var(--border-strong);
        stroke-width: 1.5;
        transition: fill 120ms, stroke 120ms;
      }
      .state .ring-accept {
        stroke: var(--text);
        stroke-width: 1.5;
        fill: none;
      }
      .state.start .ring { stroke: var(--accent); }
      .state.start .ring-accept { stroke: var(--accent); }
      .state.selected .ring { stroke: var(--accent); stroke-width: 2.5; }
      .state.selected .ring-accept { stroke: var(--accent); stroke-width: 2.5; }
      .state.active .ring {
        fill: var(--accent-soft);
        stroke: var(--accent);
        stroke-width: 2.5;
      }
      .state.active .ring-accept { stroke: var(--accent); }
      .state-label {
        font-family: "Newsreader", ui-serif, Georgia, serif;
        font-style: italic;
        font-size: 17px;
        font-weight: 500;
        fill: var(--text);
        pointer-events: none;
      }
      .start-arrow {
        fill: none;
        stroke: var(--text);
        stroke-width: 1.5;
      }

      .transition .hit {
        fill: none;
        stroke: transparent;
        stroke-width: 18;
        pointer-events: stroke;
        cursor: pointer;
      }
      .transition .line {
        fill: none;
        stroke: var(--text);
        stroke-width: 1.5;
      }
      .transition .arrowhead {
        fill: var(--text);
      }
      .transition.selected .line { stroke: var(--accent); stroke-width: 2.2; }
      .transition.selected .arrowhead { fill: var(--accent); }
      .transition .label-bg {
        fill: var(--surface);
        stroke: var(--border);
      }
      .transition .label {
        font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11px;
        font-weight: 500;
        fill: var(--text);
        pointer-events: none;
      }
      .transition.selected .label-bg {
        stroke: var(--accent);
      }
      .transition.selected .label {
        fill: var(--accent);
      }
      .draft-line {
        fill: none;
        stroke: var(--accent);
        stroke-dasharray: 6 4;
        stroke-width: 1.5;
      }
      .marquee {
        fill: rgba(99, 102, 241, 0.08);
        stroke: var(--accent);
        stroke-dasharray: 4 4;
      }
      .hud {
        position: absolute;
        bottom: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 4px 10px 4px 4px;
        box-shadow: var(--shadow);
      }
      .hud-btn {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--text);
        font-size: 16px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .hud-btn:hover { background: var(--surface-2); }
      .hud-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .hud-btn:disabled:hover { background: transparent; }
      .hud-danger { color: var(--danger); }
      .hud-danger:hover { background: color-mix(in srgb, var(--danger) 10%, var(--surface-2)); }
      .hud-divider {
        width: 1px;
        height: 18px;
        background: var(--border);
        margin: 0 2px;
      }
      .zoom-label {
        font-size: 12px;
        color: var(--text-muted);
        margin-left: 4px;
        min-width: 38px;
        text-align: right;
      }

      .ctx-menu {
        position: absolute;
        z-index: 5;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        box-shadow: var(--shadow-lg);
        padding: 4px;
        min-width: 200px;
        display: flex;
        flex-direction: column;
      }
      .ctx-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        background: transparent;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        color: var(--text);
        text-align: left;
      }
      .ctx-item:hover { background: var(--surface-2); }
      .ctx-icon {
        width: 16px;
        text-align: center;
        font-size: 12px;
        color: var(--text-muted);
      }
      .ctx-kbd {
        margin-left: auto;
        font-size: 10px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        color: var(--text-muted);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 1px 5px;
      }
      .ctx-sep {
        height: 1px;
        background: var(--border);
        margin: 4px 6px;
      }
      .ctx-danger { color: var(--danger); }
      .ctx-danger:hover { background: color-mix(in srgb, var(--danger) 8%, var(--surface-2)); }

      .empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        pointer-events: none;
      }
      .empty-card {
        max-width: 320px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px 18px;
        box-shadow: var(--shadow);
        text-align: center;
      }
      .empty-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .empty-body {
        font-size: 13px;
        color: var(--text-muted);
        line-height: 1.45;
      }
    `,
  ],
})
export class CanvasComponent {
  protected readonly store = inject(EditorStore);
  protected readonly modal = inject(ModalService);
  protected readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly STATE_R = STATE_R;
  protected readonly ACCEPT_GAP = ACCEPT_GAP;
  protected readonly Math = Math;

  protected readonly spaceHeld = signal(false);
  protected readonly marquee = signal<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null
  );
  protected readonly contextMenu = signal<{ x: number; y: number; stateId: string } | null>(null);

  private dragState:
    | { kind: 'state'; ids: string[]; startX: number; startY: number; original: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
    | { kind: 'marquee'; startX: number; startY: number }
    | null = null;

  constructor() {
    afterNextRender(() => {
      const v = this.store.viewport();
      if (v.x === 0 && v.y === 0 && v.scale === 1 && this.store.states().length === 0) {
        const rect = this.host().nativeElement.getBoundingClientRect();
        this.store.setViewport({ x: rect.width / 2, y: rect.height / 2 });
      }
    });
  }

  protected readonly viewBox = computed(() => {
    const v = this.store.viewport();
    const rect = this.hostRect();
    const w = rect.width / v.scale;
    const h = rect.height / v.scale;
    return `${-v.x / v.scale} ${-v.y / v.scale} ${w} ${h}`;
  });

  private hostRect(): { width: number; height: number } {
    const el = this.host()?.nativeElement;
    if (!el) return { width: 1200, height: 800 };
    const r = el.getBoundingClientRect();
    return { width: Math.max(r.width, 100), height: Math.max(r.height, 100) };
  }

  protected readonly renderedTransitions = computed<RenderedTransition[]>(() => {
    const states = new Map(this.store.states().map((s) => [s.id, s]));
    const transitions = this.store.transitions();
    const pairs = new Set<string>();
    for (const t of transitions) {
      pairs.add(`${t.fromId}|${t.toId}`);
    }
    const out: RenderedTransition[] = [];
    for (const t of transitions) {
      const from = states.get(t.fromId);
      const to = states.get(t.toId);
      if (!from || !to) continue;
      const labelText = t.symbols.join(', ');
      if (from.id === to.id) {
        out.push(this.computeSelfLoop(t, from, labelText));
      } else {
        const reverseExists = pairs.has(`${t.toId}|${t.fromId}`);
        out.push(this.computeStraight(t, from, to, labelText, reverseExists));
      }
    }
    return out;
  });

  private computeSelfLoop(
    t: AutomatonTransition,
    s: AutomatonState,
    labelText: string
  ): RenderedTransition {
    const r = STATE_R;
    const cx = s.x;
    const cy = s.y;
    const startX = cx - 12;
    const startY = cy - r;
    const endX = cx + 12;
    const endY = cy - r;
    const c1x = cx - 60;
    const c1y = cy - r - 70;
    const c2x = cx + 60;
    const c2y = cy - r - 70;
    return {
      t,
      path: `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`,
      labelX: cx,
      labelY: cy - r - 56,
      labelText,
      arrowX: endX,
      arrowY: endY,
      arrowAngle: 60,
      selfLoop: true,
    };
  }

  private computeStraight(
    t: AutomatonTransition,
    from: AutomatonState,
    to: AutomatonState,
    labelText: string,
    reverseExists: boolean
  ): RenderedTransition {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const offset = reverseExists ? 22 : 0;
    const px = -uy;
    const py = ux;

    const startX = from.x + ux * STATE_R + px * offset;
    const startY = from.y + uy * STATE_R + py * offset;
    const endX = to.x - ux * STATE_R + px * offset;
    const endY = to.y - uy * STATE_R + py * offset;

    let path: string;
    let labelX: number;
    let labelY: number;
    let arrowAngle: number;

    if (reverseExists) {
      const midX = (startX + endX) / 2 + px * 18;
      const midY = (startY + endY) / 2 + py * 18;
      path = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
      labelX = midX + px * 10;
      labelY = midY + py * 10;
      arrowAngle = (Math.atan2(endY - midY, endX - midX) * 180) / Math.PI;
    } else {
      path = `M ${startX} ${startY} L ${endX} ${endY}`;
      labelX = (startX + endX) / 2 + px * 14;
      labelY = (startY + endY) / 2 + py * 14;
      arrowAngle = (Math.atan2(uy, ux) * 180) / Math.PI;
    }

    return {
      t,
      path,
      labelX,
      labelY,
      labelText,
      arrowX: endX,
      arrowY: endY,
      arrowAngle,
      selfLoop: false,
    };
  }

  protected arrowPoints(rt: RenderedTransition): string {
    const size = 9;
    const angle = (rt.arrowAngle * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tipX = rt.arrowX;
    const tipY = rt.arrowY;
    const baseX = tipX - cos * size;
    const baseY = tipY - sin * size;
    const p1x = baseX + sin * (size * 0.55);
    const p1y = baseY - cos * (size * 0.55);
    const p2x = baseX - sin * (size * 0.55);
    const p2y = baseY + cos * (size * 0.55);
    return `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`;
  }

  protected labelWidth(text: string): number {
    return Math.max(16, text.length * 7.2);
  }

  protected startArrowPath(): string {
    return `M ${-STATE_R - 28} 0 L ${-STATE_R - 4} 0`;
  }

  protected draftPath(fromId: string): string {
    const from = this.store.states().find((s) => s.id === fromId);
    if (!from) return '';
    const pt = this.cursorWorld;
    if (!pt) return '';
    const dx = pt.x - from.x;
    const dy = pt.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = from.x + ux * STATE_R;
    const sy = from.y + uy * STATE_R;
    return `M ${sx} ${sy} L ${pt.x} ${pt.y}`;
  }

  private cursorWorld: { x: number; y: number } | null = null;

  protected isStateSelected(id: string): boolean {
    return this.store.selection().stateIds.includes(id);
  }
  protected isTransitionSelected(id: string): boolean {
    return this.store.selection().transitionIds.includes(id);
  }

  protected onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.store.zoomBy(factor, ev.clientX - rect.left, ev.clientY - rect.top);
  }

  protected onCanvasPointerDown(ev: PointerEvent): void {
    if (this.contextMenu()) this.contextMenu.set(null);
    if (ev.button !== 0 || !ev.isPrimary) return;
    const target = ev.target as Element;
    const onState = target.closest('.state');
    const onTransition = target.closest('.transition');
    if (onState || onTransition) return;

    const tool = this.store.tool();
    const world = this.toWorld(ev);

    if (tool === 'state') {
      const created = this.store.addState(world.x, world.y);
      this.store.selectOnly([created.id]);
      return;
    }

    if (tool === 'pan' || this.spaceHeld()) {
      this.dragState = {
        kind: 'pan',
        startX: ev.clientX,
        startY: ev.clientY,
        vx: this.store.viewport().x,
        vy: this.store.viewport().y,
      };
      this.capturePointer(ev);
      return;
    }

    if (tool === 'transition' && this.store.transitionDraft()) {
      this.store.cancelTransition();
      return;
    }

    if (tool === 'select') {
      if (!ev.shiftKey) this.store.clearSelection();
      this.dragState = { kind: 'marquee', startX: world.x, startY: world.y };
      this.marquee.set({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
      this.capturePointer(ev);
    }
  }

  protected onCanvasPointerMove(ev: PointerEvent): void {
    const world = this.toWorld(ev);
    this.cursorWorld = world;

    if (!this.dragState) {
      if (this.store.transitionDraft()) {
        // trigger re-render of draft path
        this.store.transitionDraft.update((d) => (d ? { ...d } : null));
      }
      return;
    }

    if (this.dragState.kind === 'pan') {
      const dx = ev.clientX - this.dragState.startX;
      const dy = ev.clientY - this.dragState.startY;
      this.store.setViewport({ x: this.dragState.vx + dx, y: this.dragState.vy + dy });
      return;
    }

    if (this.dragState.kind === 'state') {
      const ds = this.dragState;
      ds.moved = true;
      const dx = world.x - ds.startX;
      const dy = world.y - ds.startY;
      for (const id of ds.ids) {
        const orig = ds.original.get(id);
        if (!orig) continue;
        this.store.moveState(id, orig.x + dx, orig.y + dy);
      }
      return;
    }

    if (this.dragState.kind === 'marquee') {
      this.marquee.set({
        x0: this.dragState.startX,
        y0: this.dragState.startY,
        x1: world.x,
        y1: world.y,
      });
    }
  }

  protected onCanvasPointerUp(_ev: PointerEvent): void {
    if (!this.dragState) return;
    if (this.dragState.kind === 'marquee') {
      const m = this.marquee();
      if (m) {
        const x0 = Math.min(m.x0, m.x1);
        const x1 = Math.max(m.x0, m.x1);
        const y0 = Math.min(m.y0, m.y1);
        const y1 = Math.max(m.y0, m.y1);
        const stateIds = this.store
          .states()
          .filter((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1)
          .map((s) => s.id);
        const stateIdSet = new Set(stateIds);
        const transitionIds = this.renderedTransitions()
          .filter((rt) => {
            const labelInside =
              rt.labelX >= x0 && rt.labelX <= x1 && rt.labelY >= y0 && rt.labelY <= y1;
            const bothEndsInside =
              stateIdSet.has(rt.t.fromId) && stateIdSet.has(rt.t.toId);
            return labelInside || bothEndsInside;
          })
          .map((rt) => rt.t.id);
        if (stateIds.length || transitionIds.length) {
          this.store.selectOnly(stateIds, transitionIds);
        }
      }
      this.marquee.set(null);
    }
    this.dragState = null;
  }

  protected onStatePointerDown(ev: PointerEvent, id: string): void {
    if (ev.button !== 0 || !ev.isPrimary) return;
    ev.stopPropagation();

    const tool = this.store.tool();

    if (tool === 'erase') {
      this.store.selectOnly([id]);
      this.store.deleteSelected();
      return;
    }

    if (tool === 'transition') {
      const draft = this.store.transitionDraft();
      if (!draft) {
        this.store.beginTransition(id);
      } else {
        this.promptTransitionSymbols(id);
      }
      return;
    }

    if (tool === 'select' || tool === 'state' || tool === 'pan') {
      const additive = ev.shiftKey;
      const sel = this.store.selection();
      const alreadySelected = sel.stateIds.includes(id);
      if (!alreadySelected) {
        this.store.toggleSelectState(id, additive);
      }
      const ids = this.store.selection().stateIds.length
        ? this.store.selection().stateIds
        : [id];
      const original = new Map(
        this.store
          .states()
          .filter((s) => ids.includes(s.id))
          .map((s) => [s.id, { x: s.x, y: s.y }])
      );
      const world = this.toWorld(ev);
      this.dragState = {
        kind: 'state',
        ids,
        startX: world.x,
        startY: world.y,
        original,
        moved: false,
      };
      this.capturePointer(ev);
    }
  }

  protected async onStateDoubleClick(ev: MouseEvent, id: string): Promise<void> {
    ev.stopPropagation();
    const state = this.store.states().find((s) => s.id === id);
    if (!state) return;
    const next = await this.modal.prompt({
      title: 'Rename state',
      default: state.label,
      placeholder: 'e.g. q3',
      confirmLabel: 'Rename',
    });
    if (next !== null && next.trim()) {
      this.store.setStateLabel(id, next.trim());
    }
  }

  protected onTransitionPointerDown(ev: PointerEvent, id: string): void {
    if (ev.button !== 0 || !ev.isPrimary) return;
    ev.stopPropagation();
    if (this.store.tool() === 'erase') {
      this.store.selectOnly([], [id]);
      this.store.deleteSelected();
      return;
    }
    this.store.toggleSelectTransition(id, ev.shiftKey);
  }

  protected onDoubleClick(ev: MouseEvent): void {
    if ((ev.target as Element).closest('.state')) return;
    if ((ev.target as Element).closest('.transition')) {
      const transitionEl = (ev.target as Element).closest('.transition');
      if (!transitionEl) return;
      // not implemented: edit by double-click on transition (handled in panel)
      return;
    }
    const tool = this.store.tool();
    if (tool !== 'state') {
      const world = this.toWorld(ev);
      const created = this.store.addState(world.x, world.y);
      this.store.selectOnly([created.id]);
    }
  }

  protected onContextMenu(ev: MouseEvent): void {
    const target = ev.target as Element;
    const stateEl = target.closest('.state') as SVGGElement | null;
    if (!stateEl) {
      this.contextMenu.set(null);
      return;
    }
    ev.preventDefault();
    const id = stateEl.getAttribute('data-state-id');
    if (!id) return;
    this.store.selectOnly([id]);
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.contextMenu.set({
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
      stateId: id,
    });
  }

  protected isAccept(id: string): boolean {
    return this.store.states().find((s) => s.id === id)?.isAccept ?? false;
  }

  protected ctxMakeStart(id: string): void {
    this.store.setStart(id);
    this.contextMenu.set(null);
  }

  protected ctxToggleAccept(id: string): void {
    this.store.toggleAccept(id);
    this.contextMenu.set(null);
  }

  protected async ctxRename(id: string): Promise<void> {
    this.contextMenu.set(null);
    const state = this.store.states().find((s) => s.id === id);
    if (!state) return;
    const next = await this.modal.prompt({
      title: 'Rename state',
      default: state.label,
      placeholder: 'e.g. q3',
      confirmLabel: 'Rename',
    });
    if (next !== null && next.trim()) this.store.setStateLabel(id, next.trim());
  }

  protected ctxDelete(id: string): void {
    this.store.selectOnly([id]);
    this.store.deleteSelected();
    this.contextMenu.set(null);
  }

  private async promptTransitionSymbols(toId: string): Promise<void> {
    const draft = this.store.transitionDraft();
    if (!draft) return;
    const sym = await this.modal.prompt({
      title: 'Add transition',
      message: 'Comma-separated symbols. Type ε, eps, or epsilon for an epsilon transition.',
      default: 'a',
      placeholder: 'a, b, ε',
      confirmLabel: 'Add',
    });
    if (sym === null) {
      this.store.cancelTransition();
      return;
    }
    const parsed = parseSymbols(sym);
    if (parsed.length === 0) {
      this.store.cancelTransition();
      return;
    }
    this.store.completeTransition(toId, parsed);
  }

  protected zoomIn(): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.store.zoomBy(1.2, rect.width / 2, rect.height / 2);
  }
  protected zoomOut(): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.store.zoomBy(1 / 1.2, rect.width / 2, rect.height / 2);
  }
  protected resetView(): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.store.setViewport({ x: rect.width / 2, y: rect.height / 2, scale: 1 });
  }

  protected async deleteAll(): Promise<void> {
    if (this.store.states().length === 0 && this.store.transitions().length === 0) return;
    const ok = await this.modal.confirm({
      title: 'Delete everything?',
      message:
        'This removes every state and transition from the canvas. You can undo with ⌘Z.',
      confirmLabel: 'Delete all',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (ok) this.store.clear();
  }

  private toWorld(ev: MouseEvent): { x: number; y: number } {
    const rect = this.host().nativeElement.getBoundingClientRect();
    const v = this.store.viewport();
    return {
      x: (ev.clientX - rect.left - v.x) / v.scale,
      y: (ev.clientY - rect.top - v.y) / v.scale,
    };
  }

  private capturePointer(ev: PointerEvent): void {
    try {
      this.host().nativeElement.setPointerCapture(ev.pointerId);
    } catch {
      // older browsers or detached elements — fall back to bubble-based events
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (this.isTypingTarget(ev.target)) return;
    if (ev.code === 'Space') {
      this.spaceHeld.set(true);
      ev.preventDefault();
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      this.store.deleteSelected();
      ev.preventDefault();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
      if (ev.shiftKey) this.store.redo();
      else this.store.undo();
      ev.preventDefault();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'y') {
      this.store.redo();
      ev.preventDefault();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'a') {
      this.store.selectAll();
      ev.preventDefault();
    }
    if (!ev.metaKey && !ev.ctrlKey) {
      switch (ev.key.toLowerCase()) {
        case 'v': this.store.setTool('select'); break;
        case 's': this.store.setTool('state'); break;
        case 't': this.store.setTool('transition'); break;
        case 'h': this.store.setTool('pan'); break;
        case 'e': this.store.setTool('erase'); break;
        case 'f':
          for (const id of this.store.selection().stateIds) {
            this.store.toggleAccept(id);
          }
          ev.preventDefault();
          break;
        case 'g':
          for (const id of this.store.selection().stateIds) {
            this.store.setStart(id);
          }
          ev.preventDefault();
          break;
        case 'escape':
          this.store.cancelTransition();
          this.store.clearSelection();
          break;
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(ev: KeyboardEvent): void {
    if (ev.code === 'Space') this.spaceHeld.set(false);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );
  }
}

function parseSymbols(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s === 'eps' || s === 'epsilon' || s === 'ε' ? 'ε' : s));
}
