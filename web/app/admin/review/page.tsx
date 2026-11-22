'use client';
import { useState } from 'react';
import { Badge, Chips, Loading, PageTitle, Pager, SLOT_LABEL, Thumb, act, ago, num, pkr, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type Item = {
  id: string;
  accountId: string;
  brandName: string;
  title: string;
  slot: string;
  gender: string;
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
  createdAt: string;
  updatedAt: string;
  /** A change to a piece players could already see */
  edit: boolean;
};
type Queue = { total: number; page: number; pages: number; brands: Array<{ accountId: string; brandName: string; n: number }>; items: Item[] };

const DEFAULTS = { brand: '', page: '0' };

/** Pieces brands uploaded, waiting for the admin. Approved pieces reach the Studio within a minute. */
export default function AdminReview() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, error, loading, reload } = useAdmin<Queue>(ready ? `/admin/review${qs({ accountId: s.brand, page: Number(s.page) })}` : null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);

  async function decide(ids: string[], approve: boolean) {
    if (!ids.length) return;
    let note = '';
    if (!approve) {
      const r = prompt(`Turn down ${ids.length} piece${ids.length === 1 ? '' : 's'}? Write what the brand should fix (they see it):`);
      if (r === null) return;
      note = r;
    }
    const done = approve ? `${ids.length} approved: in the Studio within a minute` : `${ids.length} turned down`;
    if (await act('/admin/review', { body: { ids, approve, note } }, done)) {
      setPicked(new Set());
      setOpen(null);
      reload();
    }
  }
  const toggle = (id: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageTitle title="Item review" intro="Check each piece: real photo, right category and colour, a working shop link, a fair price. Approve to show it to players; turn down with a note so the brand can fix it." />
      {data && data.brands.length > 1 && (
        <div className="mb-4">
          <Chips
            label="Brand"
            value={s.brand}
            options={[{ value: '', label: `All brands (${num(data.brands.reduce((n, b) => n + b.n, 0))})` }, ...data.brands.map((b) => ({ value: b.accountId, label: `${b.brandName} (${num(b.n)})` }))]}
            onChange={(brand) => set({ brand, page: '0' })}
          />
        </div>
      )}
      {!data ? (
        <Loading error={error} loading={loading} />
      ) : !data.items.length ? (
        <p className="card text-sm text-ink/70">Nothing waiting. Well done!</p>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-line bg-ivory/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <span className="text-sm">
              {num(data.total)} waiting{picked.size ? ` · ${picked.size} selected` : ''}
            </span>
            <button className="btn btn-ghost px-4" onClick={() => setPicked(picked.size === data.items.length ? new Set() : new Set(data.items.map((i) => i.id)))}>
              {picked.size === data.items.length ? 'Clear selection' : 'Select all on this page'}
            </button>
            <button className="btn btn-primary px-4" disabled={!picked.size} onClick={() => decide([...picked], true)}>
              Approve selected
            </button>
            <button className="btn btn-ghost px-4" disabled={!picked.size} onClick={() => decide([...picked], false)}>
              Turn down selected
            </button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((i) => (
              <li key={i.id} className={`card flex gap-3 text-sm ${picked.has(i.id) ? 'border-plum ring-2 ring-plum/30' : ''}`}>
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => setOpen(i)} aria-label={`Look closer at ${i.title}`}>
                    <Thumb src={i.images[0]} alt="" className="h-36 w-28" />
                  </button>
                  <label className="flex min-h-[32px] items-center gap-1 text-xs">
                    <input type="checkbox" className="h-5 w-5" checked={picked.has(i.id)} onChange={() => toggle(i.id)} /> Select
                  </label>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gold-deep">{i.brandName}</div>
                  <button className="text-left font-semibold text-plum" onClick={() => setOpen(i)}>
                    {i.title}
                  </button>
                  <div className="text-ink/70">
                    {SLOT_LABEL[i.slot] ?? i.slot} · {i.gender === 'male' ? 'Men' : 'Women'} · {pkr(i.price)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.edit && <Badge tone="warn">Change to a live piece</Badge>}
                    {i.colors.map((c) => (
                      <Badge key={c}>{c}</Badge>
                    ))}
                    {!i.inStock && <Badge>Sold out</Badge>}
                  </div>
                  <p className="text-xs text-ink/65">
                    {i.images.length} photo{i.images.length === 1 ? '' : 's'} · sent {ago(i.updatedAt)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4">
                    <button className="min-h-[32px] font-semibold text-emerald-800" onClick={() => decide([i.id], true)}>
                      Approve
                    </button>
                    <button className="min-h-[32px] font-semibold text-red-700" onClick={() => decide([i.id], false)}>
                      Turn down
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: String(p) })} />
        </>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.title} className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 p-0 sm:items-center sm:p-6" onClick={() => setOpen(null)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-ivory p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gold-deep">{open.brandName}</div>
                <h2 className="text-2xl font-bold">{open.title}</h2>
              </div>
              <button className="min-h-[40px] min-w-[40px] rounded-full text-xl hover:bg-sand" onClick={() => setOpen(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {open.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                  <Thumb src={src} alt="" className="h-64 w-48" />
                </a>
              ))}
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink/65">Category</dt>
                <dd>
                  {SLOT_LABEL[open.slot] ?? open.slot} · {open.gender === 'male' ? 'Men' : 'Women'}
                </dd>
              </div>
              <div>
                <dt className="text-ink/65">Price</dt>
                <dd>{pkr(open.price)}</dd>
              </div>
              <div>
                <dt className="text-ink/65">Colours · fabric</dt>
                <dd>
                  {open.colors.join(', ')} · {open.fabric ?? 'not given'}
                </dd>
              </div>
              <div>
                <dt className="text-ink/65">Sizes</dt>
                <dd>{open.sizes.join(', ') || 'not given'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink/65">Shop link</dt>
                <dd>
                  <a className="break-all text-plum" href={open.url} target="_blank" rel="noreferrer">
                    {open.url}
                  </a>
                </dd>
              </div>
              {open.description && (
                <div className="sm:col-span-2">
                  <dt className="text-ink/65">Description</dt>
                  <dd className="whitespace-pre-line">{open.description}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => decide([open.id], true)}>
                Approve
              </button>
              <button className="btn btn-ghost" onClick={() => decide([open.id], false)}>
                Turn down
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
