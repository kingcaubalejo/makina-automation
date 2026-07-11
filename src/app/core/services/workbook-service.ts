import { Injectable, signal } from '@angular/core';
import {
  LocalStorageWorkbookRepository,
  WorkbookMeta,
  WorkbookRepository,
} from './workbook-repository';

@Injectable({ providedIn: 'root' })
export class WorkbookService {
  private readonly repo: WorkbookRepository = new LocalStorageWorkbookRepository();

  readonly workbooks = signal<WorkbookMeta[]>([]);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const list = await this.repo.list();
    this.workbooks.set(list);
  }

  async ensure(id: string, fallbackName: string): Promise<WorkbookMeta> {
    const list = await this.repo.list();
    this.workbooks.set(list);
    const existing = list.find((m) => m.id === id);
    if (existing) return existing;
    const now = Date.now();
    const meta = await this.repo.upsert({
      id,
      name: (fallbackName || 'Untitled').trim() || 'Untitled',
      createdAt: now,
      updatedAt: now,
    });
    await this.refresh();
    return meta;
  }

  async create(name?: string): Promise<WorkbookMeta> {
    const meta = await this.repo.create(name);
    await this.refresh();
    return meta;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.repo.rename(id, name);
    const clean = name.trim() || 'Untitled';
    this.workbooks.update((list) =>
      list.map((m) => (m.id === id ? { ...m, name: clean, updatedAt: Date.now() } : m)),
    );
  }

  async remove(id: string): Promise<void> {
    await this.repo.remove(id);
    this.workbooks.update((list) => list.filter((m) => m.id !== id));
  }

  async touch(id: string): Promise<void> {
    await this.repo.touch(id);
    this.workbooks.update((list) =>
      list.map((m) => (m.id === id ? { ...m, updatedAt: Date.now() } : m)),
    );
  }
}
