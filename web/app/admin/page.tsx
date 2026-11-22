'use client';
import Link from 'next/link';
import { DailyBars, Loading, PageTitle, Section, Stat, ago, num, usd, useAdmin } from '@/components/admin/ui';

type Overview = {
  players: { total: number; verified: number; unverified: number; suspended: number; new1: number; new7: number; new30: number; active1: number; active7: number; active30: number; inactive30: number; withLooks: number };
  looks: { published: number; drafts: number; hidden: number; published7: number; likes: number; dislikes: number; comments: number };
  referrals: { joined: number; published: number; conversion: number; inviters: number };
  previews: { total: number; today: number; last30: number; costTotal: number; cost30: number; costEach: number };
  shop: { clicks: number; clicks7: number };
  catalog: { brands: number; hiddenBrands: number; hiddenProducts: number; inStock: number; newIn: number; syncedAt: string | null; totalProducts: number | null };
  daily: { days: string[]; signups: number[]; looks: number[]; likes: number[]; previews: number[]; clicks: number[]; active: number[] };
};

export default function AdminOverview() {
  const { data: o, error, loading } = useAdmin<Overview>('/admin/overview');
  if (!o) return <Loading error={error} loading={loading} />;
  const p = o.players;
  return (
    <>
      <PageTitle title="Overview" intro="Everything at a glance. “Active” means the player opened Saleeqa signed in, made a look, liked, commented, previewed or clicked to a shop." />

      <Section title="Players">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="All players" value={num(p.total)} note={`${num(p.verified)} confirmed their email`} href="/admin/users" />
          <Stat label="New this week" value={num(p.new7)} note={`${num(p.new1)} today · ${num(p.new30)} in 30 days`} />
          <Stat label="Active this week" value={num(p.active7)} note={`${num(p.active1)} today · ${num(p.active30)} in 30 days`} href="/admin/users?filter=active" />
          <Stat label="Inactive (30 days)" value={num(p.inactive30)} note="Confirmed, but nothing in 30 days" href="/admin/users?filter=inactive" />
          <Stat label="Have published a look" value={num(p.withLooks)} note={`${p.verified ? Math.round((p.withLooks / p.verified) * 100) : 0}% of confirmed players`} />
          <Stat label="Email not confirmed" value={num(p.unverified)} href="/admin/users?filter=unverified" />
          <Stat label="Suspended" value={num(p.suspended)} href="/admin/users?filter=suspended" />
          <Stat label="Joined from an invite" value={num(o.referrals.joined)} note={`${o.referrals.conversion}% went on to publish`} href="/admin/invites" />
        </div>
      </Section>

      <Section title="Last 30 days">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DailyBars title="New players" days={o.daily.days} values={o.daily.signups} />
          <DailyBars title="Active players" days={o.daily.days} values={o.daily.active} />
          <DailyBars title="Looks published" days={o.daily.days} values={o.daily.looks} />
          <DailyBars title="Likes" days={o.daily.days} values={o.daily.likes} />
          <DailyBars title="Clicks to brand shops" days={o.daily.days} values={o.daily.clicks} />
          <DailyBars title="AI previews made" days={o.daily.days} values={o.daily.previews} />
        </div>
      </Section>

      <Section title="Looks and the Runway">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Published looks" value={num(o.looks.published)} note={`${num(o.looks.published7)} this week`} href="/admin/looks" />
          <Stat label="Likes" value={num(o.looks.likes)} note={`${num(o.looks.dislikes)} dislikes`} />
          <Stat label="Comments" value={num(o.looks.comments)} href="/admin/comments" />
          <Stat label="Drafts · hidden" value={`${num(o.looks.drafts)} · ${num(o.looks.hidden)}`} note="Not on the Runway" href="/admin/looks?filter=hidden" />
        </div>
      </Section>

      <Section title="Brands, shop clicks and AI costs">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Clicks to brand shops" value={num(o.shop.clicks)} note={`${num(o.shop.clicks7)} this week`} href="/admin/brands" />
          <Stat
            label="Pieces in stock"
            value={num(o.catalog.inStock)}
            note={`${num(o.catalog.newIn)} new in · ${o.catalog.brands} brands${o.catalog.hiddenBrands ? ` (${o.catalog.hiddenBrands} hidden)` : ''}`}
            href="/admin/brands"
          />
          <Stat label="AI previews" value={num(o.previews.total)} note={`${num(o.previews.today)} in the last 24 h`} href="/admin/previews" />
          <Stat label="AI preview spending" value={usd(o.previews.costTotal)} note={`${usd(o.previews.cost30)} in 30 days, at ${usd(o.previews.costEach)} each`} href="/admin/previews" />
        </div>
        <p className="mt-3 text-sm text-ink/70">
          Catalogue last synced {ago(o.catalog.syncedAt)}
          {o.catalog.totalProducts ? ` (${num(o.catalog.totalProducts)} products in total)` : ''}. <Link className="font-semibold text-plum" href="/admin/brands">See every brand →</Link>
        </p>
      </Section>
    </>
  );
}
