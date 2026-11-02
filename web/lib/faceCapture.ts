import { CANONICAL_FACE } from '@/lib/faceMeshData';
import { analyzePixels } from '@/lib/complexion';
import { FACE_OVAL } from '@/lib/humanBody';

/** What gets saved for a 3D avatar face (matches PUT /api/me/avatar). */
export interface AvatarFacePayload {
  points: number[];
  uvs: number[];
  texture: string;
  skinHex: string;
}

const N = 468; // face-mesh points (MediaPipe also returns 10 iris points, which the mesh does not use)
const TEXTURE = 320; // face image size in px (~25 KB as JPEG)
const MAX_TURN_DEG = 22;

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
type Landmarker = { detect(image: Source): { faceLandmarks: { x: number; y: number; z: number }[][] } };

let landmarker: Promise<Landmarker> | null = null;

/**
 * MediaPipe's face landmarker, loaded once. The WASM runtime and model are served from this site
 * (public/mediapipe), and everything runs on the device: no image is sent anywhere to find the face.
 */
function getLandmarker(): Promise<Landmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return (await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      })) as unknown as Landmarker;
    })();
    landmarker.catch(() => { landmarker = null; }); // allow a retry after a failed load
  }
  return landmarker;
}

/** Start downloading the face model early (e.g. when the avatar section opens). */
export function preloadFaceModel() {
  getLandmarker().catch(() => {});
}

function sizeOf(src: Source): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

/**
 * Turns one front-facing photo (or live video frame) into an avatar face: the 468 mesh points
 * straightened to face forward at real size (cm), where each point sits on a small face image, the
 * face image itself (edges faded into the skin colour), and the skin colour.
 */
export async function buildAvatarFace(src: Source): Promise<AvatarFacePayload> {
  const [W, H] = sizeOf(src);
  if (!W || !H) throw new Error('That image is empty. Try another photo.');
  const lm = await getLandmarker().catch(() => {
    throw new Error('Could not load the face tool. Check your connection and try again.');
  });
  const found = lm.detect(src).faceLandmarks;
  if (!found.length) throw new Error('We could not find a face. Use a clear, front-facing photo in good light.');
  const raw = found[0].slice(0, N);

  // Image-space points: pixels, y up, z towards the camera (MediaPipe z is in the same scale as x).
  const P = raw.map((p) => [p.x * W, -p.y * H, -p.z * W]);
  const C = Array.from({ length: N }, (_, i) => [CANONICAL_FACE[i * 3], CANONICAL_FACE[i * 3 + 1], CANONICAL_FACE[i * 3 + 2]]);
  const { R, scale, turnDeg } = similarityFit(P, C);
  if (turnDeg > MAX_TURN_DEG) throw new Error('Please face the camera straight on, with your head level.');

  const cP = centroid(P), cC = centroid(C);
  const points: number[] = [];
  for (const p of P) {
    const a = [p[0] - cP[0], p[1] - cP[1], p[2] - cP[2]];
    for (let r = 0; r < 3; r++) points.push(scale * (R[r][0] * a[0] + R[r][1] * a[1] + R[r][2] * a[2]) + cC[r]);
  }

  // Square crop around the face, with a little margin.
  const xs = raw.map((p) => p.x * W), ys = raw.map((p) => p.y * H);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = Math.max(maxX - minX, maxY - minY) * 1.08;
  const sx = (minX + maxX) / 2 - side / 2, sy = (minY + maxY) / 2 - side / 2;
  const uvs: number[] = [];
  for (let i = 0; i < N; i++) {
    uvs.push(clamp01((xs[i] - sx) / side), clamp01(1 - (ys[i] - sy) / side));
  }

  const layer = canvas(TEXTURE);
  const lctx = layer.getContext('2d', { willReadFrequently: true })!;
  lctx.drawImage(src, sx, sy, side, side, 0, 0, TEXTURE, TEXTURE);
  const skinHex = skinColour(lctx, xs, ys, sx, sy, side);

  // Fade the face edges into the skin colour so the face meets the head without a hard line.
  const mask = canvas(TEXTURE);
  const mctx = mask.getContext('2d')!;
  mctx.filter = `blur(${Math.round(TEXTURE * 0.03)}px)`;
  mctx.fillStyle = '#fff';
  const ox = FACE_OVAL.map((i) => (xs[i] - sx) / side * TEXTURE), oy = FACE_OVAL.map((i) => (ys[i] - sy) / side * TEXTURE);
  const mx = ox.reduce((s, v) => s + v, 0) / ox.length, my = oy.reduce((s, v) => s + v, 0) / oy.length;
  mctx.beginPath();
  FACE_OVAL.forEach((_, k) => {
    // Shrunk well inside the outline so the outermost mesh points sample pure skin colour, not background.
    const x = mx + (ox[k] - mx) * 0.86, y = my + (oy[k] - my) * 0.86;
    if (k === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y);
  });
  mctx.closePath();
  mctx.fill();
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(mask, 0, 0);

  const out = canvas(TEXTURE);
  const octx = out.getContext('2d')!;
  octx.fillStyle = skinHex;
  octx.fillRect(0, 0, TEXTURE, TEXTURE);
  octx.drawImage(layer, 0, 0);
  const texture = out.toDataURL('image/jpeg', 0.86);
  for (const c of [layer, mask, out]) c.width = c.height = 0;

  return { points: points.map(r3), uvs: uvs.map(r3), texture, skinHex };
}

/** Reads a photo file (respecting phone rotation) for buildAvatarFace. */
export async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => {
    throw new Error('Could not read that image. Try a JPG, PNG or WebP photo.');
  });
}

/* --------------------------------- helpers --------------------------------- */

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function centroid(pts: number[][]) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((v) => v / pts.length);
}

/** Skin colour from the cheeks and forehead (between the eyes and the mouth avoids lips, brows and eyes). */
function skinColour(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], sx: number, sy: number, side: number): string {
  const W = ctx.canvas.width;
  const spots = [50, 280, 117, 346, 151, 9]; // cheeks, under-eye cheeks, forehead, nose bridge
  const chunks: Uint8ClampedArray[] = [];
  const box = Math.max(4, Math.round(W * 0.05));
  for (const i of spots) {
    // Point positions are in source pixels; map them into the square crop.
    const px = Math.round(((xs[i] - sx) / side) * W);
    const py = Math.round(((ys[i] - sy) / side) * W);
    const x0 = Math.max(0, Math.min(W - box, px - (box >> 1))), y0 = Math.max(0, Math.min(W - box, py - (box >> 1)));
    chunks.push(ctx.getImageData(x0, y0, box, box).data);
  }
  const all = new Uint8ClampedArray(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  try {
    return analyzePixels(all).hex;
  } catch {
    // Unusual lighting: fall back to the plain average of those spots.
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k < all.length; k += 4) { r += all[k]; g += all[k + 1]; b += all[k + 2]; n++; }
    if (!n) return '#c8a088';
    return '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Best rotation + uniform scale taking points A onto points B (Horn's quaternion method).
 * `turnDeg` is how far the face was turned from straight-on.
 */
function similarityFit(A: number[][], B: number[][]) {
  const ca = centroid(A), cb = centroid(B);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let na = 0, nb = 0;
  for (let i = 0; i < A.length; i++) {
    const a = [A[i][0] - ca[0], A[i][1] - ca[1], A[i][2] - ca[2]];
    const b = [B[i][0] - cb[0], B[i][1] - cb[1], B[i][2] - cb[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c];
    na += a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    nb += b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const Nm = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const [w, x, y, z] = topEigenvector(Nm);
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  const turnDeg = (2 * Math.acos(Math.min(1, Math.abs(w))) * 180) / Math.PI;
  return { R, scale: Math.sqrt(nb / na), turnDeg };
}

/** Eigenvector of the largest eigenvalue of a symmetric 4x4 matrix (Jacobi rotations). */
function topEigenvector(M: number[][]): number[] {
  const a = M.map((r) => r.slice());
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  const e = [v[0][best], v[1][best], v[2][best], v[3][best]];
  const n = Math.hypot(...e);
  return e.map((x) => x / n);
}
