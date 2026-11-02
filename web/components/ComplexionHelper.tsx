'use client';
import { useEffect, useRef, useState } from 'react';
import { analyzeRegions, analyzeSelfie, type ComplexionResult, type Depth, type Undertone } from '@/lib/complexion';
import CameraCapture from './CameraCapture';

const UNDERTONES: { value: Undertone; label: string; tip: string }[] = [
  { value: 'warm', label: 'Warm', tip: 'Gold jewellery suits you best' },
  { value: 'cool', label: 'Cool', tip: 'Silver jewellery suits you best' },
  { value: 'neutral', label: 'Neutral', tip: 'Both gold and silver suit you' },
];
// Neutral reference swatches, light to deep; labels only, no ranking.
const DEPTHS: { value: Depth; label: string; swatch: string }[] = [
  { value: 'light', label: 'Light', swatch: '#EDCDB4' },
  { value: 'medium', label: 'Medium', swatch: '#C08D68' },
  { value: 'deep', label: 'Deep', swatch: '#6E4A33' },
];

/**
 * Selfie-based colour suggestions. The photo is read in the browser only: it is never uploaded or
 * saved. Only the undertone and depth (which the person can correct) go into the profile.
 */
export default function ComplexionHelper({
  palettes,
  hexOf,
  initial,
  onApply,
}: {
  palettes: Record<string, string[]>;
  hexOf: (color: string) => string | undefined;
  initial?: { undertone?: Undertone; depth?: Depth };
  onApply: (r: { undertone: Undertone; depth: Depth; colors: string[] }) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [skinHex, setSkinHex] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [undertone, setUndertone] = useState<Undertone | undefined>(initial?.undertone);
  const [depth, setDepth] = useState<Depth | undefined>(initial?.depth);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);

  const applyResult = (r: ComplexionResult) => {
    setUndertone(r.undertone);
    setDepth(r.depth);
    setSkinHex(r.hex);
    setLowConfidence(r.coverage < 0.2);
  };

  function onCaptured(regions: Uint8ClampedArray[], thumbs: string[]) {
    setCameraOpen(false);
    setShots(thumbs);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setError('');
    try {
      applyResult(analyzeRegions(regions));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    setShots([]);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    try {
      applyResult(await analyzeSelfie(file));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }

  const suggestion = undertone && depth ? palettes[`${undertone}-${depth}`] ?? [] : [];

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-ink/70">
        We’ll take three quick selfies (front, left and right) in daylight, without filters.{' '}
        <strong>Your photos stay on this device</strong>: we only save the result below, and you can change it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => { setError(''); setCameraOpen(true); }} disabled={busy}>
          {busy ? 'Looking…' : 'Take a selfie'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => uploadRef.current?.click()} disabled={busy}>
          Upload a photo
        </button>
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {shots.length > 0 && (
          <div className="flex gap-1">
            {shots.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={['Front', 'Left', 'Right'][i] + ' selfie (not uploaded)'} className="h-12 w-9 rounded-md border border-line object-cover" />
            ))}
          </div>
        )}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your selfie (not uploaded)" className="h-12 w-12 rounded-full border border-line object-cover" />
        )}
        {skinHex && <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: skinHex }} title="Skin tone we read" />}
      </div>

      {cameraOpen && (
        <CameraCapture
          onDone={onCaptured}
          onCancel={(reason) => { setCameraOpen(false); if (reason) setError(reason); }}
        />
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {lowConfidence && !error && (
        <p className="mt-3 text-xs text-ink/60">The photo was a bit hard to read, so please check the result below.</p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/60">Undertone {skinHex && '(our guess)'}</div>
          <div className="flex flex-wrap gap-2">
            {UNDERTONES.map((u) => (
              <button key={u.value} type="button" onClick={() => setUndertone(u.value)} aria-pressed={undertone === u.value} className={`chip ${undertone === u.value ? 'chip-on' : ''}`} title={u.tip}>
                {u.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink/50">Not sure? {UNDERTONES.map((u) => `${u.tip.toLowerCase()} → ${u.label.toLowerCase()}`).join(' · ')}.</p>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/60">Depth {skinHex && '(our guess)'}</div>
          <div className="flex flex-wrap gap-2">
            {DEPTHS.map((d) => (
              <button key={d.value} type="button" onClick={() => setDepth(d.value)} aria-pressed={depth === d.value} className={`chip ${depth === d.value ? 'chip-on' : ''}`}>
                <span className="mr-2 inline-block h-4 w-4 rounded-full border border-black/10" style={{ background: d.swatch }} />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {suggestion.length > 0 && (
        <div className="mt-4 rounded-xl bg-plum-soft p-3">
          <div className="text-sm font-semibold">Colours that tend to glow on you</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestion.map((c) => (
              <span key={c} className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm capitalize">
                <span className="mr-2 inline-block h-4 w-4 rounded-full border border-black/10" style={{ background: hexOf(c) }} />
                {c}
              </span>
            ))}
          </div>
          <button type="button" className="btn btn-primary mt-3" onClick={() => onApply({ undertone: undertone!, depth: depth!, colors: suggestion })}>
            Use these colours
          </button>
          <p className="mt-2 text-xs text-ink/50">You can still add or remove colours below.</p>
        </div>
      )}
    </div>
  );
}
