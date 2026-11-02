'use client';
import { useEffect, useRef, useState } from 'react';
import type * as T from 'three';
import {
  buildFor,
  buildHuman,
  disposeHuman,
  disposeMaterials,
  makeMaterials,
  mixBuild,
  DEFAULT_HEIGHT,
  type Build,
  type FaceShape,
  type Gender,
} from '@/lib/humanBody';
import { makeDress, type OutfitSpec } from '@/lib/outfit';

export type { Gender };
export { buildFor };

export interface FigureFace extends FaceShape {
  /** URL of the face image to wrap on the face mesh */
  textureUrl?: string;
}

/**
 * A rotating 3D person showing a body shape, optionally with the shopper's own face and skin tone.
 * One WebGL canvas, rebuilt only while morphing. three.js loads on first render, so it never lands in
 * the main bundle. Drag to turn the figure.
 */
export default function BodyFigure({
  gender,
  shape,
  heightCm,
  weightKg,
  skinHex,
  face,
  outfit,
  ghost = false,
  interactive = false,
  className = '',
}: {
  /** Clothes to wear (a recommended look); without it the figure wears the plain base layer */
  outfit?: OutfitSpec;
  gender: Gender;
  shape?: string;
  heightCm?: number;
  weightKg?: number;
  /** Skin colour; defaults to a neutral mannequin tone */
  skinHex?: string;
  face?: FigureFace;
  /** Show a faded figure (for "not sure") */
  ghost?: boolean;
  /** Let the person drag to rotate instead of the gentle auto-sway */
  interactive?: boolean;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const target = { build: buildFor(gender, shape), gender, heightCm, weightKg, skinHex, face, outfit, ghost, interactive };
  const targetRef = useRef(target);
  const [failed, setFailed] = useState(false);
  targetRef.current = target;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    import('three')
      .then((THREE) => {
        if (disposed) return;
        let renderer: T.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          setFailed(true);
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        mount.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.touchAction = 'pan-y';

        const scene = new THREE.Scene();
        // Framed for a ~190 cm person, so shorter people really do look shorter. The avatar view
        // (interactive) frames a little tighter, since there is only the one person to look at.
        const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
        if (targetRef.current.interactive) {
          camera.position.set(0, 0.93, 4.05); // head to toe for people up to ~185 cm
          camera.lookAt(0, 0.9, 0);
        } else {
          camera.position.set(0, 0.98, 4.3);
          camera.lookAt(0, 0.93, 0);
        }

        scene.add(new THREE.HemisphereLight(0xfff6ee, 0xb9a593, 1.5));
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(2.5, 4, 4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffe9dc, 0.6);
        fill.position.set(-3, 1.5, 3);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xc78bb5, 1.4); // plum rim light
        rim.position.set(-3, 3, -3);
        scene.add(rim);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.32, 48),
          new THREE.MeshBasicMaterial({ color: 0x6b2d5c, transparent: true, opacity: 0.1 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.001;
        scene.add(shadow);

        const pivot = new THREE.Group();
        scene.add(pivot);

        // Materials and the face texture are swapped only when their inputs change.
        const loader = new THREE.TextureLoader();
        let mats = makeMaterials(THREE, { skin: '#d9b79c', garment: '#ece3da' });
        let matKey = '';
        let faceTexture: T.Texture | null = null;
        let faceUrl: string | undefined;
        const syncMaterials = () => {
          const t = targetRef.current;
          const skin = t.skinHex ?? '#d9b79c';
          const garment = t.gender === 'male' ? '#d9d6d2' : '#ece3da';
          const k = `${skin}|${garment}|${t.ghost}`;
          if (k !== matKey) {
            disposeMaterials({ ...mats, face: undefined });
            mats = { ...makeMaterials(THREE, { skin, garment, ghost: t.ghost }), face: mats.face };
            matKey = k;
            needsRebuild = true;
          }
          const url = t.face?.textureUrl;
          if (url !== faceUrl) {
            faceUrl = url;
            faceTexture?.dispose();
            mats.face?.dispose();
            faceTexture = null;
            mats.face = undefined;
            if (url) {
              faceTexture = loader.load(url, () => { needsRebuild = true; });
              faceTexture.colorSpace = THREE.SRGBColorSpace;
              faceTexture.anisotropy = 4;
              mats.face = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
            }
            needsRebuild = true;
          }
          // The outfit's materials are made once per outfit and kept while it is worn.
          const outfitKey = t.outfit ? JSON.stringify(t.outfit) : '';
          if (outfitKey !== dressKey) {
            dressed?.dispose();
            dressed = t.outfit ? makeDress(THREE, t.outfit) : null;
            dressKey = outfitKey;
            needsRebuild = true;
          }
        };
        let dressed: ReturnType<typeof makeDress> | null = null;
        let dressKey = '';

        let body: T.Group | null = null;
        let needsRebuild = true;
        let built = { gender: targetRef.current.gender, face: targetRef.current.face, h: targetRef.current.heightCm, w: targetRef.current.weightKg };
        const rebuild = (b: Build) => {
          if (body) {
            disposeHuman(body);
            pivot.remove(body);
          }
          const t = targetRef.current;
          body = buildHuman(THREE, { gender: t.gender, build: b, heightCm: t.heightCm, weightKg: t.weightKg, face: t.face }, mats, dressed?.dress);
          pivot.add(body);
          built = { gender: t.gender, face: t.face, h: t.heightCm, w: t.weightKg };
          needsRebuild = false;
        };

        // Morph state
        let shown = targetRef.current.build;
        let from = shown;
        let to = shown;
        let t = 1;

        const resize = () => {
          const w = mount.clientWidth || 1;
          const h = mount.clientHeight || 1;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = '100%';
          renderer.domElement.style.height = '100%';
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(mount);

        // Drag to rotate (interactive mode).
        let dragging = false;
        let lastX = 0;
        let spin = 0.35;
        const down = (e: PointerEvent) => {
          if (!targetRef.current.interactive) return;
          dragging = true;
          lastX = e.clientX;
          renderer.domElement.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!dragging) return;
          spin += (e.clientX - lastX) * 0.012;
          lastX = e.clientX;
        };
        const up = () => { dragging = false; };
        renderer.domElement.addEventListener('pointerdown', down);
        renderer.domElement.addEventListener('pointermove', move);
        renderer.domElement.addEventListener('pointerup', up);
        renderer.domElement.addEventListener('pointercancel', up);

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let raf = 0;
        let last = performance.now();
        let angle = 0.5;
        const frame = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.1);
          last = now;
          const target = targetRef.current;
          syncMaterials();

          if (target.gender !== built.gender || target.face !== built.face || target.heightCm !== built.h || target.weightKg !== built.w) {
            if (target.gender !== built.gender) { from = to = shown = target.build; t = 1; }
            needsRebuild = true;
          }
          if (JSON.stringify(target.build) !== JSON.stringify(to)) {
            from = shown;
            to = target.build;
            t = reduce ? 1 : 0;
          }
          if (t < 1) {
            t = Math.min(1, t + dt / 0.35);
            const e = 1 - Math.pow(1 - t, 3);
            shown = mixBuild(from, to, e);
            needsRebuild = true;
          } else if (shown !== to) {
            shown = to;
            needsRebuild = true;
          }
          if (needsRebuild) rebuild(shown);

          pivot.scale.setScalar((target.heightCm ?? DEFAULT_HEIGHT[target.gender]) / 100);

          if (target.interactive) {
            if (!dragging && !reduce) spin += dt * 0.25;
            pivot.rotation.y = spin;
          } else {
            if (!reduce) angle += dt * 0.6;
            pivot.rotation.y = reduce ? 0.45 : Math.sin(angle) * 0.9;
          }
          renderer.render(scene, camera);
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          renderer.domElement.removeEventListener('pointerdown', down);
          renderer.domElement.removeEventListener('pointermove', move);
          renderer.domElement.removeEventListener('pointerup', up);
          renderer.domElement.removeEventListener('pointercancel', up);
          if (body) disposeHuman(body);
          disposeMaterials(mats);
          dressed?.dispose();
          faceTexture?.dispose();
          shadow.geometry.dispose();
          (shadow.material as T.Material).dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={mountRef} className={`relative ${className}`} aria-hidden="true">
      {failed && <div className="flex h-full items-center justify-center text-xs text-ink/40">Preview unavailable</div>}
    </div>
  );
}
