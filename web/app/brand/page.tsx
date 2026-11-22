'use client';
import Link from 'next/link';
import BrandReportView, { type BrandReport } from '@/components/BrandReportView';
import { Loading, PageTitle, Stat, num, useBrand } from '@/components/admin/ui';

type Overview = { report: BrandReport; counts: { all: number; pending: number; approved: number; rejected: number; live: number; 'sold-out': number } };

export default function BrandDashboard() {
  const { data, error, loading } = useBrand<Overview>('/brand/overview');
  if (!data) return <Loading error={error} loading={loading} />;
  const c = data.counts;
  return (
    <>
      <PageTitle title={`Welcome, ${data.report.brand.name}`} intro="How shoppers style your pieces on Saleeqa. Numbers are about your brand only and update as players make looks.">
        <Link className="btn btn-primary" href="/brand/items/new">
          Add a piece
        </Link>
        <Link className="btn btn-ghost" href="/brand/upload">
          Upload a spreadsheet
        </Link>
      </PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Live in the Studio" value={num(c.live)} note="Approved and in stock" href="/brand/items?filter=live" />
        <Stat label="Waiting for approval" value={num(c.pending)} note="Our team checks every new piece" href="/brand/items?filter=pending" />
        <Stat label="Not approved" value={num(c.rejected)} note={c.rejected ? 'See why and fix them' : 'None'} href="/brand/items?filter=rejected" />
        <Stat label="All your pieces" value={num(c.all)} note={`${num(c['sold-out'])} marked sold out`} href="/brand/items" />
      </div>

      {c.all === 0 && (
        <div className="card mb-8 border-gold bg-ivory">
          <h2 className="text-2xl font-bold">Add your first pieces</h2>
          <p className="mt-1 text-sm text-ink/75">
            Add pieces one at a time, or many at once from a spreadsheet. Once our team approves them, players can pick them when they style looks, and every “Shop” click goes to your link.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/brand/items/new">
              Add a piece
            </Link>
            <Link className="btn btn-ghost" href="/brand/upload">
              Upload a spreadsheet
            </Link>
          </div>
        </div>
      )}

      <BrandReportView r={data.report} own />
    </>
  );
}
