import type * as T from 'three';
import { CANONICAL_FACE, FACE_TRIANGLES } from '@/lib/faceMeshData';

type Three = typeof import('three');

export type Gender = 'female' | 'male';

/**
 * Half-widths of the torso at each level, as a share of the old 3.4-unit figure (kept so the shape
 * tables read the same as before). `bust` is 0 for none.
 */
export interface Build {
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  bust: number;
}

const FEMALE: Record<string, Build> = {
  hourglass: { shoulder: 0.39, chest: 0.37, waist: 0.25, hip: 0.4, bust: 1 },
  pear: { shoulder: 0.32, chest: 0.31, waist: 0.26, hip: 0.44, bust: 0.8 },
  rectangle: { shoulder: 0.35, chest: 0.33, waist: 0.31, hip: 0.35, bust: 0.7 },
  apple: { shoulder: 0.36, chest: 0.38, waist: 0.4, hip: 0.37, bust: 1 },
  'inverted-triangle': { shoulder: 0.44, chest: 0.38, waist: 0.29, hip: 0.31, bust: 0.9 },
};
const MALE: Record<string, Build> = {
  trapezoid: { shoulder: 0.47, chest: 0.42, waist: 0.34, hip: 0.35, bust: 0 },
  'inverted-triangle': { shoulder: 0.52, chest: 0.46, waist: 0.3, hip: 0.31, bust: 0 },
  rectangle: { shoulder: 0.41, chest: 0.38, waist: 0.36, hip: 0.37, bust: 0 },
  triangle: { shoulder: 0.36, chest: 0.36, waist: 0.37, hip: 0.42, bust: 0 },
  oval: { shoulder: 0.41, chest: 0.44, waist: 0.47, hip: 0.4, bust: 0 },
};

export function buildFor(gender: Gender, shape?: string): Build {
  const table = gender === 'male' ? MALE : FEMALE;
  return table[shape ?? ''] ?? table.rectangle;
}

export const DEFAULT_HEIGHT: Record<Gender, number> = { female: 160, male: 173 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixBuild = (a: Build, b: Build, t: number): Build => ({
  shoulder: lerp(a.shoulder, b.shoulder, t),
  chest: lerp(a.chest, b.chest, t),
  waist: lerp(a.waist, b.waist, t),
  hip: lerp(a.hip, b.hip, t),
  bust: lerp(a.bust, b.bust, t),
});

/** A face to put on the head: 468 face-mesh points in cm, front-on (x right, y up, z forward). */
export interface FaceShape {
  points: ArrayLike<number>;
  /** Texture coordinates for each point (0..1), when a face texture is used */
  uvs?: ArrayLike<number>;
}

export interface HumanParams {
  gender: Gender;
  build: Build;
  heightCm?: number;
  weightKg?: number;
  face?: FaceShape;
}

export interface HumanMaterials {
  skin: T.Material;
  garment: T.Material;
  shoes: T.Material;
  hair: T.Material;
  /** Face material; falls back to `skin` (a neutral face) */
  face?: T.Material;
}

/**
 * How much heavier or lighter than average the person is, from BMI: 0 = average, -0.5 = slim,
 * 1 and above = fuller. Unknown weight or height means average.
 */
export function girth(heightCm?: number, weightKg?: number): number {
  if (!heightCm || !weightKg) return 0;
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  return Math.min(1.6, Math.max(-0.5, (bmi - 22) / 8));
}

/* ----------------------------- geometry helpers ----------------------------- */

interface Ring {
  t: number;
  /** Half-width (sideways) */
  w: number;
  /** Half-depth towards the front and the back */
  f: number;
  b: number;
}

/**
 * Smooth interpolation of each field across unevenly spaced keys, using monotone cubic tangents
 * (Fritsch-Carlson): the surface passes through every key without overshooting between them, so
 * no ripples appear between measurements.
 */
function sampleRing(keys: Ring[], t: number): Ring {
  if (t <= keys[0].t) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const field = (get: (k: Ring) => number) => {
    const slope = (a: number) => (a < 0 || a >= keys.length - 1 ? 0 : (get(keys[a + 1]) - get(keys[a])) / (keys[a + 1].t - keys[a].t));
    const tangent = (a: number) => {
      if (a === 0) return slope(0);
      if (a === keys.length - 1) return slope(a - 1);
      const s0 = slope(a - 1), s1 = slope(a);
      return s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1); // flat at peaks and valleys
    };
    const h = keys[i + 1].t - keys[i].t;
    const u = (t - keys[i].t) / h;
    const u2 = u * u, u3 = u2 * u;
    return Math.max(
      0.0005,
      (2 * u3 - 3 * u2 + 1) * get(keys[i]) + (u3 - 2 * u2 + u) * h * tangent(i) + (-2 * u3 + 3 * u2) * get(keys[i + 1]) + (u3 - u2) * h * tangent(i + 1),
    );
  };
  return { t, w: field((k) => k.w), f: field((k) => k.f), b: field((k) => k.b) };
}

/**
 * A smooth tube swept along a path. Each ring is a rounded (superellipse) cross-section whose
 * front and back can bulge differently, so one function makes the torso, limbs, neck and feet.
 */
function sweep(
  THREE: Three,
  path: [number, number, number][],
  keys: Ring[],
  opts: { from?: number; to?: number; rings?: number; segments?: number; roundness?: number; forward?: [number, number, number] } = {},
): T.BufferGeometry {
  const { from = 0, to = 1, rings = 48, segments = 40, roundness = 2.2 } = opts;
  const curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const fwd = new THREE.Vector3(...(opts.forward ?? [0, 0, 1]));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const e = 2 / roundness;
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), front = new THREE.Vector3(), p = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    const t = from + ((to - from) * r) / rings;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tangent);
    front.copy(fwd).addScaledVector(tangent, -tangent.dot(fwd)).normalize();
    side.crossVectors(tangent, front).normalize();
    const k = sampleRing(keys, t);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * k.w;
      const d = Math.sign(sn) * Math.pow(Math.abs(sn), e) * (sn >= 0 ? k.f : k.b);
      pos.push(p.x + side.x * x + front.x * d, p.y + side.y * x + front.y * d, p.z + side.z * x + front.z * d);
      // u runs around the tube, v along it (0 at the path start), so fabrics can carry borders and prints.
      uv.push(s / segments, r / rings);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s, b = r * segments + ((s + 1) % segments);
      const c = a + segments, d = b + segments;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin strip of cloth along a path (dupatta, straps). Its face turns outwards from the body's centre line. */
function ribbon(THREE: Three, path: [number, number, number][], width: (t: number) => number, opts: { rings?: number; across?: number } = {}): T.BufferGeometry {
  const { rings = 80, across = 6 } = opts;
  const curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), out = new THREE.Vector3(), wd = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    // Outwards from a point inside the chest: on top of the shoulders that is up (the cloth lies on
    // them), lower down it is level (the cloth hangs flat against the back or front).
    out.set(p.x, p.y - Math.min(p.y, 0.7), p.z).normalize();
    wd.crossVectors(tan, out).normalize();
    const w = width(t);
    for (let a = 0; a <= across; a++) {
      const f = a / across - 0.5;
      // A slight curve across the width, like cloth lying over a rounded body.
      const bulge = (0.25 - f * f) * w * 0.25;
      pos.push(p.x + wd.x * f * w + out.x * bulge, p.y + wd.y * f * w + out.y * bulge, p.z + wd.z * f * w + out.z * bulge);
      uv.push(a / across, t);
    }
  }
  const row = across + 1;
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < across; a++) {
      const i = r * row + a;
      idx.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------- clothing -------------------------------- */

export type TopKind = 'kameez' | 'a-line' | 'angrakha' | 'maxi' | 'dress' | 'tunic' | 'shirt';
export type BottomKind = 'trouser' | 'palazzo' | 'cigarette' | 'shalwar';
export type DrapeKind = 'dupatta' | 'scarf' | 'shawl' | 'hijab';
export type BagKind = 'clutch' | 'tote' | 'potli' | 'shoulder bag';
export type JewelryKind = 'jhumkay' | 'earrings' | 'necklace set' | 'maang tikka' | 'bangles';

/** An outfit ready to put on the body: shapes plus the materials to make them from. */
export interface Dress {
  top?: {
    kind: TopKind;
    /** Hem height as a share of body height (0 = floor) */
    hemY: number;
    sleeve: 'sleeveless' | 'short' | 'three-quarter' | 'full';
    neckline: 'open' | 'regular' | 'high';
    body: T.Material;
    sleeves: T.Material;
    /** Angrakha wrap panel / contrast trim */
    trim?: T.Material;
  };
  bottom?: { kind: BottomKind; cropped: boolean; mat: T.Material };
  drape?: { kind: DrapeKind; mat: T.Material };
  shoes?: T.Material;
  bag?: { kind: BagKind; mat: T.Material };
  jewelry?: { kind: JewelryKind; mat: T.Material };
}

/** Body measurements and paths the clothing is cut to. */
interface Frame {
  male: boolean;
  shoulder: number; chest: number; waist: number; hip: number; bust: number; belly: number;
  torsoAt: (y: number) => Ring;
  legX: number; thigh: number;
  legPaths: [number, number, number][][]; legKeys: Ring[];
  armPaths: [number, number, number][][]; armKeys: Ring[];
  jointX: number; jointY: number; wristX: number; wristY: number; upper: number; armFat: number;
}

/** What the head reports back for hijabs and jewellery. */
interface HeadInfo {
  skullGeo: (opts?: { thetaLength?: number; tilt?: number; grow?: number; keep?: (u: [number, number, number]) => boolean }) => T.BufferGeometry;
  /** Point on the skull (unit-sphere direction), in body units */
  at: (ux: number, uy: number, uz: number, grow?: number) => [number, number, number];
  /** A face landmark in body units */
  landmark: (i: number) => [number, number, number];
  chinY: number;
  width: number;
}

/** Key landmarks on MediaPipe's 468-point face mesh. */
const LM = { foreheadTop: 10, chin: 152, sideR: 234, sideL: 454, noseTip: 1 };

function facePoint(points: ArrayLike<number>, i: number): [number, number, number] {
  return [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
}

/* -------------------------------- the body -------------------------------- */

/**
 * Builds a standing person, 1 unit tall, feet on y = 0, facing +z. Scale the group by the height in
 * metres. Everything is a smooth surface; the body wears a plain fitted base layer (long sleeves,
 * trousers) with skin only at the face, neck and hands.
 */
export function buildHuman(THREE: Three, p: HumanParams, m: HumanMaterials, dress?: Dress): T.Group {
  const g = new THREE.Group();
  const male = p.gender === 'male';
  const heightCm = p.heightCm ?? DEFAULT_HEIGHT[p.gender];
  const fat = girth(p.heightCm, p.weightKg);
  const U = 1 / 3.4; // shape tables -> share of height
  const shoulder = p.build.shoulder * U * (1 + 0.04 * fat);
  const chest = p.build.chest * U * (1 + 0.1 * fat);
  const waist = p.build.waist * U * (1 + 0.24 * fat);
  const hip = p.build.hip * U * (1 + 0.14 * fat);
  const bust = p.build.bust;
  const belly = Math.max(0, fat) * 0.022 + (p.build.waist > p.build.chest ? 0.012 : 0);
  const add = (geo: T.BufferGeometry, mat: T.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    return mesh;
  };

  /* Torso: crotch to the base of the neck, along a straight vertical path. */
  const yBottom = 0.455, yTop = 0.84;
  const ty = (y: number) => (y - yBottom) / (yTop - yBottom);
  const torsoKeys: Ring[] = [
    { t: ty(0.455), w: 0.03, f: 0.03, b: 0.035 },
    { t: ty(0.47), w: hip * 0.82, f: 0.05, b: 0.062 },
    { t: ty(0.5), w: hip * 0.97, f: 0.056, b: male ? 0.066 : 0.076 },
    { t: ty(0.525), w: hip, f: 0.058 + belly * 0.3, b: male ? 0.064 : 0.072 },
    { t: ty(0.565), w: lerp(hip, waist, 0.55), f: 0.055 + belly * 0.8, b: 0.058 },
    { t: ty(0.615), w: waist, f: (male ? 0.057 : 0.052) + belly, b: 0.05 },
    { t: ty(0.66), w: lerp(waist, chest, 0.7), f: (male ? 0.06 : 0.056) + belly * 0.6, b: 0.052 },
    { t: ty(0.715), w: chest, f: male ? 0.066 : 0.058 + 0.03 * bust, b: 0.056 },
    { t: ty(0.755), w: Math.max(chest * 0.97, shoulder * 0.86), f: male ? 0.06 : 0.053, b: 0.055 },
    { t: ty(0.785), w: shoulder * 0.84, f: 0.047, b: 0.052 },
    // Trapezius: a long, gentle slope from the shoulder up to the neck.
    { t: ty(0.807), w: shoulder * 0.66, f: 0.038, b: 0.046 },
    { t: ty(0.825), w: shoulder * 0.4, f: 0.032, b: 0.038 },
    { t: ty(0.84), w: male ? 0.042 : 0.036, f: 0.03, b: 0.032 },
  ];
  add(sweep(THREE, [[0, yBottom, 0], [0, 0.65, 0], [0, yTop, 0]], torsoKeys, { rings: 90, segments: 56, roundness: 2.35 }), m.garment);

  /* Legs: start inside the hips, then hip joint -> knee -> ankle, trousers all the way down. */
  const legX = hip * 0.5;
  const thigh = Math.min(hip * 0.5, Math.max(0.05, hip * 0.5) * (1 + 0.12 * fat));
  const legPaths: [number, number, number][][] = [];
  let legKeysOut: Ring[] = [];
  const armPaths: [number, number, number][][] = [];
  let armKeysOut: Ring[] = [];
  for (const sd of [-1, 1]) {
    const path: [number, number, number][] = [
      [sd * legX * 0.85, 0.56, 0],
      [sd * legX, 0.47, 0.002],
      [sd * legX * 0.86, 0.38, 0.004],
      [sd * legX * 0.76, 0.285, 0.006],
      [sd * legX * 0.72, 0.16, -0.004],
      [sd * legX * 0.7, 0.045, -0.01],
    ];
    // Path is ~0.52 long; t = 0.17 is the crotch, 0.5 the knee.
    const legKeys: Ring[] = [
      { t: 0, w: thigh * 0.6, f: thigh * 0.55, b: thigh * 0.6 },
      { t: 0.17, w: thigh, f: thigh * 0.86, b: thigh * 0.95 },
      { t: 0.27, w: thigh * 0.93, f: thigh * 0.86, b: thigh * 0.86 },
      { t: 0.42, w: thigh * 0.7, f: thigh * 0.68, b: thigh * 0.66 },
      { t: 0.53, w: 0.036, f: 0.037, b: 0.035 },
      { t: 0.64, w: 0.039 * (1 + 0.1 * fat), f: 0.036, b: 0.046 * (1 + 0.12 * fat) },
      { t: 0.87, w: 0.026, f: 0.025, b: 0.027 },
      { t: 1, w: 0.024, f: 0.024, b: 0.024 },
    ];
    // Trousers in an outfit replace the base layer's legs (so it never shows through at the knees).
    if (!dress?.bottom) add(sweep(THREE, path, legKeys, { rings: 72, segments: 36, roundness: 2 }), m.garment);
    legPaths.push(path);
    legKeysOut = legKeys;

    // Feet (shoes): heel -> toe along the ground.
    const ax = sd * legX * 0.7;
    const footPath: [number, number, number][] = [
      [ax, 0.03, -0.04],
      [ax + sd * 0.004, 0.028, 0.02],
      [ax + sd * 0.01, 0.018, 0.085],
      [ax + sd * 0.012, 0.012, 0.115],
    ];
    const footKeys: Ring[] = [
      { t: 0, w: 0.005, f: 0.006, b: 0.006 },
      { t: 0.1, w: 0.022, f: 0.026, b: 0.024 },
      { t: 0.55, w: 0.028, f: 0.022, b: 0.014 },
      { t: 0.85, w: 0.022, f: 0.012, b: 0.009 },
      { t: 1, w: 0.004, f: 0.003, b: 0.003 },
    ];
    add(sweep(THREE, footPath, footKeys, { rings: 28, segments: 24, roundness: 2.4, forward: [0, 1, 0] }), dress?.shoes ?? m.shoes);
  }

  /* Arms: shoulder -> elbow -> wrist -> fingertips, relaxed A-pose that clears the hips. */
  const jointY = 0.79;
  const jointX = shoulder - 0.03;
  const wristY = jointY - 0.33;
  const clearance = Math.max(hip, waist + belly) + 0.04;
  const wristX = Math.max(jointX + 0.035, clearance);
  const upper = male ? 0.036 : 0.032;
  const armFat = 1 + 0.22 * fat;
  for (const sd of [-1, 1]) {
    const path: [number, number, number][] = [
      [sd * jointX, jointY, -0.004],
      [sd * lerp(jointX, wristX, 0.45), jointY - 0.14, -0.012],
      [sd * lerp(jointX, wristX, 0.75), jointY - 0.235, 0.0],
      [sd * wristX, wristY, 0.012],
      [sd * (wristX + 0.004), wristY - 0.06, 0.016],
      [sd * (wristX + 0.002), wristY - 0.105, 0.014],
    ];
    const armKeys: Ring[] = [
      { t: 0, w: upper * 1.1, f: upper * 1.1, b: upper * 1.15 },
      { t: 0.07, w: upper * 1.18 * armFat, f: upper * 1.12 * armFat, b: upper * 1.18 * armFat },
      { t: 0.25, w: upper * armFat, f: upper * armFat, b: upper * 1.02 * armFat },
      { t: 0.42, w: upper * 0.8, f: upper * 0.82, b: upper * 0.82 },
      { t: 0.52, w: upper * 0.88 * (1 + 0.12 * fat), f: upper * 0.82, b: upper * 0.82 },
      { t: 0.74, w: upper * 0.55, f: upper * 0.46, b: upper * 0.46 },
      // Hands: palms face the thighs, so the hand is wide front-to-back and thin sideways.
      { t: 0.82, w: 0.013, f: 0.026, b: 0.024 },
      { t: 0.93, w: 0.01, f: 0.02, b: 0.018 },
      { t: 1, w: 0.003, f: 0.004, b: 0.004 },
    ];
    add(sweep(THREE, path, armKeys, { to: 0.745, rings: 56, segments: 32, roundness: 2 }), m.garment);
    armPaths.push(path);
    armKeysOut = armKeys;
    // Deltoid: a rounded cap over the shoulder joint, so the shoulder line curves into the arm.
    const cap = add(new THREE.SphereGeometry(1, 32, 20), m.garment);
    // Kept below the shoulder line (torso top) so it rounds the shoulder instead of padding it.
    cap.scale.set(upper * 1.1 * armFat, upper * 1.0, upper * 1.15);
    cap.position.set(sd * (jointX - 0.008), jointY - 0.012, -0.004);
    add(sweep(THREE, path, armKeys, { from: 0.72, to: 1, rings: 24, segments: 24, roundness: 2.2 }), m.skin);
  }

  const head = buildHead(THREE, g, p, m, heightCm, add, dress?.drape?.kind === 'hijab');
  if (dress) {
    const frame: Frame = {
      male, shoulder, chest, waist, hip, bust, belly,
      torsoAt: (y) => sampleRing(torsoKeys, ty(y)),
      legX, thigh, legPaths, legKeys: legKeysOut, armPaths, armKeys: armKeysOut,
      jointX, jointY, wristX, wristY, upper, armFat,
    };
    dressUp(THREE, frame, head, dress, add);
  }
  return g;
}

/**
 * The head, built in face space (cm) around the face mesh. The skull is sized from the face's own
 * landmarks, and the outer band of the face mesh is eased onto the skull surface, so face and head
 * are one continuous surface (no mask edge). Neck, ears and hair are fitted to the same skull.
 */
function buildHead(
  THREE: Three,
  g: T.Group,
  p: HumanParams,
  m: HumanMaterials,
  heightCm: number,
  add: (geo: T.BufferGeometry, mat: T.Material) => T.Mesh,
  /** Hair hidden under a hijab */
  covered = false,
): HeadInfo {
  const male = p.gender === 'male';
  const points = p.face?.points ?? CANONICAL_FACE;
  const chin = facePoint(points, LM.chin), top = facePoint(points, LM.foreheadTop);
  const sideR = facePoint(points, LM.sideR), sideL = facePoint(points, LM.sideL);
  const fh = top[1] - chin[1]; // chin to upper forehead, cm
  const halfW = Math.abs(sideL[0] - sideR[0]) / 2; // half the face width at the temples, cm

  // Skull in face space: centre level with the temples, top 1.3 face-heights above the chin.
  const c = [(sideL[0] + sideR[0]) / 2, (sideL[1] + sideR[1]) / 2, (sideL[2] + sideR[2]) / 2 - 1.0];
  const headTopY = chin[1] + 1.3 * fh;
  const rx = halfW * 1.0;
  const ryU = headTopY - c[1];
  const ryD = (c[1] - chin[1]) * 0.9;
  const rz = halfW * 1.24;
  /** Unit-sphere direction -> skull surface (the lower half narrows into the jaw). */
  const taper = (uy: number) => {
    const lo = Math.max(0, -uy);
    return [1 - 0.22 * Math.pow(lo, 1.3), 1 - 0.12 * lo];
  };
  const skullAt = (ux: number, uy: number, uz: number, grow = 1): [number, number, number] => {
    const [xf, zf] = taper(uy);
    return [c[0] + ux * rx * xf * grow, c[1] + uy * (uy > 0 ? ryU : ryD) * grow, c[2] + uz * rz * zf * grow];
  };
  /** Nearest skull point along the ray from the centre, and whether `v` lies inside the skull. */
  const project = (v: [number, number, number]): { s: [number, number, number]; inside: boolean } => {
    let u = [(v[0] - c[0]) / rx, (v[1] - c[1]) / ryU, (v[2] - c[2]) / rz];
    for (let k = 0; k < 4; k++) {
      const n = Math.hypot(u[0], u[1], u[2]) || 1;
      u = u.map((x) => x / n);
      const [xf, zf] = taper(u[1]);
      u = [(v[0] - c[0]) / (rx * xf), (v[1] - c[1]) / (u[1] > 0 ? ryU : ryD), (v[2] - c[2]) / (rz * zf)];
    }
    const n = Math.hypot(u[0], u[1], u[2]) || 1;
    return { s: skullAt(u[0] / n, u[1] / n, u[2] / n), inside: n < 1 };
  };

  // Body placement: cm -> share of height, top of the skull at the full height, centred on x.
  const s = 1 / heightCm;
  const neckFront = 0.014; // how far the face sits forward of the body's centre line
  const toBody = (v: ArrayLike<number>): [number, number, number] => [
    (v[0] - c[0]) * s,
    1 + (v[1] - headTopY) * s,
    (v[2] - c[2]) * s - rz * 0.25 * s + neckFront,
  ];

  // Face mesh: ease the outer band onto the skull; never let any of it sink behind the skull.
  const ox = FACE_OVAL.map((i) => points[i * 3]), oy = FACE_OVAL.map((i) => points[i * 3 + 1]);
  const band = fh * 0.16;
  const fp = new Float32Array(468 * 3);
  for (let i = 0; i < 468; i++) {
    const v: [number, number, number] = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
    const d = distToPolygon(v[0], v[1], ox, oy);
    const w = smooth(Math.min(1, d / band));
    const { s: on, inside } = project(v);
    let out: [number, number, number] = [lerp(on[0], v[0], w), lerp(on[1], v[1], w), lerp(on[2], v[2], w)];
    if (inside || w < 1) {
      const again = project(out);
      if (again.inside) out = again.s;
    }
    const b = toBody(out);
    fp[i * 3] = b[0]; fp[i * 3 + 1] = b[1]; fp[i * 3 + 2] = b[2] + 0.0004; // a hair proud of the skull
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  if (p.face?.uvs) faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from(p.face.uvs), 2));
  faceGeo.setIndex(Array.from(FACE_TRIANGLES));
  faceGeo.computeVertexNormals();
  add(faceGeo, p.face?.uvs && m.face ? m.face : m.skin);

  /**
   * A sphere bent onto the skull shape: optionally a part of it, tilted, grown outwards, and with
   * triangles dropped where `keep` (given the unit-sphere direction) says no, e.g. a hijab's face opening.
   */
  const skullGeo = (opts: { thetaLength?: number; tilt?: number; grow?: number; keep?: (u: [number, number, number]) => boolean } = {}) => {
    const geo = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, opts.thetaLength ?? Math.PI);
    const pos = geo.attributes.position as T.BufferAttribute;
    const ct = Math.cos(opts.tilt ?? 0), st = Math.sin(opts.tilt ?? 0);
    const kept: boolean[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
      const y = y0 * ct - z0 * st, z = y0 * st + z0 * ct; // tilt about x (negative = cap slides back)
      kept.push(!opts.keep || opts.keep([x, y, z]));
      const b = toBody(skullAt(x, y, z, opts.grow ?? 1));
      pos.setXYZ(i, b[0], b[1], b[2]);
    }
    if (opts.keep) {
      const old = geo.index!.array;
      const idx: number[] = [];
      for (let i = 0; i < old.length; i += 3) {
        if (kept[old[i]] && kept[old[i + 1]] && kept[old[i + 2]]) idx.push(old[i], old[i + 1], old[i + 2]);
      }
      geo.setIndex(idx);
    }
    geo.computeVertexNormals();
    return geo;
  };
  add(skullGeo(), m.skin);

  // Neck: from inside the shoulders up under the jaw.
  // The top ends well inside the skull, narrower than the jaw, so no rim shows under the chin.
  const neckR = male ? 0.035 : 0.03;
  const under = toBody(skullAt(0, -0.25, -0.25));
  const neckKeys: Ring[] = [
    { t: 0, w: neckR * 1.3, f: neckR * 1.1, b: neckR * 1.25 },
    { t: 0.4, w: neckR, f: neckR * 0.95, b: neckR },
    { t: 0.75, w: neckR * 0.95, f: neckR * 0.9, b: neckR * 0.95 },
    { t: 1, w: neckR * 0.6, f: neckR * 0.55, b: neckR * 0.6 },
  ];
  add(sweep(THREE, [[0, 0.8, -0.008], [0, (0.8 + under[1]) / 2, (under[2] - 0.008) / 2], [0, under[1], under[2]]], neckKeys, { rings: 16, segments: 32 }), m.skin);

  // Ears (men; women's hair covers them), level between the eyes and the nose.
  if (male) {
    for (const sd of [-1, 1]) {
      const ear = add(new THREE.SphereGeometry(1, 20, 14), m.skin);
      const at = toBody([c[0] + sd * rx * 0.97, c[1] - fh * 0.06, c[2] + rz * 0.08]);
      ear.scale.set(0.0045, fh * s * 0.17, fh * s * 0.1);
      ear.position.set(...at);
    }
  }

  const info: HeadInfo = {
    skullGeo,
    at: (ux, uy, uz, grow = 1) => toBody(skullAt(ux, uy, uz, grow)),
    landmark: (i) => toBody(facePoint(points, i)),
    chinY: toBody(chin)[1],
    width: 2 * rx * s,
  };
  if (covered) return info; // a hijab covers the hair

  // Hair: a cap over the top and back, front edge at the hairline; long at the back for women.
  // Rim: top of the forehead at the front, just above the ears at the sides, the nape at the back.
  add(skullGeo({ thetaLength: Math.PI * (male ? 0.45 : 0.47), tilt: male ? -0.5 : -0.62, grow: male ? 1.025 : 1.035 }), m.hair);
  if (!male) {
    const crown = toBody(skullAt(0, 0.3, -0.95, 1.03));
    const nape = toBody(skullAt(0, -0.35, -0.94, 1.03));
    const wHair = rx * s * 0.88;
    const backKeys: Ring[] = [
      { t: 0, w: wHair, f: 0.008, b: 0.016 },
      { t: 0.4, w: wHair * 0.92, f: 0.008, b: 0.014 },
      { t: 1, w: wHair * 0.55, f: 0.005, b: 0.006 },
    ];
    add(sweep(THREE, [crown, nape, [0, 0.73, nape[2] - 0.01]], backKeys, { rings: 28, segments: 32, forward: [0, 0, -1] }), m.hair);
  }
  return info;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How much wider than the hips each top is at the hem. */
const FLARE: Record<TopKind, number> = { kameez: 1.05, shirt: 1.04, tunic: 1.22, 'a-line': 1.35, dress: 1.3, angrakha: 1.45, maxi: 1.95 };
/** Where the flare starts (anarkali-style maxis flare from just under the bust). */
const FLARE_FROM: Partial<Record<TopKind, number>> = { maxi: 0.66, angrakha: 0.6 };
const SLEEVE_END = { sleeveless: 0, short: 0.2, 'three-quarter': 0.58, full: 0.735 } as const;

/** Puts the outfit on: every piece is cut from the body's own measurements plus a little ease. */
function dressUp(THREE: Three, f: Frame, head: HeadInfo, d: Dress, add: (geo: T.BufferGeometry, mat: T.Material) => T.Mesh) {
  const ease = (k: Ring, e: number, ef = e, eb = e): Ring => ({ t: k.t, w: k.w + e, f: k.f + ef, b: k.b + eb });
  const at = (path: [number, number, number][], t: number) => {
    const c = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
    return { p: c.getPointAt(t), tan: c.getTangentAt(t) };
  };
  const hijab = d.drape?.kind === 'hijab';

  /*
   * Bottoms: over each leg, then a seat piece where the legs meet. Under a top they start just above
   * its hem (nothing higher shows), so a baggy shalwar never pokes through the kameez.
   */
  if (d.bottom) {
    const { kind, cropped, mat } = d.bottom;
    const topHem = d.top ? Math.min(d.top.hemY, 0.5) : null;
    for (const path of f.legPaths) {
      let start = 0.06;
      if (topHem !== null) {
        const curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
        // Walk down the leg to the point a little above the hem (paths run top to bottom).
        for (let t = 0.06; t < 0.95; t += 0.01) {
          if (curve.getPointAt(t).y < topHem + 0.04) { start = t; break; }
        }
      }
      const keys = f.legKeys.map((k) => {
        const lower = smooth(clamp01((k.t - 0.42) / 0.58)); // 0 above the knee -> 1 at the ankle
        if (kind === 'cigarette') return ease(k, 0.004);
        if (kind === 'palazzo') return ease(k, 0.009 + 0.042 * lower);
        if (kind === 'shalwar') return ease(k, k.t > 0.95 ? 0.005 : 0.016 + 0.02 * Math.sin(Math.PI * clamp01(k.t / 0.95))); // baggy, gathered at the ankle
        return ease(k, 0.007 + 0.006 * lower); // straight trouser
      });
      add(sweep(THREE, path, keys, { from: start, to: cropped ? 0.88 : 1, rings: 64, segments: 36, roundness: 2 }), mat);
    }
    if (topHem === null || topHem > 0.46) {
      const ys = [0.45, 0.47, 0.5, 0.525, 0.565, 0.6];
      const seat = ys.map((y) => ({ ...ease(f.torsoAt(y), 0.007), t: (y - 0.45) / 0.15 }));
      add(sweep(THREE, [[0, 0.45, 0], [0, 0.6, 0]], seat, { rings: 16, segments: 56, roundness: 2.35 }), mat);
    }
  }

  /* Top: torso + skirt in one piece from the hem to the neckline, then sleeves. */
  if (d.top) {
    const top = d.top;
    const e = 0.008;
    const neckTop = top.neckline === 'high' ? 0.852 : top.neckline === 'open' ? 0.826 : 0.838;
    const hemY = Math.min(top.hemY, 0.5);
    const from = FLARE_FROM[top.kind] ?? 0.525;
    const flare = FLARE[top.kind];
    // The skirt must also clear both legs.
    const base = f.torsoAt(0.525);
    const W0 = Math.max(f.hip + 0.016, f.legX + f.thigh + 0.014);
    const F0 = Math.max(base.f + e, f.thigh * 0.95 + 0.012), B0 = Math.max(base.b + e, f.thigh + 0.016);
    const ys = new Set<number>([hemY, neckTop, 0.565, 0.615, 0.66, 0.715, 0.755, 0.785, 0.807, 0.825, 0.84]);
    for (let i = 0; i <= 10; i++) ys.add(lerp(hemY, Math.max(from, 0.525), i / 10));
    const sorted = [...ys].filter((y) => y >= hemY && y <= neckTop).sort((a, b) => a - b);
    const keys: Ring[] = sorted.map((y) => {
      const t = (y - hemY) / (neckTop - hemY);
      const fitted = ease(f.torsoAt(Math.min(y, 0.84)), e);
      if (y >= from && y >= 0.525) return { ...fitted, t };
      // Below the flare start: grow from the fitted body (or the leg-clearing width) towards the hem.
      const u = clamp01((from - y) / (from - hemY));
      const grow = 1 + (flare - 1) * Math.pow(u, 1.15);
      const w = Math.max(fitted.w, W0) * grow;
      const ff = Math.max(fitted.f, y < 0.525 ? F0 : 0) * (1 + (flare - 1) * 0.75 * u);
      const bb = Math.max(fitted.b, y < 0.525 ? B0 : 0) * (1 + (flare - 1) * 0.75 * u);
      return { t, w: y >= 0.525 ? Math.max(fitted.w, w) : w, f: ff, b: bb };
    });
    add(sweep(THREE, [[0, hemY, 0], [0, neckTop, 0]], keys, { rings: 110, segments: 64, roundness: 2.3 }), top.body);

    const end = SLEEVE_END[top.sleeve];
    if (end > 0) {
      const bell = top.kind === 'angrakha' || top.kind === 'maxi' ? 0.012 : 0.003;
      const sleeveKeys = f.armKeys.map((k) => ease(k, 0.006 + bell * smooth(clamp01((k.t - 0.3) / Math.max(0.01, end - 0.3)))));
      for (const path of f.armPaths) {
        add(sweep(THREE, path, sleeveKeys, { to: end, rings: 48, segments: 32, roundness: 2 }), top.sleeves);
        const sd = Math.sign(path[0][0]);
        const cap = add(new THREE.SphereGeometry(1, 32, 20), top.body);
        cap.scale.set(f.upper * 1.1 * f.armFat + 0.007, f.upper + 0.007, f.upper * 1.15 + 0.007);
        cap.position.set(sd * (f.jointX - 0.008), f.jointY - 0.012, -0.004);
      }
    }

    // Angrakha: the wrap panel crosses the front from the left of the neck to the right of the waist.
    if (top.kind === 'angrakha' && top.trim) {
      const path: [number, number, number][] = [0.83, 0.78, 0.72, 0.66, 0.61].map((y, i) => {
        const x = lerp(-0.035, f.waist * 0.85, i / 4);
        const ring = f.torsoAt(y);
        const across = Math.min(0.95, Math.abs(x) / (ring.w + e));
        return [x, y, (ring.f + e) * Math.sqrt(1 - across * across) + 0.003];
      });
      add(ribbon(THREE, path, () => 0.014, { rings: 40, across: 2 }), top.trim);
    }
  }

  /* Dupatta, scarf, shawl or hijab. */
  if (d.drape) {
    const { kind, mat } = d.drape;
    const sh = f.shoulder;
    const chestF = f.torsoAt(0.715).f + 0.02;
    const backZ = -(Math.max(f.torsoAt(0.6).b, f.torsoAt(0.5).b) + 0.03);
    if (kind === 'dupatta' || kind === 'scarf') {
      // Over both shoulders, a soft swag across the chest, the ends hanging down the back.
      const low = kind === 'scarf' ? 0.58 : 0.3;
      const half = (sd: number): [number, number, number][] => [
        [sd * 0.5 * sh, low, backZ],
        [sd * 0.56 * sh, (low + 0.8) / 2, backZ + 0.005],
        [sd * 0.62 * sh, 0.79, -0.05],
        [sd * 0.64 * sh, 0.826, -0.004],
        [sd * 0.48 * sh, 0.795, 0.05],
        [sd * 0.25 * sh, 0.72, chestF],
      ];
      const path = [...half(-1), [0, 0.69, chestF + 0.008] as [number, number, number], ...half(1).reverse()];
      const wide = kind === 'scarf' ? 0.08 : 0.12;
      // Narrower where it bunches over the shoulders and where it gathers across the chest.
      const width = (t: number) =>
        wide * (1 - 0.3 * (Math.exp(-((t - 0.36) ** 2) / 0.004) + Math.exp(-((t - 0.64) ** 2) / 0.004)) - 0.3 * Math.exp(-((t - 0.5) ** 2) / 0.006));
      add(ribbon(THREE, path, width, { rings: 120, across: 8 }), mat);
    } else if (kind === 'shawl') {
      const armOut = f.jointX + f.upper * 1.2 * f.armFat;
      const ys = [0.6, 0.7, 0.79, 0.815, 0.838];
      const keys = ys.map((y, i) => {
        const r = f.torsoAt(y);
        const w = [armOut + 0.05, armOut + 0.035, armOut + 0.02, f.shoulder * 0.8, 0.055][i];
        return { t: (y - 0.6) / 0.238, w, f: Math.max(r.f + 0.035, 0.045), b: Math.max(r.b + 0.035, 0.05) };
      });
      add(sweep(THREE, [[0, 0.6, 0], [0, 0.838, 0]], keys, { rings: 40, segments: 64, roundness: 2.2 }), mat);
    } else {
      // Hijab: wraps the head leaving the face open, then falls over the shoulders to the bust.
      add(head.skullGeo({ grow: 1.075, keep: ([x, y, z]) => !(z > 0.05 && (x / 0.74) ** 2 + ((y + 0.12) / 0.74) ** 2 < 1) }), mat);
      const chin = head.landmark(152);
      const topY = head.chinY + 0.006;
      // Snug at the neck, then rounding out over the shoulders (clear of any sleeve caps) to the bust.
      const ys = [0.68, 0.74, 0.79, 0.815, 0.845, topY];
      const keys = ys.map((y, i) => {
        const r = f.torsoAt(Math.min(y, 0.84));
        const w = [f.chest + 0.045, f.shoulder + 0.035, f.shoulder + 0.022, f.shoulder * 0.76, 0.05, head.width * 0.55][i];
        const ff = [r.f + 0.035, r.f + 0.035, r.f + 0.035, r.f + 0.03, 0.052, chin[2] + 0.012][i];
        const bb = [r.b + 0.03, r.b + 0.03, r.b + 0.03, r.b + 0.03, 0.052, head.width * 0.62][i];
        return { t: (y - 0.68) / (topY - 0.68), w, f: ff, b: bb };
      });
      add(sweep(THREE, [[0, 0.68, 0], [0, topY, 0]], keys, { rings: 48, segments: 64, roundness: 2.1 }), mat);
    }
  }

  /* Bag: in the right hand (clutch, potli) or hanging at the right hip from a shoulder strap. */
  if (d.bag) {
    const { kind, mat } = d.bag;
    const right = f.armPaths.find((p) => p[0][0] > 0)!;
    const hand = at(right, 0.9).p;
    if (kind === 'clutch') {
      const box = add(new THREE.BoxGeometry(0.02, 0.07, 0.12), mat);
      box.position.set(hand.x + 0.016, hand.y + 0.01, hand.z + 0.02);
    } else if (kind === 'potli') {
      const pouch = add(new THREE.SphereGeometry(0.03, 24, 16), mat);
      pouch.scale.set(1, 1.2, 1);
      pouch.position.set(hand.x + 0.004, hand.y - 0.07, hand.z + 0.004);
      add(sweep(THREE, [[hand.x, hand.y - 0.005, hand.z], [hand.x + 0.004, hand.y - 0.035, hand.z + 0.004]], [{ t: 0, w: 0.002, f: 0.002, b: 0.002 }, { t: 1, w: 0.002, f: 0.002, b: 0.002 }], { rings: 4, segments: 8 }), mat);
    } else {
      const tote = kind === 'tote';
      const bx = f.wristX + 0.045, by = tote ? 0.5 : 0.56, h = tote ? 0.15 : 0.11;
      const box = add(new THREE.BoxGeometry(0.04, h, tote ? 0.17 : 0.13), mat);
      box.position.set(bx, by, -0.005);
      const strapTop: [number, number, number] = [f.shoulder * 0.72, 0.826, -0.004];
      for (const z of [0.03, -0.04]) {
        const path: [number, number, number][] = [[bx, by + h / 2, z * 1.5], [(bx + f.shoulder) / 2 + 0.03, 0.72, z], [f.shoulder * 0.95, 0.8, z * 0.6], strapTop];
        add(sweep(THREE, path, [{ t: 0, w: 0.006, f: 0.002, b: 0.002 }, { t: 1, w: 0.006, f: 0.002, b: 0.002 }], { rings: 30, segments: 8, roundness: 2.6 }), mat);
      }
    }
  }

  /* Jewellery (whatever a hijab would hide is left off). */
  if (d.jewelry) {
    const { kind, mat } = d.jewelry;
    if ((kind === 'jhumkay' || kind === 'earrings') && !hijab) {
      for (const sd of [-1, 1]) {
        const lobe = head.at(sd * 0.98, -0.42, -0.02, 1.0);
        if (kind === 'jhumkay') {
          const bell = add(new THREE.ConeGeometry(0.0065, 0.012, 16, 1, true), mat);
          bell.position.set(lobe[0] + sd * 0.004, lobe[1] - 0.014, lobe[2]);
          const stud = add(new THREE.SphereGeometry(0.0032, 12, 8), mat);
          stud.position.set(lobe[0] + sd * 0.004, lobe[1] - 0.004, lobe[2]);
        } else {
          const drop = add(new THREE.SphereGeometry(0.0035, 12, 8), mat);
          drop.scale.set(1, 1.6, 1);
          drop.position.set(lobe[0] + sd * 0.004, lobe[1] - 0.008, lobe[2]);
        }
      }
    } else if (kind === 'necklace set' && !hijab) {
      const ring = add(new THREE.TorusGeometry(0.043, 0.0032, 10, 48), mat);
      ring.position.set(0, 0.818, 0.004);
      ring.rotation.x = Math.PI / 2 - 0.42; // lower at the front
      const pendant = add(new THREE.SphereGeometry(0.008, 16, 12), mat);
      pendant.scale.set(1, 1.3, 0.5);
      pendant.position.set(0, 0.8, f.torsoAt(0.8).f + 0.012);
    } else if (kind === 'maang tikka' && !hijab) {
      const forehead = head.landmark(10);
      const crown = head.at(0, 0.8, 0.45, 1.04);
      const drop = add(new THREE.SphereGeometry(0.0055, 16, 12), mat);
      drop.scale.set(1, 1.3, 0.6);
      drop.position.set(forehead[0], forehead[1] + 0.006, forehead[2] + 0.003);
      add(sweep(THREE, [[forehead[0], forehead[1] + 0.012, forehead[2]], crown], [{ t: 0, w: 0.0012, f: 0.0012, b: 0.0012 }, { t: 1, w: 0.0012, f: 0.0012, b: 0.0012 }], { rings: 10, segments: 6 }), mat);
    } else if (kind === 'bangles') {
      for (const path of f.armPaths) {
        const { p, tan } = at(path, 0.72);
        for (let i = 0; i < 3; i++) {
          const ring = add(new THREE.TorusGeometry(f.upper * 0.55 + 0.009, 0.0022, 8, 32), mat);
          ring.position.copy(p).addScaledVector(tan, (i - 1) * 0.0055);
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        }
      }
    }
  }
}

/** Distance from (x, y) to a closed polygon's edges. */
function distToPolygon(x: number, y: number, px: number[], py: number[]) {
  let best = Infinity;
  for (let i = 0; i < px.length; i++) {
    const j = (i + 1) % px.length;
    const ax = px[i], ay = py[i], bx = px[j], by = py[j];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** Outline of the face on MediaPipe's mesh, in order around the face. */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** Disposes all geometry in a group built by buildHuman (materials are owned by the caller). */
export function disposeHuman(g: T.Object3D) {
  g.traverse((o) => {
    const mesh = o as T.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/** Materials for a body. Pass `ghost` for a faded preview. */
export function makeMaterials(THREE: Three, opts: { skin: string; garment: string; ghost?: boolean }): HumanMaterials {
  const common = { transparent: true, opacity: opts.ghost ? 0.45 : 1, side: THREE.DoubleSide };
  return {
    skin: new THREE.MeshStandardMaterial({ color: opts.skin, roughness: 0.55, metalness: 0, ...common }),
    garment: new THREE.MeshStandardMaterial({ color: opts.garment, roughness: 0.85, metalness: 0, ...common }),
    shoes: new THREE.MeshStandardMaterial({ color: '#5a3b2e', roughness: 0.6, metalness: 0.05, ...common }),
    hair: new THREE.MeshStandardMaterial({ color: '#241812', roughness: 0.7, metalness: 0, ...common }),
  };
}

export function disposeMaterials(m: HumanMaterials) {
  for (const mat of Object.values(m)) (mat as T.Material | undefined)?.dispose();
}
