'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Chips, Loading, PageTitle, Pager, SLOT_LABEL, SearchBox, Thumb, act, ago, num, pkr, qs, useBrand, useUrlState } from '@/components/admin/ui';

type Item = {
  id: string;
  title: string;
  slot: string;
  gender: string;
  price: number;
  inStock: boolean;
  images: string[];
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  updatedAt: string;
  picks: number;
  clicks: number;
  hiddenByAdmin: boolean;
};
type List = { counts: Record<string, number>; total: number; page: number; pages: number; items: Item[] };

const DEFAULTS = { filter: 'all', search: '', page: '0' };
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'rejected', label: 'Not approved' },
  { value: 'sold-out', label: 'Sold out' },
];

export default function BrandItems() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, setData, error, loading, reload } = useBrand<List>(ready ? `/brand/items${qs({ filter: s.filter, search: s.search, page: Number(s.page) })}` : null);

  const patchLocal = (id: string, patch: Partial<Item>) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  async function stock(i: Item) {
    if (await act(`/brand/items/${i.id}`, { method: 'PATCH', body: { inStock: !i.inStock } }, i.inStock ? 'Marked sold out' : 'Back in stock')) patchLocal(i.id, { inStock: !i.inStock });
  }
  async function remove(i: Item) {
    if (!confirm(`Delete “${i.title}”? Players will not see it any more. Looks already made with it keep it, shown as sold out.`)) return;
    if (await act('/brand/items/delete', { body: { ids: [i.id] } }, 'Piece deleted')) reload();
  }

  return (
    <>
      <PageTitle title="My pieces" intro="Everything you added. Price, sizes and stock change at once; other changes are checked by our team again before players see them.">
        <Link className="btn btn-primary" href="/brand/items/new">
          Add a piece
        </Link>
        <Link className="btn btn-ghost" href="/brand/upload">
          Upload a spreadsheet
        </Link>
      </PageTitle>
      <div className="space-y-3">
        <SearchBox value={s.search} onChange={(search) => set({ search, page: '0' })} placeholder="Search your pieces" />
        <Chips label="Show" value={s.filter} options={FILTERS.map((f) => ({ ...f, label: data ? `${f.label} (${num(data.counts[f.value])})` : f.label }))} onChange={(filter) => set({ filter, page: '0' })} />
      </div>
      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.items.length ? (
          <p className="card text-sm text-ink/70">
            No pieces here yet. <Link className="font-semibold text-plum" href="/brand/items/new">Add one</Link>
          </p>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((i) => (
                <ItemCard key={i.id} item={i} onStock={() => stock(i)} onDelete={() => remove(i)} onPrice={(price) => patchLocal(i.id, { price })} />
              ))}
            </ul>
            <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}

function ItemCard({ item: i, onStock, onDelete, onPrice }: { item: Item; onStock: () => void; onDelete: () => void; onPrice: (p: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(i.price));
  async function savePrice(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(price));
    if (await act(`/brand/items/${i.id}`, { method: 'PATCH', body: { price: n } }, 'Price saved')) {
      onPrice(n);
      setEditing(false);
    }
  }
  return (
    <li className="card flex gap-3 text-sm">
      <Thumb src={i.images[0]} alt="" className="h-32 w-24" />
      <div className="min-w-0 flex-1">
        <Link href={`/brand/items/${i.id}`} className="font-semibold text-plum">
          {i.title}
        </Link>
        <div className="text-ink/70">
          {SLOT_LABEL[i.slot] ?? i.slot} · {i.gender === 'male' ? 'Men' : 'Women'}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {i.status === 'pending' && <Badge tone="warn">Waiting for approval</Badge>}
          {i.status === 'rejected' && <Badge tone="bad">Not approved</Badge>}
          {i.status === 'approved' && i.inStock && !i.hiddenByAdmin && <Badge tone="good">Live</Badge>}
          {!i.inStock && <Badge>Sold out</Badge>}
          {i.hiddenByAdmin && <Badge tone="bad">Hidden by Saleeqa</Badge>}
        </div>
        {i.status === 'rejected' && i.note && <p className="mt-1 text-xs text-red-800">Why: {i.note}</p>}
        {editing ? (
          <form onSubmit={savePrice} className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor={`price-${i.id}`}>
              Price
            </label>
            <input id={`price-${i.id}`} className="input w-28 py-2" type="number" min={50} value={price} onChange={(e) => setPrice(e.target.value)} />
            <button className="btn btn-primary px-4">Save</button>
          </form>
        ) : (
          <p className="mt-1">
            {pkr(i.price)}{' '}
            <button className="min-h-[32px] px-1 font-semibold text-plum" onClick={() => setEditing(true)}>
              Change
            </button>
          </p>
        )}
        {i.status === 'approved' && (
          <p className="text-ink/70">
            {i.picks} pick{i.picks === 1 ? '' : 's'} · {i.clicks} shop click{i.clicks === 1 ? '' : 's'}
          </p>
        )}
        <p className="text-xs text-ink/65">Changed {ago(i.updatedAt)}</p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <button className="min-h-[32px] font-semibold text-plum" onClick={onStock}>
            {i.inStock ? 'Mark sold out' : 'Back in stock'}
          </button>
          <Link className="flex min-h-[32px] items-center font-semibold text-plum" href={`/brand/items/${i.id}`}>
            Edit
          </Link>
          <button className="min-h-[32px] font-semibold text-red-700" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
