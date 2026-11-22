'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import BrandReportView, { type BrandReport } from '@/components/BrandReportView';
import { Badge, Chips, Loading, PageTitle, Pager, SLOT_LABEL, SearchBox, Thumb, act, num, pkr, qs, useAdmin } from '@/components/admin/ui';

type Products = {
  total: number;
  page: number;
  pages: number;
  products: Array<{ id: string; title: string; slot: string; gender: string; price: number; image: string | null; url: string; isNew: boolean; hidden: boolean; picks: number; clicks: number }>;
};

export default function AdminBrand() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, loading, reload } = useAdmin<BrandReport>(`/admin/brands/${id}`);
  const [tab, setTab] = useState<'report' | 'products'>('report');

  if (!r) return <Loading error={error} loading={loading} />;

  async function toggleBrand() {
    const hide = !r!.brand.hidden;
    if (hide && !confirm(`Hide ${r!.brand.name} from the Studio?`)) return;
    if (await act(`/admin/brands/${id}`, { body: { hidden: hide } }, hide ? 'Brand hidden' : 'Brand shown')) reload();
  }

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link className="text-plum" href="/admin/brands">
          ← All brands
        </Link>
      </p>
      <PageTitle title={r.brand.name}>
        <span className="print:hidden">
          {r.brand.hidden ? <Badge tone="bad">Hidden from the Studio</Badge> : <Badge tone="good">Shown in the Studio</Badge>}
        </span>
        <button className="btn btn-ghost print:hidden" onClick={toggleBrand}>
          {r.brand.hidden ? 'Show brand' : 'Hide brand'}
        </button>
        <button className="btn btn-ghost print:hidden" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </PageTitle>

      <div className="mb-6 print:hidden">
        <Chips
          label="View"
          value={tab}
          options={[
            { value: 'report', label: 'Brand report' },
            { value: 'products', label: `Products (${num(r.catalog.inStock)} in stock)` },
          ]}
          onChange={setTab}
        />
      </div>

      {tab === 'products' ? (
        <ProductList brandId={id} onChange={reload} />
      ) : (
        <BrandReportView r={r} />
      )}
    </>
  );
}

function ProductList({ brandId, onChange }: { brandId: string; onChange: () => void }) {
  const [q, setQ] = useState({ search: '', sort: 'picks', hidden: '', page: 0 });
  const { data, setData, error, loading } = useAdmin<Products>(`/admin/brands/${brandId}/products${qs(q)}`);

  async function toggle(p: Products['products'][number]) {
    if (await act('/admin/products', { body: { ids: [p.id], hidden: !p.hidden } }, p.hidden ? 'Piece is back in the Studio' : 'Piece hidden from the Studio')) {
      setData((d) => d && { ...d, products: d.products.map((x) => (x.id === p.id ? { ...x, hidden: !p.hidden } : x)) });
      onChange();
    }
  }

  return (
    <>
      <div className="space-y-3">
        <SearchBox value={q.search} onChange={(search) => setQ({ ...q, search, page: 0 })} placeholder="Search this brand's pieces" />
        <Chips
          label="Sort"
          value={q.sort}
          options={[
            { value: 'picks', label: 'Most picked' },
            { value: 'clicks', label: 'Most clicked' },
            { value: 'new', label: 'Newest' },
            { value: 'price-asc', label: 'Price ↑' },
            { value: 'price-desc', label: 'Price ↓' },
          ]}
          onChange={(sort) => setQ({ ...q, sort, page: 0 })}
        />
        <Chips
          label="Show"
          value={q.hidden}
          options={[
            { value: '', label: 'All in stock' },
            { value: '1', label: 'Hidden by me' },
          ]}
          onChange={(hidden) => setQ({ ...q, hidden, page: 0 })}
        />
      </div>
      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.products.length ? (
          <p className="card text-sm text-ink/70">No pieces here.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink/70">{num(data.total)} pieces</p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.products.map((p) => (
                <li key={p.id} className={`card flex gap-3 text-sm ${p.hidden ? 'bg-sand/60' : ''}`}>
                  <Thumb src={p.image} alt="" />
                  <div className="min-w-0 flex-1">
                    <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold text-plum">
                      {p.title}
                    </a>
                    <div className="text-ink/70">
                      {SLOT_LABEL[p.slot] ?? p.slot} · {p.gender === 'male' ? 'Men' : 'Women'} · {pkr(p.price)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.isNew && <Badge tone="gold">New in</Badge>}
                      {p.hidden && <Badge tone="bad">Hidden</Badge>}
                    </div>
                    <div className="text-ink/70">
                      {p.picks} picks · {p.clicks} clicks
                    </div>
                    <button className="min-h-[32px] font-semibold text-plum" onClick={() => toggle(p)}>
                      {p.hidden ? 'Show in the Studio' : 'Hide from the Studio'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pages={data.pages} onPage={(page) => setQ({ ...q, page })} />
          </>
        )}
      </div>
    </>
  );
}
