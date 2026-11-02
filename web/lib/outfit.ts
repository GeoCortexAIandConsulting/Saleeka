import type * as T from 'three';
import type { Look, Product } from '@/lib/types';
import { PALETTE_HEX } from '@/lib/palette';
import type { BagKind, BottomKind, Dress, DrapeKind, JewelryKind, TopKind } from '@/lib/humanBody';

type Three = typeof import('three');

/** What to put on the avatar for one look: plain data (no three.js), so it can be compared and cached. */
export interface OutfitSpec {
  top?: {
    kind: TopKind;
    hemY: number;
    sleeve: 'sleeveless' | 'short' | 'three-quarter' | 'full';
    neckline: 'open' | 'regular' | 'high';
    color: string;
    accent?: string;
    print: boolean;
    embellishment: number;
    sheer: boolean;
    fabric: string;
  };
  bottom?: { kind: BottomKind; cropped: boolean; color: string };
  drape?: { kind: DrapeKind; color: string; accent?: string; embellishment: number; sheer: boolean; fabric: string; ownScarf?: boolean };
  shoes?: { color: string };
  bag?: { kind: BagKind; color: string };
  jewelry?: { kind: JewelryKind; color: string };
}

const GOLD = '#c9a24a';

const TOP_KIND: Record<string, TopKind> = {
  straight: 'kameez',
  'a-line': 'a-line',
  angrakha: 'angrakha',
  maxi: 'maxi',
  western: 'dress',
  fusion: 'tunic',
  'shirt-trouser': 'shirt',
};

/** Hem height (share of body height) by garment and length. Kameez lengths run longer than dresses. */
function hemFor(kind: TopKind, length: Product['length']): number {
  if (kind === 'maxi') return 0.035;
  if (kind === 'shirt') return 0.44;
  if (kind === 'dress') return { short: 0.45, knee: 0.31, midi: 0.2, full: 0.05 }[length ?? 'knee'];
  return { short: 0.42, knee: 0.33, midi: 0.29, full: 0.22 }[length ?? 'full'];
}

function bottomKind(title: string): BottomKind {
  const t = title.toLowerCase();
  if (t.includes('palazzo')) return 'palazzo';
  if (t.includes('cigarette')) return 'cigarette';
  if (t.includes('shalwar')) return 'shalwar';
  return 'trouser';
}

const second = (p: Product) => (p.colors[1] ? PALETTE_HEX[p.colors[1]] : undefined);

/**
 * Turns a look into what the avatar wears. Pieces a 2- or 3-piece set already includes (its bottom,
 * its dupatta) are shown in the set's colours when the look has no separate item for them. A shopper
 * who wears hijab has the scarf or dupatta worn as one (or a plain beige scarf of their own, marked
 * `ownScarf`, when the look has none).
 */
export function outfitFromLook(look: Look, opts: { hijab?: boolean } = {}): OutfitSpec {
  const item = (slot: string) => look.items.find((i) => i.slot === slot)?.product;
  const main = item('main');
  const spec: OutfitSpec = {};

  if (main) {
    const kind = TOP_KIND[main.silhouette] ?? 'kameez';
    const accent = second(main) ?? ((main.embellishment ?? 0) >= 2 ? GOLD : undefined);
    spec.top = {
      kind,
      hemY: hemFor(kind, main.length),
      sleeve: main.sleeve ?? 'full',
      neckline: main.neckline ?? 'regular',
      color: main.hex,
      accent,
      print: (main.fabric === 'lawn' || /printed/i.test(main.title)) && (main.embellishment ?? 0) <= 1,
      embellishment: main.embellishment ?? 0,
      sheer: !!main.sheer,
      fabric: main.fabric,
    };
  }

  const bottom = item('bottom');
  if (bottom) spec.bottom = { kind: bottomKind(bottom.title), cropped: bottom.length === 'midi', color: bottom.hex };
  else if (main?.includesBottom && spec.top && spec.top.hemY > 0.06) {
    spec.bottom = { kind: main.silhouette === 'shirt-trouser' ? 'trouser' : 'shalwar', cropped: false, color: second(main) ?? main.hex };
  }

  const drape = item('dupatta');
  const asHijab = (k: DrapeKind): DrapeKind => (opts.hijab && k !== 'shawl' ? 'hijab' : k);
  if (drape) {
    spec.drape = {
      kind: asHijab((['dupatta', 'scarf', 'shawl'].includes(drape.silhouette) ? drape.silhouette : 'dupatta') as DrapeKind),
      color: drape.hex,
      accent: (drape.embellishment ?? 0) >= 2 ? GOLD : undefined,
      embellishment: drape.embellishment ?? 0,
      sheer: ['chiffon', 'organza'].includes(drape.fabric),
      fabric: drape.fabric,
    };
  } else if (main?.includesDupatta) {
    spec.drape = {
      kind: asHijab('dupatta'),
      color: second(main) ?? main.hex,
      accent: (main.embellishment ?? 0) >= 2 ? GOLD : undefined,
      embellishment: main.embellishment ?? 0,
      sheer: ['chiffon', 'organza'].includes(main.fabric),
      fabric: main.fabric,
    };
  } else if (opts.hijab) {
    spec.drape = { kind: 'hijab', color: PALETTE_HEX.beige, embellishment: 0, sheer: false, fabric: 'cotton', ownScarf: true };
  }

  const shoes = item('footwear');
  if (shoes) spec.shoes = { color: shoes.hex };
  const bag = item('bag');
  if (bag) spec.bag = { kind: (['clutch', 'tote', 'potli', 'shoulder bag'].includes(bag.silhouette) ? bag.silhouette : 'clutch') as BagKind, color: bag.hex };
  const jewel = item('jewelry');
  if (jewel) {
    const kinds: JewelryKind[] = ['jhumkay', 'earrings', 'necklace set', 'maang tikka', 'bangles'];
    spec.jewelry = { kind: kinds.includes(jewel.silhouette as JewelryKind) ? (jewel.silhouette as JewelryKind) : 'earrings', color: jewel.colors[0] === 'silver' ? '#c3c7cf' : '#d4af37' };
  }
  return spec;
}

/* --------------------------------- fabrics --------------------------------- */

type Band = { axis: 'u' | 'v'; from: number; to: number };

/** A small deterministic random generator, so a fabric looks the same every time it is drawn. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hashOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/**
 * Draws a fabric: the base colour, an optional small floral print, scattered sequins for embellished
 * pieces, and embroidered bands (hem, neckline, cuffs, dupatta borders) where `bands` says.
 */
function fabricCanvas(o: { color: string; accent?: string; print: boolean; embellishment: number; bands: Band[]; seed: string }) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = seeded(hashOf(o.seed));
  g.fillStyle = o.color;
  g.fillRect(0, 0, S, S);

  // Woven texture: faint fine lines so plain fabric is not flat plastic.
  g.globalAlpha = 0.05;
  g.fillStyle = shade(o.color, -0.5);
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  g.globalAlpha = 1;

  if (o.print) {
    const ink = o.accent ?? shade(o.color, -0.35);
    const leaf = shade(o.accent ?? o.color, 0.35);
    for (let i = 0; i < 170; i++) {
      const x = rnd() * S, y = rnd() * S, r = 2.5 + rnd() * 3.5;
      g.fillStyle = leaf;
      g.beginPath();
      g.ellipse(x + r, y + r * 0.4, r * 0.7, r * 0.3, 0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = shade(o.color, 0.6);
      g.beginPath();
      g.arc(x, y, r * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (o.embellishment >= 2) {
    const n = o.embellishment === 3 ? 260 : 90;
    g.fillStyle = GOLD;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.6 + rnd() * 0.4;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 1.2 + rnd() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  const thread = o.accent && o.accent !== o.color ? o.accent : GOLD;
  for (const b of o.bands) {
    // Canvas y runs down while texture v runs up, so v bands are flipped.
    const a = Math.round(b.from * S), z = Math.round(b.to * S);
    const len = Math.max(2, z - a);
    if (b.axis === 'v') {
      const y0 = S - z;
      g.fillStyle = shade(o.color, -0.15);
      g.fillRect(0, y0, S, len);
      g.fillStyle = thread;
      g.fillRect(0, y0, S, Math.max(1, len * 0.12));
      g.fillRect(0, y0 + len - Math.max(1, len * 0.12), S, Math.max(1, len * 0.12));
      const step = Math.max(8, len * 0.9);
      for (let x = 0; x < S; x += step) {
        g.beginPath();
        g.moveTo(x + step / 2, y0 + len * 0.22);
        g.lineTo(x + step * 0.85, y0 + len / 2);
        g.lineTo(x + step / 2, y0 + len * 0.78);
        g.lineTo(x + step * 0.15, y0 + len / 2);
        g.closePath();
        g.fill();
      }
    } else {
      g.fillStyle = shade(o.color, -0.15);
      g.fillRect(a, 0, len, S);
      g.fillStyle = thread;
      g.fillRect(a, 0, Math.max(1, len * 0.15), S);
      g.fillRect(a + len - Math.max(1, len * 0.15), 0, Math.max(1, len * 0.15), S);
      const step = Math.max(8, len * 0.9);
      for (let y = 0; y < S; y += step) {
        g.beginPath();
        g.arc(a + len / 2, y + step / 2, len * 0.22, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

function fabricMaterial(THREE: Three, canvas: HTMLCanvasElement, fabric: string, opacity = 1) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const roughness = { silk: 0.42, velvet: 0.98, organza: 0.5, chiffon: 0.6, lawn: 0.85, cotton: 0.85, linen: 0.92, khaddar: 0.95, grip: 0.8 }[fabric] ?? 0.8;
  return new THREE.MeshStandardMaterial({ map, roughness, metalness: fabric === 'silk' ? 0.08 : 0, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

/** Builds the materials for an outfit. Call `dispose` when the outfit is taken off. */
export function makeDress(THREE: Three, spec: OutfitSpec): { dress: Dress; dispose: () => void } {
  const owned: T.Material[] = [];
  const keep = <M extends T.Material>(m: M) => (owned.push(m), m);
  const dress: Dress = {};
  const key = JSON.stringify(spec);

  if (spec.top) {
    const t = spec.top;
    const len = 0.85 - t.hemY;
    const bands: Band[] = [];
    if (t.embellishment >= 2) bands.push({ axis: 'v', from: 0, to: Math.min(0.3, 0.045 / len) });
    if (t.embellishment >= 1) bands.push({ axis: 'v', from: 1 - Math.min(0.12, 0.022 / len), to: 1 });
    const opacity = t.sheer ? 0.92 : 1;
    const body = keep(fabricMaterial(THREE, fabricCanvas({ color: t.color, accent: t.accent, print: t.print, embellishment: t.embellishment, bands, seed: key + 'body' }), t.fabric, opacity));
    const sleeveBands: Band[] = t.embellishment >= 2 ? [{ axis: 'v', from: 0.88, to: 1 }] : [];
    const sleeves = keep(fabricMaterial(THREE, fabricCanvas({ color: t.color, accent: t.accent, print: t.print, embellishment: t.embellishment, bands: sleeveBands, seed: key + 'sleeve' }), t.fabric, opacity));
    const trim = keep(new THREE.MeshStandardMaterial({ color: t.accent ?? GOLD, roughness: 0.5, metalness: t.accent ? 0 : 0.4, side: THREE.DoubleSide }));
    dress.top = { kind: t.kind, hemY: t.hemY, sleeve: t.sleeve, neckline: t.neckline, body, sleeves, trim };
  }
  if (spec.bottom) {
    const b = spec.bottom;
    dress.bottom = { kind: b.kind, cropped: b.cropped, mat: keep(fabricMaterial(THREE, fabricCanvas({ color: b.color, print: false, embellishment: 0, bands: [], seed: key + 'bottom' }), 'cotton')) };
  }
  if (spec.drape) {
    const d = spec.drape;
    const bands: Band[] = d.embellishment >= 2 && d.kind !== 'hijab' ? [{ axis: 'u', from: 0, to: 0.14 }, { axis: 'u', from: 0.86, to: 1 }] : [];
    const canvas = fabricCanvas({ color: d.color, accent: d.accent, print: false, embellishment: d.kind === 'hijab' ? 0 : d.embellishment, bands, seed: key + 'drape' });
    // See-through only as a dupatta; a hijab is always shown opaque.
    dress.drape = { kind: d.kind, mat: keep(fabricMaterial(THREE, canvas, d.fabric, d.sheer && d.kind !== 'hijab' ? 0.78 : 1)) };
  }
  if (spec.shoes) dress.shoes = keep(new THREE.MeshStandardMaterial({ color: spec.shoes.color, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }));
  if (spec.bag) dress.bag = { kind: spec.bag.kind, mat: keep(new THREE.MeshStandardMaterial({ color: spec.bag.color, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide })) };
  if (spec.jewelry) {
    dress.jewelry = {
      kind: spec.jewelry.kind,
      mat: keep(new THREE.MeshStandardMaterial({ color: spec.jewelry.color, roughness: 0.3, metalness: 0.75, emissive: spec.jewelry.color, emissiveIntensity: 0.18 })),
    };
  }
  return {
    dress,
    dispose: () => {
      for (const m of owned) {
        (m as T.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    },
  };
}
