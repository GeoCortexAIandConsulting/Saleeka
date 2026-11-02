/**
 * Brand colour names -> our palette names. Brands use hundreds of names ("off white", "ferozi",
 * "bottle green"); the composer works with the palette, so every product colour is mapped here.
 * Longer phrases are tried first, so "sea green" wins over "green".
 */
const SYNONYMS: Array<[string, string]> = [
  // Two-word shade names: one colour, not two ("olive green" is olive, not olive + green).
  ['olive green', 'olive'], ['mint green', 'mint'], ['lime green', 'mint'], ['forest green', 'emerald'], ['emerald green', 'emerald'],
  ['navy blue', 'navy'], ['teal blue', 'teal'], ['teal green', 'teal'], ['turquoise blue', 'teal'], ['ice white', 'white'],
  ['mustard yellow', 'mustard'], ['lemon yellow', 'lemon'], ['coral pink', 'peach'], ['peach pink', 'peach'], ['rust orange', 'rust'],
  ['maroon red', 'maroon'], ['wine red', 'maroon'], ['plum purple', 'plum'], ['lilac purple', 'lilac'], ['charcoal grey', 'grey'],
  ['chocolate brown', 'brown'], ['camel brown', 'beige'], ['dusty rose', 'blush'], ['rose pink', 'blush'], ['onion pink', 'blush'],
  // neutrals
  ['jet black', 'black'], ['black', 'black'],
  ['off white', 'ivory'], ['off-white', 'ivory'], ['offwhite', 'ivory'], ['cream', 'ivory'], ['ecru', 'ivory'], ['ivory', 'ivory'], ['pearl', 'ivory'],
  ['white', 'white'],
  ['beige', 'beige'], ['skin', 'beige'], ['nude', 'beige'], ['sand', 'beige'], ['camel', 'beige'], ['khaki', 'beige'], ['fawn', 'beige'], ['tan', 'beige'], ['oat', 'beige'], ['stone', 'beige'], ['champagne', 'beige'],
  ['charcoal', 'grey'], ['silver grey', 'grey'], ['grey', 'grey'], ['gray', 'grey'], ['ash', 'grey'], ['slate', 'grey'], ['steel', 'grey'],
  ['chocolate', 'brown'], ['coffee', 'brown'], ['mocha', 'brown'], ['brown', 'brown'], ['taupe', 'brown'], ['walnut', 'brown'],
  ['golden', 'gold'], ['gold', 'gold'], ['zari', 'gold'], ['copper', 'rust'], ['bronze', 'brown'],
  ['silver', 'silver'],
  // pinks and purples
  ['tea pink', 'blush'], ['baby pink', 'blush'], ['light pink', 'blush'], ['powder pink', 'blush'], ['pastel pink', 'blush'], ['blush', 'blush'], ['rose', 'blush'], ['dusty pink', 'blush'],
  ['hot pink', 'pink'], ['shocking pink', 'pink'], ['fuchsia', 'pink'], ['fuschia', 'pink'], ['magenta', 'pink'], ['pink', 'pink'],
  ['lilac', 'lilac'], ['lavender', 'lilac'], ['mauve', 'lilac'], ['light purple', 'lilac'], ['orchid', 'lilac'],
  ['aubergine', 'plum'], ['plum', 'plum'], ['purple', 'plum'], ['violet', 'plum'], ['grape', 'plum'],
  // reds and oranges
  ['maroon', 'maroon'], ['burgundy', 'maroon'], ['wine', 'maroon'], ['oxblood', 'maroon'], ['merlot', 'maroon'],
  ['scarlet', 'red'], ['cherry', 'red'], ['crimson', 'red'], ['red', 'red'],
  ['rust', 'rust'], ['brick', 'rust'], ['terracotta', 'rust'], ['cinnamon', 'rust'],
  ['peach', 'peach'], ['apricot', 'peach'], ['salmon', 'peach'], ['coral', 'peach'],
  ['tangerine', 'orange'], ['orange', 'orange'],
  ['lemon', 'lemon'], ['light yellow', 'lemon'], ['butter', 'lemon'],
  ['mustard', 'mustard'], ['yellow', 'mustard'], ['ochre', 'mustard'], ['turmeric', 'mustard'],
  // greens
  ['mint', 'mint'], ['pistachio', 'mint'], ['pista', 'mint'], ['light green', 'mint'], ['pastel green', 'mint'],
  ['sea green', 'sage'], ['sage', 'sage'], ['moss', 'sage'], ['tea green', 'sage'],
  ['olive', 'olive'], ['army', 'olive'], ['khaki green', 'olive'],
  ['bottle green', 'emerald'], ['emerald', 'emerald'], ['dark green', 'emerald'], ['forest', 'emerald'], ['green', 'emerald'], ['jade', 'emerald'],
  ['teal', 'teal'], ['turquoise', 'teal'], ['ferozi', 'teal'], ['feroza', 'teal'], ['aqua', 'teal'], ['zinc', 'teal'], ['peacock', 'teal'],
  // blues
  ['sky blue', 'sky'], ['light blue', 'sky'], ['baby blue', 'sky'], ['powder blue', 'sky'], ['ice blue', 'sky'], ['sky', 'sky'],
  ['navy', 'navy'], ['midnight', 'navy'], ['ink', 'navy'], ['denim', 'navy'], ['dark blue', 'navy'],
  ['royal blue', 'royal'], ['cobalt', 'royal'], ['electric blue', 'royal'], ['blue', 'royal'], ['indigo', 'navy'],
].sort((a, b) => b[0].length - a[0].length) as Array<[string, string]>;

/** Every palette colour named in the text, in the order they first appear. */
export function paletteColors(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s-]/g, ' ')} `;
  const found: Array<{ at: number; name: string }> = [];
  const used: Array<[number, number]> = [];
  for (const [phrase, name] of SYNONYMS) {
    const re = new RegExp(`(?<![a-z])${phrase.replace(/[-\s]/g, '[-\\s]?')}(?![a-z])`, 'g');
    for (const m of t.matchAll(re)) {
      const s = m.index!, e = s + m[0].length;
      if (used.some(([a, b]) => s < b && e > a)) continue; // part of a longer phrase already matched
      used.push([s, e]);
      found.push({ at: s, name });
    }
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.name))];
}
