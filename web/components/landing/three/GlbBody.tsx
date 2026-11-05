'use client';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';

const URL = '/models/mannequin.glb';

/**
 * Optional model, loaded only if public/models/mannequin.glb exists when the site is built or started.
 * It is scaled to the same 3.4-unit height as the procedural mannequin and given a matte ivory finish.
 * Use a faceless model only: never a real person or a likeness.
 * Draco-compressed files fetch their decoder from drei's default CDN.
 */
export default function GlbBody() {
  const { scene } = useGLTF(URL, true);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    const material = new MeshStandardMaterial({ color: '#EADFD0', roughness: 0.55 });
    copy.traverse((o) => {
      if (o instanceof Mesh) o.material = material;
    });
    const box = new Box3().setFromObject(copy);
    const size = box.getSize(new Vector3());
    const scale = 3.4 / (size.y || 1);
    copy.scale.setScalar(scale);
    copy.position.y = -box.min.y * scale;
    return copy;
  }, [scene]);
  return <primitive object={model} />;
}
