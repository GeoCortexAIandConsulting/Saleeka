/**
 * How a product title looks to a player. Titles come from brand shops and can carry stock codes
 * ("Rts | Red Kurta", "KF-2231"), broken characters ("Ã©", "&amp;"), or name things that are not
 * part of an outfit (gift cards, cushions, kids' clothes). Each problem has a weight; 0 means clean.
 */
export type TitleProblem = 'code' | 'broken' | 'odd' | 'shouty' | 'short' | 'long' | 'repeat';

const WEIGHT: Record<TitleProblem, number> = { broken: 4, odd: 4, code: 3, short: 2, shouty: 1, long: 1, repeat: 1 };

/** Problems that make a piece not good enough to show (the others only look a little rough). */
export const SERIOUS: TitleProblem[] = ['code', 'broken', 'odd'];

const CODE = [
  /(^|\s)[A-Za-z]{1,5}\s*\|/, // "Rts | Red Kurta"
  /\|/,
  /#\s*\d/, // "#123"
  /\b(?!\d+-pieces?\b)(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]+-[A-Za-z0-9-]+\b/i, // "KF-2231", "W23-114" (not "3-Piece")
  /\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]{6,}\b/, // "SS23BSP226F"
  /\b\d{4,}\b/, // "Kurta 23114"
];
const BROKEN = /�|Ã.|Â|â€|&(?:[a-z]+|#\d+);|[\u0000-\u001f]/;
const ODD =
  /\b(gift ?cards?|vouchers?|samples?|testers?|gift box(es)?|face masks?|hangers?|cushions?|towels?|bed ?sheets?|duvets?|pillows?|perfumes?|fragrances?|body ?sprays?|lotions?|face creams?|candles?|key ?chains?|kids?|baby|babies|infants?|toddlers?|girls?|boys?|junior|unstitched fabric only|swatch(es)?)\b/i;

export function titleProblems(title: string): TitleProblem[] {
  const t = title.trim();
  const out: TitleProblem[] = [];
  if (CODE.some((re) => re.test(t))) out.push('code');
  if (BROKEN.test(t)) out.push('broken');
  if (ODD.test(t)) out.push('odd');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) out.push('shouty');
  if (t.length < 6 || t.split(/\s+/).length < 2) out.push('short');
  if (t.length > 70) out.push('long');
  if (/\b(\w{3,})\s+\1\b/i.test(t)) out.push('repeat');
  return out;
}

export const titleScore = (problems: TitleProblem[]) => problems.reduce((n, p) => n + WEIGHT[p], 0);
export const isSerious = (problems: TitleProblem[]) => problems.some((p) => SERIOUS.includes(p));
