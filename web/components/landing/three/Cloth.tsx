'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, PlaneGeometry, Vector3, type CatmullRomCurve3 } from 'three';
import { stage } from './store';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uFreq;
  uniform float uPinned;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Pinned cloth hangs from its top edge and moves more towards the free end.
    float free = mix(1.0, pow(1.0 - uv.y, 1.4), uPinned);
    float t = uTime + uSeed;
    float w = sin(p.x * uFreq + t * 1.1 + p.y * uFreq * 0.7)
            + 0.5 * sin(p.y * uFreq * 1.9 - t * 0.8 + p.x * 0.6)
            + 0.25 * sin((p.x + p.y) * uFreq * 3.1 + t * 1.6);
    p.z += w * uAmp * free;
    p.x += 0.35 * uAmp * free * sin(p.y * uFreq + t * 0.7);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGold;
  uniform float uBorder;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    // The surface normal comes from screen-space derivatives, so the waves catch the light without extra data.
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    vec3 v = normalize(cameraPosition - vPos);
    if (dot(n, v) < 0.0) n = -n;
    vec3 l = normalize(vec3(0.5, 0.9, 0.7));
    float diff = 0.45 + 0.55 * max(dot(n, l), 0.0);
    float sheen = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = uColor * diff + uColor * sheen * 0.45;
    // A slight gold shimmer travelling through the weave.
    float shimmer = pow(max(sin((vUv.x + vUv.y) * 34.0 + uTime * 0.9), 0.0), 18.0);
    col += uGold * shimmer * 0.16;
    // Gold border along the long edges and the free end, like a gota trim.
    if (uBorder > 0.0) {
      float e = min(min(vUv.x, 1.0 - vUv.x), vUv.y);
      float band = 1.0 - smoothstep(uBorder * 0.75, uBorder, e);
      col = mix(col, uGold * (0.6 + 0.6 * diff), band);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GOLD = new Color('#D9B36A');

/**
 * A strip of cloth that follows a curve: the dupatta over the shoulder and the S mark.
 * `taper` narrows both ends; 0 keeps the width even along the whole length.
 */
export function ribbon(curve: CatmullRomCurve3, width: number, segments: number, taper = 0) {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const side = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    side.set(-tan.y, tan.x, 0.2).normalize();
    const w = width * (1 - taper + taper * Math.pow(Math.sin(Math.PI * t), 0.6));
    pos.push(c.x + side.x * w, c.y + side.y * w, c.z + side.z * w, c.x - side.x * w, c.y - side.y * w, c.z - side.z * w);
    uv.push(0, t, 1, t);
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

export function useClothMaterialArgs({ color, amp = 0.12, freq = 3, pinned = false, border = 0.05, seed = 0 }: {
  color: string;
  amp?: number;
  freq?: number;
  pinned?: boolean;
  border?: number;
  seed?: number;
}) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: amp },
      uFreq: { value: freq },
      uPinned: { value: pinned ? 1 : 0 },
      uSeed: { value: seed },
      uBorder: { value: border },
      uColor: { value: new Color(color) },
      uGold: { value: GOLD },
    }),
    [amp, freq, pinned, seed, border, color],
  );
  useFrame(() => {
    uniforms.uTime.value = stage.time;
  });
  return uniforms;
}

/** A flowing dupatta: a subdivided plane moved entirely by the vertex shader, with no external assets. */
export default function Cloth({ size = [1, 2], segments = [24, 48], geometry, ...look }: {
  size?: [number, number];
  segments?: [number, number];
  geometry?: BufferGeometry;
  color: string;
  amp?: number;
  freq?: number;
  pinned?: boolean;
  border?: number;
  seed?: number;
}) {
  const uniforms = useClothMaterialArgs(look);
  const plane = useMemo(() => geometry ?? new PlaneGeometry(size[0], size[1], segments[0], segments[1]), [geometry, size, segments]);
  return (
    <mesh geometry={plane} frustumCulled={false}>
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} side={DoubleSide} />
    </mesh>
  );
}
