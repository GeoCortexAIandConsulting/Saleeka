export type ColorFamily = 'neutral' | 'metallic' | 'pastel' | 'warm' | 'jewel' | 'earth';

export const PALETTE: Record<string, { hex: string; family: ColorFamily }> = {
  black: { hex: '#1f1f23', family: 'neutral' },
  white: { hex: '#fafafa', family: 'neutral' },
  ivory: { hex: '#f6efe0', family: 'neutral' },
  beige: { hex: '#d9c3a0', family: 'neutral' },
  grey: { hex: '#9a9aa2', family: 'neutral' },
  brown: { hex: '#6d4c3a', family: 'earth' },
  gold: { hex: '#c9a24a', family: 'metallic' },
  silver: { hex: '#b9bcc4', family: 'metallic' },
  blush: { hex: '#f3c9d0', family: 'pastel' },
  mint: { hex: '#bfe5d3', family: 'pastel' },
  lilac: { hex: '#cdbbea', family: 'pastel' },
  sky: { hex: '#b7d8f2', family: 'pastel' },
  peach: { hex: '#f8c9a8', family: 'pastel' },
  lemon: { hex: '#f6ec9f', family: 'pastel' },
  mustard: { hex: '#d4a017', family: 'warm' },
  orange: { hex: '#e8772e', family: 'warm' },
  red: { hex: '#c8202f', family: 'warm' },
  pink: { hex: '#e0508f', family: 'warm' },
  rust: { hex: '#b4532a', family: 'earth' },
  olive: { hex: '#6b7236', family: 'earth' },
  sage: { hex: '#a3b18a', family: 'earth' },
  maroon: { hex: '#6f1d2b', family: 'jewel' },
  emerald: { hex: '#0f7b5a', family: 'jewel' },
  teal: { hex: '#1c7c84', family: 'jewel' },
  navy: { hex: '#1b2a52', family: 'jewel' },
  royal: { hex: '#2750c4', family: 'jewel' },
  plum: { hex: '#6b2d5c', family: 'jewel' },
};

export const COLOR_NAMES = Object.keys(PALETTE);

/** Pairs that look good together even across families (order-independent). */
const CONTRAST_PAIRS: Array<[string, string]> = [
  ['emerald', 'gold'],
  ['maroon', 'gold'],
  ['maroon', 'mustard'],
  ['navy', 'peach'],
  ['navy', 'blush'],
  ['teal', 'rust'],
  ['plum', 'mint'],
  ['royal', 'gold'],
  ['olive', 'mustard'],
  ['red', 'ivory'],
  ['sage', 'blush'],
  ['lilac', 'sage'],
  ['sky', 'peach'],
  ['pink', 'mint'],
];

/** 0 to 1: how well two colours go together. */
export function harmony(a: string, b: string): number {
  if (a === b) return 0.9;
  const pa = PALETTE[a];
  const pb = PALETTE[b];
  if (!pa || !pb) return 0.3;
  if (pa.family === 'neutral' || pb.family === 'neutral') return 0.85;
  if (pa.family === 'metallic' || pb.family === 'metallic') return 0.8;
  if (CONTRAST_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return 0.85;
  if (pa.family === pb.family) return 0.7;
  if (
    (pa.family === 'pastel' && pb.family === 'earth') ||
    (pb.family === 'pastel' && pa.family === 'earth')
  )
    return 0.65;
  return 0.2;
}

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const NEARBY_HUE_DEGREES = 35;

/** Colours that genuinely read as a close shade of these (teal for emerald); never neutrals or metallics. */
export function nearbyColors(names: string[]): string[] {
  const chromatic = (n: string) => !!PALETTE[n] && !['neutral', 'metallic'].includes(PALETTE[n].family);
  return COLOR_NAMES.filter(
    (c) =>
      chromatic(c) &&
      !names.includes(c) &&
      names.some((n) => {
        if (!chromatic(n)) return false;
        const gap = Math.abs(hueOf(PALETTE[n].hex) - hueOf(PALETTE[c].hex));
        return Math.min(gap, 360 - gap) <= NEARBY_HUE_DEGREES;
      }),
  );
}

export function mainColor(colors: string[]): string {
  return colors[0] ?? 'black';
}
