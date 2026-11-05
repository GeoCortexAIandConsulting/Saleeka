/**
 * Scroll state shared with the scenes. It is a plain mutable object on purpose: it changes every frame,
 * and going through React state would re-render the whole 3D tree that often.
 */
export const stage = {
  /** Per scene, how far through its section the page is: below 0 not reached, 0 to 1 pinned, above 1 passed. */
  target: [-1, -1, -1, -1],
  /** The same values eased over time, which is what the scenes read. */
  eased: [-1, -1, -1, -1],
  time: 0,
  reduced: false,
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Eases a piece in from nothing with a slight overshoot, for the look that builds itself. */
export const easeOutBack = (t: number) => {
  const c = 1.4;
  const u = clamp01(t) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/**
 * How present a scene is, from -1 (waiting below the screen) through 0 (centre) to 1 (gone above).
 * The scene slides with the scroll, so no material needs to fade.
 */
export function sceneOffset(p: number): number {
  if (p < 0) return -(1 - smooth(-0.3, 0, p));
  if (p > 1) return smooth(1, 1.3, p);
  return 0;
}
