'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';

const SIZE = 320; // stored photo is a square this many pixels wide

/** Centre-crops to a square and shrinks to SIZE px JPEG in the browser, so uploads stay small (~30 KB). */
async function toSquareJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => {
    throw new Error('Could not read that image. Try a JPG, PNG or WebP photo.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Round avatar with upload / change / remove. */
export default function ProfilePhoto({
  name,
  photoVersion,
  onChange,
}: {
  name: string;
  photoVersion: string | null;
  onChange: (version: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await toSquareJpeg(file);
      const out = await api<{ photoVersion: string }>('/me/photo', { method: 'PUT', body: { dataUrl } });
      onChange(out.photoVersion);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api('/me/photo', { method: 'DELETE' });
      onChange(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-plum-soft shadow-md lg:h-36 lg:w-36"
        aria-label={photoVersion ? 'Change profile photo' : 'Add a profile photo'}
        disabled={busy}
      >
        {photoVersion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/me/photo?v=${encodeURIComponent(photoVersion)}`} alt="Your profile photo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-4xl font-bold text-plum">{initials}</span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? 'Saving…' : photoVersion ? 'Change' : 'Add photo'}
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <div className="mt-2 flex gap-3 text-sm">
        <button type="button" className="font-semibold text-plum hover:underline" onClick={() => input.current?.click()} disabled={busy}>
          {photoVersion ? 'Change photo' : 'Add photo'}
        </button>
        {photoVersion && (
          <button type="button" className="text-ink/60 hover:underline" onClick={remove} disabled={busy}>Remove</button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
