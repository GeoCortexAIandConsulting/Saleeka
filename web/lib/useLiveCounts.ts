'use client';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

export type LiveCounts = Record<string, { likes: number; comments: number }>;

/** How often the counts refresh while the page is on screen. */
const EVERY_MS = 15_000;
/** The server answers up to this many looks per request. */
const CHUNK = 60;

/**
 * Keeps the like and comment counts of the looks on screen live: asks the server every 15 seconds
 * while the tab is visible (and straight away when it comes back), never while it is hidden.
 */
export function useLiveCounts(ids: string[], apply: (counts: LiveCounts) => void) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const key = ids.join(',');

  useEffect(() => {
    if (!key) return;
    const list = key.split(',');
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      const counts: LiveCounts = {};
      for (let i = 0; i < list.length; i += CHUNK) {
        const ids = list.slice(i, i + CHUNK).join(',');
        try {
          Object.assign(counts, (await api<{ counts: LiveCounts }>(`/feed/counts?ids=${encodeURIComponent(ids)}`)).counts);
        } catch {
          return; // offline or busy: try again next time
        }
      }
      if (!stopped) applyRef.current(counts);
    };
    const t = setInterval(refresh, EVERY_MS);
    const onShow = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [key]);
}

/** A look with the latest counts (the same object when nothing changed, so React skips the render). */
export function withCounts<T extends { id: string; up: number; comments: number }>(look: T, counts: LiveCounts): T {
  const c = counts[look.id];
  return c && (c.likes !== look.up || c.comments !== look.comments) ? { ...look, up: c.likes, comments: c.comments } : look;
}
