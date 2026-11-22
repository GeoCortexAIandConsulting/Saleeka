'use client';
import { useRef, useState } from 'react';
import { toast } from '@/components/Toaster';
import { Thumb, useBrand } from '@/components/admin/ui';
import { PHOTO_TYPES, uploadPhoto } from '@/lib/brandPhotos';

export type Options = {
  categories: { female: Array<{ value: string; label: string }>; male: Array<{ value: string; label: string }> };
  colours: Array<{ name: string; hex: string }>;
  occasions: string[];
  columns: Array<{ key: string; required: boolean; help: string; example: string }>;
  maxRows: number;
};

export type ItemValues = {
  title: string;
  slot: string;
  gender: 'female' | 'male';
  price: number;
  colors: string[];
  fabric?: string;
  sizes: string[];
  inStock: boolean;
  url: string;
  images: string[];
  description?: string;
  occasions?: string[];
  season?: string;
  embellishment?: number;
  stitched?: boolean;
  includesDupatta?: boolean;
  includesBottom?: boolean;
  sleeve?: string;
  length?: string;
  neckline?: string;
};

const OCCASION: Record<string, string> = { office: 'Office', university: 'University', casual: 'Everyday', eid: 'Eid', mehndi: 'Mehndi', baraat: 'Baraat', walima: 'Walima', party: 'Party' };
const FABRICS = ['lawn', 'cotton', 'cambric', 'chiffon', 'silk', 'raw silk', 'organza', 'net', 'velvet', 'khaddar', 'linen', 'wool', 'karandi', 'jacquard', 'georgette', 'denim', 'leather'];

/** A yes / no / not set choice, for the optional outfit details. */
function Tri({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select className="input mt-1" value={value === undefined ? '' : value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'yes')}>
        <option value="">Let Saleeqa work it out</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

/** Adding or editing one piece. Photos: paste links or upload files; the first photo is the main one. */
export default function ItemForm({ initial, sells, submitLabel, onSubmit }: { initial?: ItemValues; sells: 'female' | 'male' | 'both'; submitLabel: string; onSubmit: (v: ItemValues) => Promise<void> }) {
  const { data: opts } = useBrand<Options>('/brand/options');
  const [v, setV] = useState<ItemValues>(
    initial ?? { title: '', slot: 'main', gender: sells === 'male' ? 'male' : 'female', price: 0, colors: [], sizes: [], inStock: true, url: '', images: [] },
  );
  const [sizes, setSizes] = useState((initial?.sizes ?? []).join(', '));
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(Boolean(initial?.occasions?.length || initial?.season || initial?.embellishment !== undefined || initial?.description));
  const files = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ItemValues>) => setV((x) => ({ ...x, ...patch }));

  if (!opts) return <p className="text-sm text-ink/70">Loading…</p>;
  const categories = opts.categories[v.gender];

  function addLink() {
    const url = link.trim();
    if (!/^https:\/\/\S+$/.test(url)) return toast('Paste a photo link that starts with https://', 'error');
    if (v.images.length >= 6) return toast('Up to 6 photos', 'error');
    set({ images: [...v.images, url] });
    setLink('');
  }
  async function addFiles(list: FileList | null) {
    const chosen = [...(list ?? [])].slice(0, 6 - v.images.length);
    if (!chosen.length) return;
    setUploading(chosen.length);
    for (const f of chosen) {
      try {
        const url = await uploadPhoto(f);
        setV((x) => ({ ...x, images: [...x.images, url].slice(0, 6) }));
      } catch (e) {
        toast((e as Error).message, 'error');
      }
      setUploading((n) => n - 1);
    }
    if (files.current) files.current.value = '';
  }
  function move(i: number, by: number) {
    const next = [...v.images];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    set({ images: next });
  }
  function toggleColour(name: string) {
    if (v.colors.includes(name)) set({ colors: v.colors.filter((c) => c !== name) });
    else if (v.colors.length >= 2) toast('Up to 2 colours: the main colour first', 'error');
    else set({ colors: [...v.colors, name] });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.images.length) return toast('Add at least one photo', 'error');
    setBusy(true);
    try {
      const clean: ItemValues = { ...v, sizes: sizes.split(/[,|]/).map((s) => s.trim()).filter(Boolean), fabric: v.fabric?.trim() || undefined, description: v.description?.trim() || undefined };
      if (!clean.occasions?.length) delete clean.occasions;
      await onSubmit(clean);
    } finally {
      setBusy(false);
    }
  }
  const outfit = v.slot === 'main';

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="card space-y-4">
        <h2 className="text-xl font-bold">The piece</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {sells === 'both' && (
            <label className="block text-sm font-medium">
              For
              <select className="input mt-1" value={v.gender} onChange={(e) => set({ gender: e.target.value as ItemValues['gender'], slot: 'main' })}>
                <option value="female">Women</option>
                <option value="male">Men</option>
              </select>
            </label>
          )}
          <label className="block text-sm font-medium">
            Category
            <select className="input mt-1" value={v.slot} onChange={(e) => set({ slot: e.target.value })}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Name
            <input className="input mt-1" required minLength={3} maxLength={120} placeholder="e.g. Embroidered lawn 3-piece suit" value={v.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Price (Rs)
            <input className="input mt-1" required type="number" min={50} step={1} inputMode="numeric" value={v.price || ''} onChange={(e) => set({ price: Math.round(Number(e.target.value)) })} />
          </label>
          <label className="block text-sm font-medium">
            Fabric (optional)
            <input className="input mt-1" list="fabrics" maxLength={40} value={v.fabric ?? ''} onChange={(e) => set({ fabric: e.target.value })} />
            <datalist id="fabrics">
              {FABRICS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Link where players buy it
            <input className="input mt-1" required type="url" placeholder="https://your-shop.pk/products/… (or your Instagram / WhatsApp link)" value={v.url} onChange={(e) => set({ url: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Sizes in stock (optional)
            <input className="input mt-1" placeholder="S, M, L" value={sizes} onChange={(e) => setSizes(e.target.value)} />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={v.inStock} onChange={(e) => set({ inStock: e.target.checked })} /> In stock
          </label>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-xl font-bold">Photos</h2>
        <p className="text-sm text-ink/70">Up to 6. The first one is shown in the Studio, so use a clear photo of the whole piece. Use the arrows to change the order.</p>
        {v.images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {v.images.map((src, i) => (
              <li key={src} className="w-24 text-center text-xs">
                <Thumb src={src} alt={`Photo ${i + 1}`} className="h-32 w-24" />
                <div className="mt-1 flex justify-center gap-1">
                  <button type="button" className="min-h-[32px] min-w-[32px] rounded-full hover:bg-sand disabled:opacity-40" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                    ←
                  </button>
                  <button type="button" className="min-h-[32px] min-w-[32px] rounded-full text-red-700 hover:bg-red-50" onClick={() => set({ images: v.images.filter((x) => x !== src) })} aria-label={`Remove photo ${i + 1}`}>
                    ✕
                  </button>
                  <button type="button" className="min-h-[32px] min-w-[32px] rounded-full hover:bg-sand disabled:opacity-40" disabled={i === v.images.length - 1} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`}>
                    →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {v.images.length < 6 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm font-medium">
              Paste a photo link
              <input className="input mt-1" type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
            </label>
            <button type="button" className="btn btn-ghost" onClick={addLink}>
              Add link
            </button>
            <span className="text-center text-sm text-ink/70 sm:pb-3">or</span>
            <button type="button" className="btn btn-ghost" onClick={() => files.current?.click()} disabled={uploading > 0}>
              {uploading ? `Uploading ${uploading}…` : 'Upload photos'}
            </button>
            <input ref={files} type="file" accept={PHOTO_TYPES} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-xl font-bold">Colour</h2>
        <p className="text-sm text-ink/70">Pick 1 or 2 (main colour first). Leave empty and we will read it from the name, if the name says it.</p>
        <div className="flex flex-wrap gap-2">
          {opts.colours.map((c) => (
            <button key={c.name} type="button" aria-pressed={v.colors.includes(c.name)} className={`chip gap-2 ${v.colors.includes(c.name) ? 'chip-on' : ''}`} onClick={() => toggleColour(c.name)}>
              <span className="h-4 w-4 rounded-full border border-line" style={{ background: c.hex }} aria-hidden />
              {c.name}
              {v.colors[0] === c.name && v.colors.length > 1 && <span className="text-xs">(main)</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <button type="button" className="flex w-full items-center justify-between text-left" aria-expanded={more} onClick={() => setMore(!more)}>
          <span className="text-xl font-bold">More details (optional)</span>
          <span aria-hidden>{more ? '−' : '+'}</span>
        </button>
        <p className="text-sm text-ink/70">Saleeqa works these out from the name and category. Set them if you want to be exact: they decide which challenges your piece fits.</p>
        {more && (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-sm font-medium">Occasions</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {opts.occasions.map((o) => {
                  const on = v.occasions?.includes(o) ?? false;
                  return (
                    <button key={o} type="button" aria-pressed={on} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => set({ occasions: on ? v.occasions!.filter((x) => x !== o) : [...(v.occasions ?? []), o] })}>
                      {OCCASION[o] ?? o}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm font-medium">
                Season
                <select className="input mt-1" value={v.season ?? ''} onChange={(e) => set({ season: e.target.value || undefined })}>
                  <option value="">Let Saleeqa work it out</option>
                  <option value="all">All year</option>
                  <option value="summer">Summer</option>
                  <option value="winter">Winter</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Embroidery / embellishment
                <select className="input mt-1" value={v.embellishment ?? ''} onChange={(e) => set({ embellishment: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">Let Saleeqa work it out</option>
                  <option value="0">Plain</option>
                  <option value="1">Light</option>
                  <option value="2">Medium</option>
                  <option value="3">Heavy</option>
                </select>
              </label>
              {outfit && (
                <>
                  <Tri label="Stitched?" value={v.stitched} onChange={(stitched) => set({ stitched })} />
                  <Tri label="Comes with a dupatta?" value={v.includesDupatta} onChange={(includesDupatta) => set({ includesDupatta })} />
                  <Tri label="Comes with a trouser / shalwar?" value={v.includesBottom} onChange={(includesBottom) => set({ includesBottom })} />
                </>
              )}
              {(outfit || v.slot === 'bottom') && (
                <label className="block text-sm font-medium">
                  Length
                  <select className="input mt-1" value={v.length ?? ''} onChange={(e) => set({ length: e.target.value || undefined })}>
                    <option value="">Let Saleeqa work it out</option>
                    <option value="short">Short (above the knee)</option>
                    <option value="knee">Knee length</option>
                    <option value="midi">Midi (below the knee)</option>
                    <option value="full">Full length</option>
                  </select>
                </label>
              )}
              {outfit && (
                <>
                  <label className="block text-sm font-medium">
                    Sleeves
                    <select className="input mt-1" value={v.sleeve ?? ''} onChange={(e) => set({ sleeve: e.target.value || undefined })}>
                      <option value="">Let Saleeqa work it out</option>
                      <option value="sleeveless">Sleeveless</option>
                      <option value="short">Short</option>
                      <option value="three-quarter">Three-quarter</option>
                      <option value="full">Full</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Neckline
                    <select className="input mt-1" value={v.neckline ?? ''} onChange={(e) => set({ neckline: e.target.value || undefined })}>
                      <option value="">Let Saleeqa work it out</option>
                      <option value="open">Open (V, boat, off-shoulder)</option>
                      <option value="regular">Regular</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <label className="block text-sm font-medium">
              Description
              <textarea className="input mt-1 min-h-[96px]" maxLength={2000} value={v.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      <button className="btn btn-primary w-full sm:w-auto" disabled={busy || uploading > 0}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
