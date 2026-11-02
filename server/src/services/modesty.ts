import type { Length, Neckline, Sleeve } from '../types.js';

/**
 * Modesty score from 0 (least covered) to 5 (fully covered), computed from garment
 * attributes. The same function is used for the demo catalog and, later, for real
 * product tags, so a user's coverage setting always means the same thing.
 */
export function modestyScore(a: {
  sleeve?: Sleeve;
  length?: Length;
  neckline?: Neckline;
  sheer?: boolean;
}): number {
  const sleeve = { sleeveless: 0, short: 0.5, 'three-quarter': 1.5, full: 2 }[a.sleeve ?? 'full'];
  const length = { short: 0, knee: 1, midi: 1.5, full: 2 }[a.length ?? 'full'];
  const neck = { open: 0, regular: 0.5, high: 1 }[a.neckline ?? 'regular'];
  const penalty = a.sheer ? 1 : 0;
  return Math.max(0, Math.min(5, sleeve + length + neck - penalty));
}

/** Minimum modesty score a main piece must reach for a given coverage level (1 to 5). */
export function minModestyFor(coverage: number): number {
  return { 1: 1, 2: 2.5, 3: 3.5, 4: 4, 5: 4.5 }[Math.round(coverage)] ?? 2.5;
}

/** Bottoms: judged only on length. */
export function bottomModesty(length: Length): number {
  return { short: 0, knee: 1.5, midi: 3, full: 5 }[length];
}
