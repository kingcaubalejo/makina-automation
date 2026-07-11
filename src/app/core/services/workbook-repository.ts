import { Automaton } from '../models/automaton';

export interface WorkbookMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkbookRecord extends WorkbookMeta {
  automaton: Automaton;
}

export interface WorkbookRepository {
  list(): Promise<WorkbookMeta[]>;
  get(id: string): Promise<WorkbookRecord | null>;
  create(name?: string): Promise<WorkbookMeta>;
  upsert(meta: WorkbookMeta): Promise<WorkbookMeta>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  touch(id: string): Promise<void>;
  saveDocument(id: string, automaton: Automaton): Promise<void>;
}

const STORAGE_PREFIX = 'makina';
const INDEX_KEY = `${STORAGE_PREFIX}:workbooks`;
const docKey = (id: string) => `${STORAGE_PREFIX}:document:${id}`;
const nameKey = (id: string) => `${STORAGE_PREFIX}:name:${id}`;

export class LocalStorageWorkbookRepository implements WorkbookRepository {
  async list(): Promise<WorkbookMeta[]> {
    return this.readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<WorkbookRecord | null> {
    const meta = this.readIndex().find((m) => m.id === id);
    if (!meta) return null;
    let automaton: Automaton = { states: [], transitions: [] };
    try {
      const raw = localStorage.getItem(docKey(id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.states) && Array.isArray(parsed.transitions)) {
          automaton = parsed;
        }
      }
    } catch {
      // corrupted; return empty
    }
    return { ...meta, automaton };
  }

  async create(name = 'Untitled'): Promise<WorkbookMeta> {
    const now = Date.now();
    const meta: WorkbookMeta = {
      id: 'w_' + Math.random().toString(36).slice(2, 10),
      name: name.trim() || 'Untitled',
      createdAt: now,
      updatedAt: now,
    };
    const index = this.readIndex();
    index.push(meta);
    this.writeIndex(index);
    try {
      localStorage.setItem(nameKey(meta.id), meta.name);
    } catch {
      // ignore quota
    }
    return meta;
  }

  async upsert(meta: WorkbookMeta): Promise<WorkbookMeta> {
    const index = this.readIndex();
    const existing = index.find((m) => m.id === meta.id);
    if (existing) {
      existing.name = meta.name;
      existing.updatedAt = meta.updatedAt;
      this.writeIndex(index);
      return existing;
    }
    index.push(meta);
    this.writeIndex(index);
    try {
      localStorage.setItem(nameKey(meta.id), meta.name);
    } catch {
      // ignore quota
    }
    return meta;
  }

  async rename(id: string, name: string): Promise<void> {
    const clean = name.trim() || 'Untitled';
    const index = this.readIndex();
    const meta = index.find((m) => m.id === id);
    if (!meta) return;
    meta.name = clean;
    meta.updatedAt = Date.now();
    this.writeIndex(index);
    try {
      localStorage.setItem(nameKey(id), clean);
    } catch {
      // ignore quota
    }
  }

  async remove(id: string): Promise<void> {
    const index = this.readIndex().filter((m) => m.id !== id);
    this.writeIndex(index);
    try {
      localStorage.removeItem(docKey(id));
      localStorage.removeItem(nameKey(id));
    } catch {
      // ignore
    }
  }

  async touch(id: string): Promise<void> {
    const index = this.readIndex();
    const meta = index.find((m) => m.id === id);
    if (!meta) return;
    meta.updatedAt = Date.now();
    this.writeIndex(index);
  }

  async saveDocument(id: string, automaton: Automaton): Promise<void> {
    try {
      localStorage.setItem(
        docKey(id),
        JSON.stringify({ states: automaton.states, transitions: automaton.transitions }),
      );
    } catch {
      // ignore quota
    }
    await this.touch(id);
  }

  private readIndex(): WorkbookMeta[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(isValidMeta);
          if (filtered.length) return filtered;
        }
      }
    } catch {
      // fall through to migration
    }
    return this.migrateFromLegacyKeys();
  }

  private writeIndex(index: WorkbookMeta[]): void {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // ignore quota
    }
  }

  private migrateFromLegacyKeys(): WorkbookMeta[] {
    const metas: WorkbookMeta[] = [];
    const now = Date.now();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(`${STORAGE_PREFIX}:name:`)) {
          const id = key.slice(`${STORAGE_PREFIX}:name:`.length);
          const name = localStorage.getItem(key) ?? 'Untitled';
          metas.push({ id, name, createdAt: now, updatedAt: now });
        }
      }
      const hasDefault = metas.some((m) => m.id === 'default');
      if (!hasDefault && localStorage.getItem(docKey('default'))) {
        metas.push({ id: 'default', name: 'Main', createdAt: now, updatedAt: now });
      }
    } catch {
      // ignore
    }
    if (metas.length) this.writeIndex(metas);
    return metas;
  }
}

function isValidMeta(v: unknown): v is WorkbookMeta {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['id'] === 'string' &&
    typeof m['name'] === 'string' &&
    typeof m['createdAt'] === 'number' &&
    typeof m['updatedAt'] === 'number'
  );
}
