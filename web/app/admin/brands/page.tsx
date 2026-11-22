'use client';
import Link from 'next/link';
import { Badge, Loading, PageTitle, act, ago, num, useAdmin } from '@/components/admin/ui';

type Brand = {
  id: string;
  name: string;
  tier: string;
  hidden: boolean;
  products: number;
  inStock: number;
  newIn: number;
  hiddenProducts: number;
  women: number;
  men: number;
  lastChecked: string | null;
  looks: number;
  picks: number;
  players: number;
  likes: number;
  clicks: number;
  clicks30: number;
  share: number;
};

const TIER: Record<string, string> = { budget: 'Budget', mid: 'Mid-range', premium: 'Premium' };

export default function AdminBrands() {
  const { data, setData, error, loading } = useAdmin<{ looks: number; brands: Brand[] }>('/admin/brands');

  async function toggle(b: Brand) {
    const hide = !b.hidden;
    if (hide && !confirm(`Hide ${b.name}? Players will not see any ${b.name} pieces in the Studio. Looks already made keep them.`)) return;
    if (await act(`/admin/brands/${b.id}`, { body: { hidden: hide } }, hide ? `${b.name} is hidden from the Studio` : `${b.name} is back in the Studio`)) {
      setData((d) => d && { ...d, brands: d.brands.map((x) => (x.id === b.id ? { ...x, hidden: hide } : x)) });
    }
  }

  if (!data) return <Loading error={error} loading={loading} />;
  return (
    <>
      <PageTitle
        title="Brands"
        intro={`How players use each brand, across ${num(data.looks)} looks on the Runway. Open a brand for its full report (to show the brand) and its products. “Picks” = pieces chosen in published looks.`}
      />
      <ul className="space-y-2">
        {data.brands.map((b) => (
          <li key={b.id} className={`card flex flex-col gap-3 md:flex-row md:items-center ${b.hidden ? 'opacity-80' : ''}`}>
            <div className="min-w-0 md:w-56">
              <Link href={`/admin/brands/${b.id}`} className="text-lg font-semibold text-plum">
                {b.name}
              </Link>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge>{TIER[b.tier] ?? b.tier}</Badge>
                {b.hidden ? <Badge tone="bad">Hidden</Badge> : <Badge tone="good">Shown</Badge>}
              </div>
            </div>
            <dl className="grid flex-1 grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
              <Fact label="In stock" value={num(b.inStock)} note={`${num(b.newIn)} new`} />
              <Fact label="Picks" value={num(b.picks)} note={`${b.share}% of looks`} />
              <Fact label="Looks" value={num(b.looks)} />
              <Fact label="Players" value={num(b.players)} />
              <Fact label="Shop clicks" value={num(b.clicks)} note={`${num(b.clicks30)} in 30 days`} />
              <Fact label="Checked" value={ago(b.lastChecked)} />
            </dl>
            <div className="flex gap-2 md:flex-col">
              <Link href={`/admin/brands/${b.id}`} className="btn btn-ghost flex-1 px-4">
                Report
              </Link>
              <button className={`btn flex-1 px-4 ${b.hidden ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(b)} aria-pressed={!b.hidden}>
                {b.hidden ? 'Show' : 'Hide'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink/65">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
      {note && <dd className="truncate text-xs text-ink/70">{note}</dd>}
    </div>
  );
}
