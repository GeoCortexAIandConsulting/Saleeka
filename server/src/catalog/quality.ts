/**
 * What makes a product name look wrong to a player: shop codes ("Rts | Blended", "JLK-2231"), broken
 * characters, a single vague word, shouting capitals, or things that are not a piece to wear.
 * An empty list means the name reads well.
 */
export function titleProblems(title: string): string[] {
  const t = title.trim();
  const out: string[] = [];
  if (/\|/.test(t)) out.push('shop code separator');
  if (/[�]|Ã.|Â|â€/.test(t)) out.push('broken characters');
  if (/\b[A-Z]{1,5}[-_/]?\d{3,}[A-Z0-9-]*\b/.test(t) || /\b\d{5,}\b/.test(t)) out.push('product code');
  if (t.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w)).length < 2) out.push('too vague');
  if (t.length > 6 && t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) out.push('all capitals');
  if (/\b(sample|test|dummy|gift ?card|swatch|fabric glossary|do not)\b/i.test(t)) out.push('not a piece to wear');
  return out;
}
