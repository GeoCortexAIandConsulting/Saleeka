'use client';
import { useEffect, useRef, useState } from 'react';
import { faceRegion } from '@/lib/complexion';

const STEPS = [
  { key: 'front', title: 'Look straight at the camera', hint: 'Keep your face inside the oval.' },
  { key: 'left', title: 'Turn your head to the left', hint: 'Show your left cheek, face still in the oval.' },
  { key: 'right', title: 'Now turn to the right', hint: 'Show your right cheek, face still in the oval.' },
] as const;

const COUNTDOWN = 3;

/**
 * Live front-camera capture of three angles (front, left, right). Frames are read straight from the
 * video into memory for analysis: nothing is uploaded or saved, and the camera turns off on close.
 */
export default function CameraCapture({
  onDone,
  onCancel,
}: {
  onDone: (regions: Uint8ClampedArray[], thumbs: string[]) => void;
  onCancel: (reason?: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const regionsRef = useRef<Uint8ClampedArray[]>([]);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        onCancel('The camera only works on a secure (https) page. Upload a photo instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
      } catch (e: any) {
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or upload a photo instead.'
            : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError'
              ? 'No front camera found. Upload a photo instead.'
              : 'Could not start the camera. Upload a photo instead.';
        onCancel(msg);
      }
    })();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { stop(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.removeEventListener('keydown', onKey); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown, then grab the frame.
  useEffect(() => {
    if (count === null) return;
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(t);
    }
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setCount(null); return; }
    regionsRef.current.push(faceRegion(v, v.videoWidth, v.videoHeight));
    // Small mirrored thumbnail so the person sees what was taken (kept in memory only).
    const c = document.createElement('canvas');
    c.width = 72; c.height = 96;
    const ctx = c.getContext('2d')!;
    const sw = v.videoHeight * 0.75, sx = (v.videoWidth - sw) / 2;
    ctx.translate(72, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, sx, 0, sw, v.videoHeight, 0, 0, 72, 96);
    const nextThumbs = [...thumbs, c.toDataURL('image/jpeg', 0.7)];
    setThumbs(nextThumbs);
    setCount(null);
    if (step + 1 < STEPS.length) setStep(step + 1);
    else { stop(); onDone(regionsRef.current, nextThumbs); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const s = STEPS[step];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Take selfies">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm opacity-80">Photo {step + 1} of {STEPS.length}</span>
        <button type="button" className="rounded-full px-3 py-1 text-sm hover:bg-white/10" onClick={() => { stop(); onCancel(); }}>
          Cancel
        </button>
      </div>

      <div className="relative mx-auto w-full max-w-md flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        {/* Oval face guide over a dimmed surround */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[55%] w-[46%] rounded-[50%] border-4 border-white/90" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
        </div>
        {count !== null && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold drop-shadow" aria-live="assertive">{count}</div>
        )}
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm opacity-80">Starting camera…</div>}
      </div>

      <div className="mx-auto w-full max-w-md px-4 pb-6 pt-4 text-center">
        <div className="text-lg font-semibold" aria-live="polite">{s.title}</div>
        <div className="text-sm opacity-75">{s.hint} Daylight, no filters.</div>
        <div className="mt-3 flex justify-center gap-2">
          {STEPS.map((st, i) => (
            <div key={st.key} className={`h-12 w-9 overflow-hidden rounded-md border ${i === step ? 'border-white' : 'border-white/30'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumbs[i] && <img src={thumbs[i]} alt={`${st.key} photo`} className="h-full w-full object-cover" />}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 h-16 w-16 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 disabled:opacity-40"
          disabled={!ready || count !== null}
          onClick={() => setCount(COUNTDOWN)}
          aria-label={`Capture: ${s.title}`}
        />
        <div className="mt-2 text-xs opacity-60">Tap, then hold still for {COUNTDOWN} seconds. Photos stay on this device.</div>
      </div>
    </div>
  );
}
