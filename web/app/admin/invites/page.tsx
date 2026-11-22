'use client';
import Link from 'next/link';
import { DailyBars, Loading, PageTitle, Section, Stat, date, num, useAdmin } from '@/components/admin/ui';

type Refs = {
  joined: number;
  published: number;
  conversion: number;
  shareOfPlayers: number;
  inviters: number;
  creditsEarned: number;
  daily: { days: string[]; joined: number[] };
  top: Array<{ id: string; username: string; email: string | null; joined: number; published: number; credits: number }>;
  recent: Array<{ id: string; username: string; joined: string; published: boolean; invitedBy: string; invitedById: string }>;
};

export default function AdminInvites() {
  const { data: r, error, loading } = useAdmin<Refs>('/admin/referrals');
  if (!r) return <Loading error={error} loading={loading} />;
  return (
    <>
      <PageTitle title="Invites" intro="Players who joined from a friend's share link. A friend “counts” once they publish their first look; every few counted friends earn the inviter a free AI preview." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Joined from an invite" value={num(r.joined)} note={`${r.shareOfPlayers}% of all players`} />
        <Stat label="…and published a look" value={num(r.published)} note={`${r.conversion}% of invited friends`} />
        <Stat label="Players who invited" value={num(r.inviters)} />
        <Stat label="Previews earned by inviting" value={num(r.creditsEarned)} />
      </div>
      <div className="mt-4 md:w-1/2">
        <DailyBars title="Friends joining per day" days={r.daily.days} values={r.daily.joined} />
      </div>

      <Section title="Top inviters">
        {!r.top.length ? (
          <p className="text-sm text-ink/70">No invites yet.</p>
        ) : (
          <ol className="card divide-y divide-line text-sm">
            {r.top.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-6 text-ink/65">{i + 1}</span>
                <Link className="min-w-0 flex-1 font-semibold text-plum" href={`/admin/users/${t.id}`}>
                  @{t.username} <span className="font-normal text-ink/70">{t.email}</span>
                </Link>
                <span>{num(t.joined)} joined</span>
                <span>{num(t.published)} published</span>
                <span className="text-ink/70">{t.credits} preview{t.credits === 1 ? '' : 's'} earned</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Latest invited players">
        {!r.recent.length ? (
          <p className="text-sm text-ink/70">Nobody yet.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {r.recent.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link className="font-semibold text-plum" href={`/admin/users/${x.id}`}>
                    @{x.username}
                  </Link>{' '}
                  invited by{' '}
                  <Link className="text-plum" href={`/admin/users/${x.invitedById}`}>
                    @{x.invitedBy}
                  </Link>
                </span>
                <span className="text-ink/70">
                  {date(x.joined)} · {x.published ? 'published a look' : 'no look yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
