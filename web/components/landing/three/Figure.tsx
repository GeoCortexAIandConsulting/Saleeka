'use client';
import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { CatmullRomCurve3, LatheGeometry, SplineCurve, SphereGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import Cloth, { ribbon } from './Cloth';

/**
 * Faceless, stylised mannequins built from simple geometry. Feet at y = 0, about 3.4 units tall.
 * An optional model at public/models/mannequin.glb replaces the body; next.config.mjs reports whether it exists.
 */
const HAS_GLB = process.env.NEXT_PUBLIC_HAS_MANNEQUIN === '1';
const GlbBody = HAS_GLB ? lazy(() => import('./GlbBody')) : null;

const IVORY = '#EADFD0';
const GOLD = '#C9A24A';

function lathe(points: Array<[number, number]>) {
  const curve = new SplineCurve(points.map(([r, y]) => new Vector2(r, y)));
  return new LatheGeometry(curve.getPoints(36), 40);
}
function tube(points: Array<[number, number, number]>, radius: number) {
  return new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 20, radius, 10);
}

// Shared by every figure, so several mannequins cost no extra memory.
const GEO = {
  head: new SphereGeometry(0.2, 28, 24),
  neck: lathe([[0.075, 2.98], [0.08, 2.86], [0.12, 2.78]]),
  kameez: lathe([[0.1, 2.84], [0.34, 2.72], [0.31, 2.45], [0.25, 2.2], [0.36, 1.85], [0.54, 1.12]]),
  hemTrim: lathe([[0.535, 1.2], [0.55, 1.12], [0.54, 1.1]]),
  neckTrim: lathe([[0.11, 2.85], [0.135, 2.81], [0.16, 2.79]]),
  sleeveL: tube([[-0.33, 2.7, 0], [-0.44, 2.2, 0.02], [-0.5, 1.68, 0.06]], 0.075),
  sleeveR: tube([[0.33, 2.7, 0], [0.44, 2.2, 0.02], [0.5, 1.68, 0.06]], 0.075),
  hand: new SphereGeometry(0.07, 14, 12),
  leg: lathe([[0.19, 1.3], [0.2, 0.7], [0.14, 0.14], [0.13, 0.1]]),
  shoe: new SphereGeometry(0.1, 16, 12),
  stud: new SphereGeometry(0.026, 10, 8),
  drop: lathe([[0.001, 0.06], [0.03, 0.02], [0.012, -0.05], [0.001, -0.06]]),
};

function ProceduralBody() {
  return (
    <group>
      <mesh geometry={GEO.head} position={[0, 3.14, 0]} scale={[0.86, 1.1, 0.92]}>
        <meshStandardMaterial color={IVORY} roughness={0.55} />
      </mesh>
      <mesh geometry={GEO.neck}>
        <meshStandardMaterial color={IVORY} roughness={0.55} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.hand} position={[s * 0.51, 1.58, 0.07]} scale={[0.8, 1.3, 0.7]}>
          <meshStandardMaterial color={IVORY} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

class GlbFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ProceduralBody /> : this.props.children;
  }
}

export function Body() {
  if (!GlbBody) return <ProceduralBody />;
  return (
    <GlbFallback>
      <Suspense fallback={<ProceduralBody />}>
        <GlbBody />
      </Suspense>
    </GlbFallback>
  );
}

export function Kameez({ color }: { color: string }) {
  return (
    <group>
      <mesh geometry={GEO.kameez} scale={[1, 1, 0.72]}>
        <meshStandardMaterial color={color} roughness={0.62} side={2} />
      </mesh>
      <mesh geometry={GEO.hemTrim} scale={[1, 1, 0.72]}>
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh geometry={GEO.neckTrim} scale={[1, 1, 0.72]}>
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh geometry={GEO.sleeveL}>
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh geometry={GEO.sleeveR}>
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
    </group>
  );
}

export function Shalwar({ color }: { color: string }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.leg} position={[s * 0.16, 0, 0]}>
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// Up the back, over the left shoulder and down the front, falling across the body.
const DUPATTA_PATH = new CatmullRomCurve3(
  [[0.42, 1.0, -0.42], [0.36, 2.0, -0.32], [0.3, 2.68, -0.2], [0.27, 2.86, 0.0], [0.26, 2.68, 0.22], [0.18, 2.1, 0.36], [0.06, 1.4, 0.44], [-0.02, 0.86, 0.5]]
    .map(([x, y, z]) => new Vector3(x, y, z)),
);
const DUPATTA_GEO = ribbon(DUPATTA_PATH, 0.15, 70);

export function Dupatta({ color, seed = 0 }: { color: string; seed?: number }) {
  return <Cloth geometry={DUPATTA_GEO} color={color} amp={0.02} freq={3.4} border={0.08} seed={seed} />;
}

export function Shoes() {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.shoe} position={[s * 0.17, 0.07, 0.07]} scale={[0.85, 0.6, 1.5]}>
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export function Clutch() {
  return (
    <group position={[-0.62, 1.42, 0.14]} rotation={[0, 0.3, 0.06]}>
      <mesh>
        <boxGeometry args={[0.3, 0.18, 0.08]} />
        <meshStandardMaterial color="#F6EFE0" metalness={0.15} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.095, 0]}>
        <boxGeometry args={[0.31, 0.022, 0.09]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Jhumkay() {
  const material = useMemo(() => ({ color: GOLD, metalness: 0.85, roughness: 0.28 }), []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.178, 3.06, 0.01]}>
          <mesh geometry={GEO.stud}>
            <meshStandardMaterial {...material} />
          </mesh>
          <mesh geometry={GEO.drop} position={[0, -0.09, 0]} scale={1.15}>
            <meshStandardMaterial {...material} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A dressed mannequin. */
export default function Figure({ kameez, shalwar, dupatta, seed = 0 }: { kameez: string; shalwar: string; dupatta?: string; seed?: number }) {
  return (
    <group>
      <Body />
      <Kameez color={kameez} />
      <Shalwar color={shalwar} />
      {dupatta && <Dupatta color={dupatta} seed={seed} />}
      <Shoes />
    </group>
  );
}
