import type { Product, Profile } from '../types.js';
import { PALETTE } from '../data/palette.js';

/** The features of a product that taste weights are learned over. */
export function productFeatures(p: Product): string[] {
  const feats: string[] = [];
  p.colors.forEach((c, i) => {
    feats.push(`color:${c}`);
    if (i === 0 && PALETTE[c]) feats.push(`family:${PALETTE[c].family}`);
  });
  feats.push(`silhouette:${p.silhouette}`, `fabric:${p.fabric}`, `embell:${p.embellishment}`);
  feats.push(`brand:${p.brandId}`, `tier:${p.tier}`);
  return feats;
}

/** How much a profile is expected to like a product: -1 (dislike) to 1 (love). */
export function tasteScore(taste: Record<string, number>, p: Product): number {
  let sum = 0;
  for (const f of productFeatures(p)) sum += taste[f] ?? 0;
  return Math.tanh(sum / 3);
}

export function addWeight(taste: Record<string, number>, feature: string, delta: number) {
  const next = (taste[feature] ?? 0) + delta;
  taste[feature] = Math.max(-4, Math.min(4, Math.round(next * 100) / 100));
}
