'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FigureFace, Gender } from '@/components/BodyFigure';

export interface AvatarInfo {
  gender: Gender;
  bodyShape?: string;
  heightCm?: number;
  weightKg?: number;
  hijab: boolean;
  /** The shopper's own face, when they have made one on the Account page */
  face?: FigureFace;
  skinHex?: string;
}

let cache: Promise<AvatarInfo> | null = null;

async function load(): Promise<AvatarInfo> {
  const [{ profile }, face] = await Promise.all([
    api<{ profile: { gender?: Gender; bodyShape?: string; heightCm?: number; weightKg?: number; hijab?: boolean } }>('/profile'),
    api<{ points: number[]; uvs: number[]; skinHex: string; avatarVersion: string }>('/me/avatar').catch(() => null),
  ]);
  return {
    gender: profile.gender ?? 'female',
    bodyShape: profile.bodyShape,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    hijab: !!profile.hijab,
    face: face ? { points: face.points, uvs: face.uvs, textureUrl: `/api/me/avatar/face?v=${encodeURIComponent(face.avatarVersion)}` } : undefined,
    skinHex: face?.skinHex,
  };
}

/** The shopper's body and face for try-ons, loaded once per page and shared by every look. */
export function useAvatar(enabled = true) {
  const [info, setInfo] = useState<AvatarInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    cache ??= load();
    cache.then((v) => live && setInfo(v)).catch((e) => {
      cache = null; // try again next time
      if (live) setError(e.message ?? 'Could not load your avatar');
    });
    return () => { live = false; };
  }, [enabled]);
  return { info, error };
}

/** Call after the avatar or body answers change, so the next try-on picks them up. */
export function forgetAvatar() {
  cache = null;
}
