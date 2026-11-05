'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, CatmullRomCurve3, TubeGeometry, Vector3, type Group, type Mesh } from 'three';
import Cloth, { ribbon } from './Cloth';
import Figure, { Body, Clutch, Dupatta, Jhumkay, Kameez, Shalwar, Shoes } from './Figure';
import { clamp01, easeOutBack, sceneOffset, smooth, stage } from './store';

const NIGHT = '#1E1020';

/* -------------------------------- Scroll, shared by every scene -------------------------------- */

/** Reads the page's scene sections into the store, and reports whether any of them is on screen. */
function useStageTracking(onVisible: (v: boolean) => void) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.reduced = reduced;
    const sections = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
    let visible: boolean | null = null;
    const read = () => {
      const vh = window.innerHeight;
      let any = false;
      for (const el of sections) {
        const i = Number(el.dataset.scene);
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) any = true;
        const p = -r.top / Math.max(1, r.height - vh);
        // Reduced motion: no scroll-linked movement, each scene simply sits finished in its section.
        stage.target[i] = reduced ? (p < -0.3 ? -1 : p > 1.3 ? 2 : 0.92) : p;
      }
      if (any !== visible) {
        visible = any;
        onVisible(any);
      }
    };
    read();
    stage.eased = [...stage.target];
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [onVisible]);
}

/** Runs each frame: time, easing, and keeps the camera fitted to the screen shape. */
function Director() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.viewport.aspect);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.position.set(0, 1.8, aspect < 0.8 ? 9.6 : 7.6);
    camera.lookAt(0, 1.8, 0);
  }, [camera, aspect]);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    if (!stage.reduced) stage.time += step;
    const k = stage.reduced ? 1 : 1 - Math.exp(-step * 6);
    let moving = false;
    for (let i = 0; i < 4; i++) {
      const d = stage.target[i] - stage.eased[i];
      stage.eased[i] += d * k;
      if (Math.abs(d) > 0.001) moving = true;
    }
    if (stage.reduced && moving) invalidate();
  });
  return null;
}

/** With reduced motion the canvas only draws on request, so it must redraw as the sections change. */
function RedrawOnScroll() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener('scroll', redraw, { passive: true });
    return () => window.removeEventListener('scroll', redraw);
  }, [invalidate]);
  return null;
}

/**
 * One scene's frame: slides in and out with the scroll, sits to the right of the text on large screens
 * and above it on phones, and shrinks to fit a narrow screen.
 */
function SceneFrame({ index, children }: { index: number; children: React.ReactNode }) {
  const group = useRef<Group>(null);
  const aspect = useThree((s) => s.viewport.aspect);
  const wide = aspect > 1.15;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const off = sceneOffset(stage.eased[index]);
    g.visible = Math.abs(off) < 0.999;
    g.position.set(wide ? 1.75 : 0, (wide ? 0 : 1.05) + off * 8, 0);
  });
  return (
    <group ref={group} visible={false} scale={wide ? 1 : 0.86}>
      {children}
    </group>
  );
}

const useSceneP = (index: number) => () => clamp01(stage.eased[index]);

/** A soft glow, in place of real post-processing. */
function Glow({ radius = 1.6, color = '#E2C07A', power = 1 }: { radius?: number; color?: string; power?: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new Vector3(...hex(color)) }, uPower: { value: power } }), [color, power]);
  return (
    <mesh>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}"
        fragmentShader="uniform vec3 uColor;uniform float uPower;varying vec2 vUv;void main(){float d=distance(vUv,vec2(.5))*2.;float a=pow(max(1.-d,0.),2.2)*uPower;gl_FragColor=vec4(uColor,a);}"
      />
    </mesh>
  );
}
function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      <circleGeometry args={[1.1, 40]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

/* --------------------------- Scene 1: swatches gather around a mannequin --------------------------- */

const SWATCHES = [
  { color: '#0F7B5A', from: [-3.6, 3.6, -1.2], angle: 0 },
  { color: '#F3C9D0', from: [3.4, 3.9, -0.8], angle: 1.05 },
  { color: '#F6EFE0', from: [-3.1, 0.4, 0.6], angle: 2.1 },
  { color: '#6F1D2B', from: [3.6, 0.8, 0.4], angle: 3.15 },
  { color: '#A3B18A', from: [-2.2, -0.6, -1.5], angle: 4.2 },
  { color: '#C9A24A', from: [2.3, -0.4, -1.4], angle: 5.25 },
] as const;

function Swatch({ color, from, angle, i }: { color: string; from: readonly number[]; angle: number; i: number }) {
  const ref = useRef<Group>(null);
  const p = useSceneP(0);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smooth(0.02, 0.72, p());
    const a = angle + stage.time * 0.22;
    const y = 1.1 + (i % 3) * 0.75 + Math.sin(stage.time * 0.6 + i) * 0.1;
    g.position.set(
      from[0] + (Math.cos(a) * 1.28 - from[0]) * t,
      from[1] + (y - from[1]) * t,
      from[2] + (Math.sin(a) * 1.28 - from[2]) * t,
    );
    g.rotation.set(0.25 * Math.sin(stage.time * 0.4 + i), -a + Math.PI / 2 * t + i, 0.2 * Math.cos(stage.time * 0.3 + i));
  });
  return (
    <group ref={ref}>
      <Cloth size={[0.62, 0.8]} segments={[14, 18]} color={color} amp={0.05} freq={5} border={0.05} seed={i * 1.7} />
    </group>
  );
}

function TasteScene() {
  return (
    <SceneFrame index={0}>
      <group position={[0, 1.8, -1.4]}><Glow radius={2.6} color="#7D3A6C" power={0.75} /></group>
      <Floor />
      <Figure kameez="#EFE5D6" shalwar="#EFE5D6" />
      {SWATCHES.map((s, i) => <Swatch key={s.color} {...s} i={i} />)}
    </SceneFrame>
  );
}

/* ---------------------------------- Scene 2: three looks are ranked --------------------------------- */

const RANKED = [
  { kameez: '#A3B18A', shalwar: '#F1E9DF', dupatta: '#F6EFE0', from: -1.55, to: 0 },
  { kameez: '#6F1D2B', shalwar: '#3A1420', dupatta: '#C9A24A', from: 0, to: -1.55 },
  { kameez: '#E9B7C2', shalwar: '#F6EFE0', dupatta: '#F3C9D0', from: 1.55, to: 1.55 },
];

function Ranked({ look, i, fit }: { look: (typeof RANKED)[number]; i: number; fit: number }) {
  const ref = useRef<Group>(null);
  const glow = useRef<Group>(null);
  const p = useSceneP(1);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smooth(0.45, 0.86, p());
    g.position.x = (look.from + (look.to - look.from) * t) * fit;
    // The look being promoted steps forward as it crosses in front of the other.
    g.position.z = i === 1 ? Math.sin(t * Math.PI) * 0.9 : 0;
    g.rotation.y = Math.sin(stage.time * 0.35 + i) * 0.12;
    if (glow.current) glow.current.scale.setScalar(i === 1 ? 0.0001 + smooth(0.08, 0.36, p()) : 0.0001);
  });
  return (
    <group ref={ref}>
      <group ref={glow} position={[0, 1.8, -0.5]}><Glow radius={1.9} power={0.85} /></group>
      <Floor />
      <Figure kameez={look.kameez} shalwar={look.shalwar} dupatta={look.dupatta} seed={i * 2.1} />
    </group>
  );
}

function RankScene() {
  const aspect = useThree((s) => s.viewport.aspect);
  return (
    <SceneFrame index={1}>
      {/* Lifted on narrow screens so the smaller figures still stand clear of the text. */}
      <group scale={aspect > 1.15 ? 0.92 : Math.min(0.92, aspect * 1.35)} position={[0, aspect > 1.15 ? 0 : 0.5, 0]}>
        {RANKED.map((l, i) => <Ranked key={i} look={l} i={i} fit={1} />)}
      </group>
    </SceneFrame>
  );
}

/* --------------------------- Scene 3: a look builds itself, piece by piece --------------------------- */

function Piece({ start, end, drop = 0.5, children }: { start: number; end: number; drop?: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const p = useSceneP(2);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = (p() - start) / (end - start);
    g.visible = t > 0;
    const e = easeOutBack(t);
    g.position.y = (1 - clamp01(e)) * drop;
    g.scale.setScalar(Math.max(0.001, e));
  });
  return <group ref={ref} visible={false}>{children}</group>;
}

function BuildScene() {
  const turn = useRef<Group>(null);
  const p = useSceneP(2);
  useFrame(() => {
    // The figure turns rather than the camera, which gives the same slow orbit on one shared camera.
    if (turn.current) turn.current.rotation.y = -0.35 + smooth(0.6, 1, p()) * Math.PI * 1.1;
  });
  return (
    <SceneFrame index={2}>
      <group position={[0, 1.8, -1.4]}><Glow radius={2.6} color="#0F7B5A" power={0.5} /></group>
      <Floor />
      <group ref={turn}>
        <Body />
        <Piece start={0.03} end={0.2}><Kameez color="#0F7B5A" /><Shalwar color="#F1E9DF" /></Piece>
        <Piece start={0.2} end={0.36} drop={1.4}><Dupatta color="#F6EFE0" seed={3} /></Piece>
        <Piece start={0.36} end={0.48} drop={0.9}><Shoes /></Piece>
        <Piece start={0.48} end={0.58} drop={0.7}><Clutch /></Piece>
        <Piece start={0.58} end={0.68} drop={0.4}><Jhumkay /></Piece>
      </group>
    </SceneFrame>
  );
}

/* ------------------------------ Scene 4: fabric and thread become the S ------------------------------ */

// The S, drawn top right to bottom left, centred on the figure height used by the other scenes.
const S_CURVE = new CatmullRomCurve3(
  [
    [0.95, 3.1], [0.45, 3.45], [-0.45, 3.4], [-0.95, 2.85], [-0.5, 2.2], [0.5, 1.75],
    [0.98, 1.15], [0.5, 0.42], [-0.45, 0.32], [-1.0, 0.72],
  ].map(([x, y], i) => new Vector3(x, y, Math.sin(i * 0.9) * 0.14)),
);

const THREAD_SEGMENTS = 70;
const THREAD_SIDES = 5;
const THREAD_INDICES = THREAD_SEGMENTS * THREAD_SIDES * 6;

function threads() {
  const out: TubeGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const end = S_CURVE.getPointAt((i + 0.5) / 14);
    const start = new Vector3(Math.cos(a) * 4.4, 1.8 + Math.sin(a) * 3.4, -1.2 + (i % 3) * 0.6);
    const mid = start.clone().lerp(end, 0.55).add(new Vector3(Math.sin(i * 2.3) * 0.9, Math.cos(i * 1.7) * 0.9, 0.5));
    out.push(new TubeGeometry(new CatmullRomCurve3([start, mid, end]), THREAD_SEGMENTS, 0.012, THREAD_SIDES));
  }
  return out;
}

function Thread({ geometry, i }: { geometry: TubeGeometry; i: number }) {
  const ref = useRef<Mesh>(null);
  const p = useSceneP(3);
  useFrame(() => {
    const g = ref.current?.geometry;
    if (!g) return;
    // Each thread draws itself towards the S, then its tail follows it in.
    const delay = (i % 7) * 0.02;
    const head = smooth(0.02 + delay, 0.5 + delay, p());
    const tail = smooth(0.5 + delay, 0.86 + delay, p());
    const unit = THREAD_SIDES * 6;
    const from = Math.floor(tail * THREAD_SEGMENTS) * unit;
    const to = Math.floor(head * THREAD_SEGMENTS) * unit;
    g.setDrawRange(from, Math.max(0, Math.min(to, THREAD_INDICES) - from));
  });
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color="#E2C07A" />
    </mesh>
  );
}

function FinaleScene() {
  const p = useSceneP(3);
  const ribbonGeo = useMemo(() => ribbon(S_CURVE, 0.27, 160, 0.72), []);
  const threadGeos = useMemo(threads, []);
  const stitch = useMemo(() => new TubeGeometry(S_CURVE, 200, 0.014, 6), []);
  const ribbonGroup = useRef<Group>(null);
  const stitchMesh = useRef<Mesh>(null);
  const holder = useRef<Group>(null);
  useFrame(() => {
    const t = smooth(0.25, 0.8, p());
    const r = ribbonGroup.current?.children[0] as Mesh | undefined;
    r?.geometry.setDrawRange(0, Math.floor(t * 160) * 6);
    stitchMesh.current?.geometry.setDrawRange(0, Math.floor(smooth(0.35, 0.9, p()) * 200) * 36);
    if (holder.current) holder.current.rotation.y = Math.sin(stage.time * 0.3) * 0.16;
  });
  return (
    <SceneFrame index={3}>
      <group position={[0, 1.8, -1.2]}><Glow radius={3} color="#6B2D5C" power={0.9} /></group>
      {threadGeos.map((g, i) => <Thread key={i} geometry={g} i={i} />)}
      <group ref={holder} scale={0.84} position={[0, 0.2, 0]}>
        <group ref={ribbonGroup}>
          <Cloth geometry={ribbonGeo} color="#A65A92" amp={0.015} freq={4} border={0} seed={1} />
        </group>
        <mesh ref={stitchMesh} geometry={stitch} position={[0, 0, 0.09]} frustumCulled={false}>
          <meshBasicMaterial color="#E2C07A" />
        </mesh>
      </group>
    </SceneFrame>
  );
}

/* -------------------------------------------- The canvas -------------------------------------------- */

/** One fixed canvas behind the page. It is decorative: hidden from assistive tech and from the pointer. */
export default function Scene3D() {
  const [onScreen, setOnScreen] = useState(false);
  const [dpr, setDpr] = useState<[number, number]>([1, 1.5]);
  const [reduced, setReduced] = useState(false);
  useStageTracking(setOnScreen);

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(isReduced);
    if (window.innerWidth >= 1024) setDpr([1, 2]);
    if (isReduced) return;
    // Smooth scrolling comes with the 3D chunk only, so the 2D page stays on native scrolling.
    let lenis: { destroy(): void } | undefined;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (!cancelled) lenis = new Lenis({ autoRaf: true, lerp: 0.1 });
    });
    return () => {
      cancelled = true;
      lenis?.destroy();
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[100lvh]" style={{ background: NIGHT, visibility: onScreen ? 'visible' : 'hidden' }}>
      <Canvas
        dpr={dpr}
        frameloop={onScreen && !reduced ? 'always' : 'demand'}
        camera={{ fov: 35, near: 0.1, far: 40, position: [0, 1.8, 7.6] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[NIGHT]} />
        <hemisphereLight args={['#FFF4E6', '#3A2040', 1.15]} />
        <directionalLight position={[3, 6, 5]} intensity={1.7} color="#FFEBD0" />
        <directionalLight position={[-4, 3, -2]} intensity={0.8} color="#D9A7C7" />
        <Director />
        <RedrawOnScroll />
        <TasteScene />
        <RankScene />
        <BuildScene />
        <FinaleScene />
      </Canvas>
    </div>
  );
}
