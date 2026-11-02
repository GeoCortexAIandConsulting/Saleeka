import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/data/palette.js';

// The website keeps its own copy of the palette (to colour try-on outfits); it must match this one.
describe('web palette copy', () => {
  it('has exactly the same colours and hex values as the server palette', () => {
    const src = readFileSync(fileURLToPath(new URL('../../web/lib/palette.ts', import.meta.url)), 'utf8');
    const web = Object.fromEntries([...src.matchAll(/^\s*([a-z]+): '(#[0-9a-f]{6})',$/gm)].map((m) => [m[1], m[2]]));
    const server = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, v.hex]));
    expect(web).toEqual(server);
  });
});
