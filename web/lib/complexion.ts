export type Undertone = 'warm' | 'cool' | 'neutral';
export type Depth = 'light' | 'medium' | 'deep';

export interface ComplexionResult {
  undertone: Undertone;
  depth: Depth;
  /** Median skin colour found, for showing a swatch */
  hex: string;
  /** Share of the face area that looked like skin; low means the guess is shaky */
  coverage: number;
}

/**
 * Estimates undertone and depth from a selfie, entirely in the browser. The image is drawn to an
 * off-screen canvas, never uploaded, and dropped when this returns.
 *
 * - Skin pixels: a YCbCr skin-colour range, sampled from the centre of the frame where the face is.
 * - Depth: Individual Typology Angle (ITA = atan((L* - 50) / b*)), a standard dermatology measure.
 * - Undertone: hue angle of the skin colour in CIELAB (more yellow = warm, more red/pink = cool).
 * Lighting and camera filters shift the result, so the UI always lets the person correct it.
 */
export async function analyzeSelfie(file: File): Promise<ComplexionResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => {
    throw new Error('Could not read that image. Try a JPG or PNG photo.');
  });
  const region = faceRegion(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return analyzePixels(region);
}

/**
 * Pixels from the centre of an image or video frame (where the face guide sits), downscaled to
 * ~240px. Works on a <video> too, so live camera frames never need to be saved as photos.
 */
export function faceRegion(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const scale = 240 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser cannot analyse images.');
  ctx.drawImage(source, 0, 0, w, h);
  const x0 = Math.floor(w * 0.28), x1 = Math.ceil(w * 0.72);
  const y0 = Math.floor(h * 0.22), y1 = Math.ceil(h * 0.72);
  const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  canvas.width = canvas.height = 0;
  return data;
}

/** Combines several face regions (e.g. front, left and right) into one reading. */
export function analyzeRegions(regions: Uint8ClampedArray[]): ComplexionResult {
  const all = new Uint8ClampedArray(regions.reduce((n, r) => n + r.length, 0));
  let at = 0;
  for (const r of regions) { all.set(r, at); at += r.length; }
  return analyzePixels(all);
}

/** The colour maths, on raw RGBA pixels of the face region. */
export function analyzePixels(data: Uint8ClampedArray): ComplexionResult {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    // Skip shadows, blown highlights and non-skin colours.
    if (y < 35 || y > 245 || cr < 135 || cr > 180 || cb < 80 || cb > 135 || r < g || r < b) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  const total = data.length / 4;
  const coverage = rs.length / total;
  if (rs.length < 250 || coverage < 0.08) {
    throw new Error('We could not see enough skin. Try a closer, face-centred selfie in daylight, without filters.');
  }

  const median = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const r = median(rs), g = median(gs), b = median(bs);
  const { L, a, b: bb } = rgbToLab(r, g, b);

  const ita = (Math.atan2(L - 50, bb) * 180) / Math.PI;
  const depth: Depth = ita > 41 ? 'light' : ita > -5 ? 'medium' : 'deep';

  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  const undertone: Undertone = hue > 56 ? 'warm' : hue < 46 ? 'cool' : 'neutral';

  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return { undertone, depth, hex, coverage };
}

function rgbToLab(r8: number, g8: number, b8: number) {
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  // sRGB -> XYZ (D65), normalised by the white point
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
