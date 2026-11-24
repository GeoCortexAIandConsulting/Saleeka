export type ShareLang = 'en' | 'ur';

/** "Mehndi" from a challenge title like "Mehndi outfit · mustard, lemon" (or "Winter mehndi look"). */
export const occasionOf = (challengeTitle?: string | null) => (challengeTitle ?? '').replace(/\s+(look|outfit)\b.*$/i, '').trim() || 'wedding';

/** A round budget the look's total is under: Rs 18,500 → "20k", Rs 20,000 → "25k". */
export const underK = (total: number) => `${(Math.floor(total / 5000) + 1) * 5}k`;

/**
 * What a WhatsApp share says, before the link (the link is added after it):
 * English: "Vote for my Mehndi look on Saleeqa! Under PKR 20k, all real brands 👇"
 * Roman Urdu: "Mera Mehndi look dekho aur vote karo! 👇"
 */
export function shareMessage(lang: ShareLang, challengeTitle: string | null | undefined, total: number) {
  const occasion = occasionOf(challengeTitle);
  return lang === 'ur'
    ? `Mera ${occasion} look dekho aur vote karo! 👇`
    : `Vote for my ${occasion} look on Saleeqa! Under PKR ${underK(total)}, all real brands 👇`;
}
