import { Injectable, NgZone, effect, inject, signal } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Awareness } from 'y-protocols/awareness';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { EditorStore, LOCAL_ORIGIN } from './editor-store';

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'local';

const LOCAL_WORKSPACE_ID = 'local';

export interface PeerPresence {
  clientId: number;
  userId: string;
  name: string;
  initials: string;
  color: string;
  selection?: { stateIds: string[]; transitionIds: string[] };
  editing?: { kind: 'state' | 'transition'; id: string };
  cursor?: { x: number; y: number };
}

interface LocalUserAwareness {
  userId: string;
  name: string;
  initials: string;
  color: string;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForUser(id: string): string {
  const hue = hashString(id) % 360;
  return `hsl(${hue}, 65%, 52%)`;
}

function initialsFor(name: string, email: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  const local = (email || '').split('@')[0] ?? '?';
  return local.slice(0, 2).toUpperCase() || '??';
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly auth = inject(AuthService);
  private readonly editor = inject(EditorStore);
  private readonly zone = inject(NgZone);

  readonly workspaces = signal<WorkspaceSummary[]>([]);
  readonly currentWorkspaceId = signal<string | null>(null);
  readonly currentRole = signal<'owner' | 'editor' | 'viewer' | null>(null);
  readonly connectionStatus = signal<ConnectionStatus>('disconnected');
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly remotePeers = signal<PeerPresence[]>([]);

  private ydoc: Y.Doc | null = null;
  private idbProvider: IndexeddbPersistence | null = null;
  private wsProvider: WebsocketProvider | null = null;
  private undoManager: Y.UndoManager | null = null;
  private awarenessDispose: (() => void) | null = null;
  private cursorLastEmit = 0;

  constructor() {
    effect(() => {
      if (!this.ready()) return;
      const sel = this.editor.selection();
      this.publishSelection(sel);
    });
  }

  async loadWorkspaces(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.request<{ workspaces: WorkspaceSummary[] }>('GET', '/workspaces');
      this.workspaces.set(list.workspaces);
    } catch (err) {
      this.loadError.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async createWorkspace(name: string): Promise<WorkspaceSummary> {
    const ws = await this.request<WorkspaceSummary>('POST', '/workspaces', { name });
    this.workspaces.update((cur) => [ws, ...cur]);
    return ws;
  }

  async renameWorkspace(id: string, name: string): Promise<void> {
    await this.request<{ ok: true }>('PATCH', `/workspaces/${id}`, { name });
    this.workspaces.update((cur) =>
      cur.map((w) => (w.id === id ? { ...w, name, updatedAt: new Date().toISOString() } : w)),
    );
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.request<{ ok: true }>('DELETE', `/workspaces/${id}`);
    this.workspaces.update((cur) => cur.filter((w) => w.id !== id));
    if (this.currentWorkspaceId() === id) {
      await this.closeWorkspace();
    }
  }

  async openWorkspace(id: string, role: 'owner' | 'editor' | 'viewer' = 'editor'): Promise<void> {
    if (this.currentWorkspaceId() === id && this.ready()) return;
    await this.closeWorkspace();

    const token = await this.auth.getToken();
    if (!token) {
      this.auth.openModal();
      return;
    }

    this.currentWorkspaceId.set(id);
    this.currentRole.set(role);
    this.connectionStatus.set('connecting');

    const ydoc = new Y.Doc();
    this.ydoc = ydoc;

    this.idbProvider = new IndexeddbPersistence(`makina:${id}`, ydoc);
    await this.idbProvider.whenSynced;

    const wsProvider = new WebsocketProvider(environment.collabWsUrl, id, ydoc, {
      params: { token },
    });
    this.wsProvider = wsProvider;

    wsProvider.on('status', ({ status }: { status: ConnectionStatus }) => {
      this.zone.run(() => this.connectionStatus.set(status));
    });

    const undo = new Y.UndoManager(
      [ydoc.getMap('states'), ydoc.getMap('transitions'), ydoc.getMap('meta')],
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 500 },
    );
    this.undoManager = undo;

    this.editor.bind(ydoc, undo, id);
    this.wireAwareness(wsProvider.awareness);
    this.zone.run(() => this.ready.set(true));

    // Update the URL hash so a refresh reopens the same workspace and shareable
    // links continue to work. Keep any non-w= hash params intact.
    if (typeof window !== 'undefined') {
      const parts = window.location.hash.replace(/^#/, '').split('&').filter((p) => !p.startsWith('w='));
      parts.unshift(`w=${id}`);
      window.location.hash = parts.join('&');
    }
  }

  /**
   * Open a local-only workspace backed by IndexedDB. No auth or server
   * required. Used when the user is signed out, or when a signed-in user has
   * no cloud workspaces. Cloud workspaces remain opt-in via the Library panel.
   */
  async openLocalWorkspace(): Promise<void> {
    if (this.currentWorkspaceId() === LOCAL_WORKSPACE_ID && this.ready()) return;
    await this.closeWorkspace();

    this.currentWorkspaceId.set(LOCAL_WORKSPACE_ID);
    this.currentRole.set('owner');
    this.connectionStatus.set('local');

    const ydoc = new Y.Doc();
    this.ydoc = ydoc;

    this.idbProvider = new IndexeddbPersistence(`makina:${LOCAL_WORKSPACE_ID}`, ydoc);
    await this.idbProvider.whenSynced;

    const undo = new Y.UndoManager(
      [ydoc.getMap('states'), ydoc.getMap('transitions'), ydoc.getMap('meta')],
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 500 },
    );
    this.undoManager = undo;

    this.editor.bind(ydoc, undo, LOCAL_WORKSPACE_ID);
    this.zone.run(() => this.ready.set(true));

    // Strip any stale #w=<cloudId> hash so a refresh doesn't try to reopen a
    // cloud workspace the user no longer has access to.
    if (typeof window !== 'undefined') {
      const parts = window.location.hash.replace(/^#/, '').split('&').filter((p) => p && !p.startsWith('w='));
      window.location.hash = parts.join('&');
    }
  }

  async closeWorkspace(): Promise<void> {
    this.ready.set(false);
    this.editor.unbind();
    if (this.awarenessDispose) {
      this.awarenessDispose();
      this.awarenessDispose = null;
    }
    this.remotePeers.set([]);
    if (this.undoManager) {
      this.undoManager.destroy();
      this.undoManager = null;
    }
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    if (this.idbProvider) {
      await this.idbProvider.destroy();
      this.idbProvider = null;
    }
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }
    this.currentWorkspaceId.set(null);
    this.currentRole.set(null);
    this.connectionStatus.set('disconnected');
  }

  private wireAwareness(awareness: Awareness): void {
    const authUser = this.auth.currentUser();
    const email = authUser?.email ?? '';
    const name = [authUser?.firstName, authUser?.lastName].filter(Boolean).join(' ').trim() || email || 'Anonymous';
    const identity = email || `client-${awareness.clientID}`;
    const localUser: LocalUserAwareness = {
      userId: identity,
      name,
      initials: initialsFor(name, email),
      color: colorForUser(identity),
    };
    awareness.setLocalStateField('user', localUser);

    const rebuild = () => {
      const peers: PeerPresence[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const u = state['user'] as LocalUserAwareness | undefined;
        if (!u) return;
        peers.push({
          clientId,
          userId: u.userId,
          name: u.name,
          initials: u.initials,
          color: u.color,
          selection: state['selection'] as PeerPresence['selection'],
          editing: state['editing'] as PeerPresence['editing'],
          cursor: state['cursor'] as PeerPresence['cursor'],
        });
      });
      this.zone.run(() => this.remotePeers.set(peers));
    };
    awareness.on('change', rebuild);
    rebuild();
    this.awarenessDispose = () => {
      awareness.off('change', rebuild);
      awareness.setLocalState(null);
    };
  }

  publishSelection(sel: { stateIds: string[]; transitionIds: string[] } | null): void {
    const a = this.wsProvider?.awareness;
    if (!a) return;
    a.setLocalStateField('selection', sel);
  }

  publishEditing(editing: { kind: 'state' | 'transition'; id: string } | null): void {
    const a = this.wsProvider?.awareness;
    if (!a) return;
    a.setLocalStateField('editing', editing);
  }

  publishCursor(cursor: { x: number; y: number } | null): void {
    const a = this.wsProvider?.awareness;
    if (!a) return;
    if (cursor) {
      const now = performance.now();
      if (now - this.cursorLastEmit < 50) return;
      this.cursorLastEmit = now;
    }
    a.setLocalStateField('cursor', cursor);
  }

  /**
   * Resolve which workspace to open on app boot. Reads #w=<id> from the URL if
   * present; otherwise auto-opens the most-recently-updated workspace, or
   * leaves the state empty if the user has none.
   */
  async bootFromUrl(): Promise<void> {
    const hashId = this.readWorkspaceIdFromUrl();
    await this.loadWorkspaces();

    if (hashId) {
      const match = this.workspaces().find((w) => w.id === hashId);
      if (match) {
        await this.openWorkspace(match.id, match.role);
        return;
      }
      // hash pointed at something we can't open — clear it silently.
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
    }

    const list = this.workspaces();
    if (list.length > 0) {
      const most = list[0]!;
      await this.openWorkspace(most.id, most.role);
      return;
    }

    // Signed in but no cloud workspaces yet — land in a local workspace so
    // the canvas is usable. Users can create a collab workspace explicitly
    // from the Library panel.
    await this.openLocalWorkspace();
  }

  openBlankWindow(): void {
    if (typeof window === 'undefined') return;
    const url = window.location.pathname + (window.location.search ?? '');
    window.open(url, '_blank', 'noopener');
  }

  private readWorkspaceIdFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const m = window.location.hash.match(/w=([a-f0-9]{24})/i);
    return m ? m[1]! : null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.auth.getToken();
    if (!token) {
      this.auth.openModal();
      throw new Error('Not authenticated');
    }
    const res = await fetch(`${environment.collabServerUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `${method} ${path} failed: ${res.status}`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(msg);
    }
    return (await res.json()) as T;
  }
}
