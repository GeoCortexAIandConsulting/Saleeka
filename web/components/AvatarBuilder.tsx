'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import BodyFigure, { type FigureFace, type Gender } from '@/components/BodyFigure';
import { api } from '@/lib/api';
import { bitmapFromFile, buildAvatarFace, preloadFaceModel, type AvatarFacePayload } from '@/lib/faceCapture';
import { forgetAvatar } from '@/lib/useAvatar';

interface SavedFace {
  points: number[];
  uvs: number[];
  skinHex: string;
  avatarVersion: string;
}

/**
 * The shopper's 3D avatar: body from height, weight and body shape; face and skin tone from one
 * front-facing selfie. The face is found and shaped on this device; only the face-mesh numbers and a
 * small face image are saved (removable any time).
 */
export default function AvatarBuilder({
  gender,
  bodyShape,
  heightCm,
  weightKg,
  avatarVersion,
  onChange,
}: {
  gender: Gender;
  bodyShape?: string;
  heightCm?: number;
  weightKg?: number;
  avatarVersion: string | null;
  onChange: (version: string | null) => void;
}) {
  const [saved, setSaved] = useState<SavedFace | null>(null);
  const [draft, setDraft] = useState<AvatarFacePayload | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState<'' | 'reading' | 'saving' | 'removing'>('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!avatarVersion) { setSaved(null); return; }
    api<SavedFace>('/me/avatar').then(setSaved).catch(() => setSaved(null));
  }, [avatarVersion]);

  const face: FigureFace | undefined = useMemo(() => {
    if (draft) return { points: draft.points, uvs: draft.uvs, textureUrl: draft.texture };
    if (saved) return { points: saved.points, uvs: saved.uvs, textureUrl: `/api/me/avatar/face?v=${encodeURIComponent(saved.avatarVersion)}` };
    return undefined;
  }, [draft, saved]);
  const skinHex = draft?.skinHex ?? saved?.skinHex;

  async function fromSource(make: () => Promise<Parameters<typeof buildAvatarFace>[0]>) {
    setError('');
    setBusy('reading');
    try {
      const src = await make();
      setDraft(await buildAvatarFace(src));
      if ('close' in src && typeof src.close === 'function') src.close();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try another photo.');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!draft) return;
    setBusy('saving');
    setError('');
    try {
      const out = await api<{ avatarVersion: string }>('/me/avatar', { method: 'PUT', body: draft });
      setDraft(null);
      forgetAvatar();
      onChange(out.avatarVersion);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    setBusy('removing');
    setError('');
    try {
      await api('/me/avatar', { method: 'DELETE' });
      setDraft(null);
      forgetAvatar();
      onChange(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const missing = [!heightCm && 'height', !weightKg && 'weight', !bodyShape && 'body shape'].filter(Boolean) as string[];

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-plum-soft to-ivory">
        <BodyFigure
          gender={gender}
          shape={bodyShape}
          heightCm={heightCm}
          weightKg={weightKg}
          skinHex={skinHex}
          face={face}
          interactive
          className="h-[380px] cursor-grab active:cursor-grabbing lg:h-[440px]"
        />
        {draft && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-plum shadow-sm">Preview: not saved yet</span>}
        <span className="absolute bottom-2 right-3 text-[11px] text-ink/45">Drag to turn</span>
      </div>

      {missing.length > 0 && (
        <p className="mt-3 text-xs text-ink/60">
          Add your {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} in “About you” for a closer fit.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {draft ? (
          <>
            <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'saving' ? 'Saving…' : 'Save avatar'}</button>
            <button className="btn btn-ghost" onClick={() => setDraft(null)} disabled={!!busy}>Discard</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => { setError(''); setCamera(true); }} disabled={!!busy}>
              {face ? 'Retake selfie' : 'Take a selfie'}
            </button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={!!busy}>Upload a photo</button>
            {saved && (
              <button className="btn btn-ghost text-ink/60" onClick={remove} disabled={!!busy}>{busy === 'removing' ? 'Removing…' : 'Remove face'}</button>
            )}
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) fromSource(() => bitmapFromFile(f));
        }}
      />
      {busy === 'reading' && <p className="mt-3 text-sm text-ink/70" aria-live="polite">Finding your face… (the first time loads a small face model)</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-ink/50">
        Use one clear, front-facing photo in daylight, without filters or glasses. Your face is found on this device; we keep only
        its shape and a small face image, shown only to you. Remove it any time.
      </p>

      {camera && (
        <SelfieCamera
          onCancel={(msg) => { setCamera(false); if (msg) setError(msg); }}
          onShot={(frame) => { setCamera(false); fromSource(async () => frame); }}
        />
      )}
    </div>
  );
}

const COUNTDOWN = 3;

/** One front-facing selfie from the live camera. The frame stays in memory; the camera turns off on close. */
function SelfieCamera({ onShot, onCancel }: { onShot: (frame: HTMLCanvasElement) => void; onCancel: (reason?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    preloadFaceModel();
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        onCancel('The camera only works on a secure (https) page. Upload a photo instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
      } catch (e: any) {
        onCancel(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or upload a photo instead.'
            : 'Could not start the camera. Upload a photo instead.',
        );
      }
    })();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { stop(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.removeEventListener('keydown', onKey); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (count === null) return;
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(t);
    }
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setCount(null); return; }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    stop();
    onShot(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Take a selfie for your avatar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm opacity-80">Avatar selfie</span>
        <button type="button" className="rounded-full px-3 py-1 text-sm hover:bg-white/10" onClick={() => { stop(); onCancel(); }}>Cancel</button>
      </div>
      <div className="relative mx-auto w-full max-w-md flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[55%] w-[46%] rounded-[50%] border-4 border-white/90" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
        </div>
        {count !== null && count > 0 && <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold drop-shadow" aria-live="assertive">{count}</div>}
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm opacity-80">Starting camera…</div>}
      </div>
      <div className="mx-auto w-full max-w-md px-4 pb-6 pt-4 text-center">
        <div className="text-lg font-semibold">Look straight at the camera</div>
        <div className="text-sm opacity-75">Face inside the oval, head level, hair off your face. Daylight, no filters.</div>
        <button
          type="button"
          className="mt-4 h-16 w-16 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 disabled:opacity-40"
          disabled={!ready || count !== null}
          onClick={() => setCount(COUNTDOWN)}
          aria-label="Take the selfie"
        />
        <div className="mt-2 text-xs opacity-60">Tap, then hold still for {COUNTDOWN} seconds.</div>
      </div>
    </div>
  );
}
