import { NgZone, WritableSignal } from '@angular/core';
import * as Y from 'yjs';

/**
 * Observe a top-level Y.Map of Y.Maps and rebuild an array signal on every
 * transaction. Uses observeDeep so nested-map mutations (e.g. state.label) also
 * trigger the rebuild.
 *
 * Cost note: this rebuilds the full POJO array on every transaction, then calls
 * sig.set() which retriggers every downstream computed. At prototype scale
 * (5000 states / 10000 transitions caps) this is acceptable. If profiling
 * shows churn, upgrade to per-entry observers or coalesce identity by
 * (id, y-map-clock).
 */
export function bindMapToSignal<T>(
  ymap: Y.Map<Y.Map<unknown>>,
  sig: WritableSignal<T[]>,
  toPojo: (id: string, item: Y.Map<unknown>) => T,
  zone: NgZone,
): () => void {
  const rebuild = () => {
    const out: T[] = [];
    ymap.forEach((entry, id) => out.push(toPojo(id, entry)));
    zone.run(() => sig.set(out));
  };
  ymap.observeDeep(rebuild);
  rebuild();
  return () => ymap.unobserveDeep(rebuild);
}

/**
 * Observe a Y.Map<{ key: primitive }> for a single string key and mirror it to
 * a signal. Used for the meta map (startId).
 */
export function bindMapKeyToSignal<T>(
  ymap: Y.Map<unknown>,
  key: string,
  sig: WritableSignal<T | null>,
  zone: NgZone,
): () => void {
  const rebuild = () => {
    const value = ymap.get(key) as T | undefined;
    zone.run(() => sig.set(value ?? null));
  };
  const handler = (event: Y.YMapEvent<unknown>) => {
    if (event.keysChanged.has(key)) rebuild();
  };
  ymap.observe(handler);
  rebuild();
  return () => ymap.unobserve(handler);
}

/**
 * Observe a Y.Text and mirror its string content to a signal.
 */
export function bindTextToSignal(
  ytext: Y.Text,
  sig: WritableSignal<string>,
  zone: NgZone,
): () => void {
  const rebuild = () => {
    const value = ytext.toString();
    zone.run(() => sig.set(value));
  };
  ytext.observe(rebuild);
  rebuild();
  return () => ytext.unobserve(rebuild);
}

/**
 * Replace the text content of a Y.Text with the given string in one transaction.
 * Used for workspaceName setter (we don't need character-level CRDT for a name).
 */
export function replaceText(ytext: Y.Text, next: string): void {
  const current = ytext.toString();
  if (current === next) return;
  ytext.doc?.transact(() => {
    if (current.length > 0) ytext.delete(0, current.length);
    if (next.length > 0) ytext.insert(0, next);
  });
}
