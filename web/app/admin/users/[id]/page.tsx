'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from '@/components/Toaster';
import { Badge, Loading, PageTitle, Section, Stat, Thumb, act, ago, date, dateTime, num, pkr, useAdmin } from '@/components/admin/ui';

type LookRow = { id: string; status: 'draft' | 'published'; hidden: boolean; challenge: string; brands: string[]; total: number; up: number; down: number; comments: number; createdAt: string; previewUrl: string | null; image: string | null };
type Detail = {
  user: { id: string; email: string; name: string; username: string | null; createdAt: string; verified: boolean; verifiedAt: string | null; suspended: boolean; suspendedAt: string | null; lastSeen: string | null; hasPhoto: boolean; invitedBy: { id: string; username: string } | null };
  profile: { gender: string | null; ageRange: string | null; coverage: number; budgetMin: number; budgetMax: number; occasions: string[]; colorsLiked: string[] } | null;
  stats: { looks: number; drafts: number; hidden: number; likes: number; comments: number; votesGiven: number; previews: number };
  previews: { left: number; free: number; earned: number; used: number; friends: number; blocked: string | null };
  looks: LookRow[];
  comments: Array<{ id: string; text: string; at: string; lookId: string; lookTitle: string; reply: boolean }>;
  invited: Array<{ id: string; username: string; joined: string; published: boolean }>;
};

export default function AdminUser() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: d, setData, error, loading, reload } = useAdmin<Detail>(`/admin/users/${id}`);
  const [credits, setCredits] = useState('1');
  const [rename, setRename] = useState<{ username: string; name: string } | null>(null);

  if (!d) return <Loading error={error} loading={loading} />;
  const u = d.user;

  const action = async (body: Record<string, unknown>, done: string) => {
    const r = await act<Detail>(`/admin/users/${id}`, { body }, done);
    if (r) setData(r);
  };
  async function suspend() {
    if (!u.suspended && !confirm(`Suspend ${u.username ?? u.name}? They are signed out at once and cannot sign in until you lift it. Their looks stay on the Runway unless you hide them.`)) return;
    await action({ action: u.suspended ? 'unsuspend' : 'suspend' }, u.suspended ? 'Suspension lifted' : 'Player suspended');
  }
  async function removeVotes() {
    if (!confirm('Remove every like and dislike this player gave? Use this for fake or farmed votes. It cannot be undone.')) return;
    const r = await act<Detail & { removed: number }>(`/admin/users/${id}`, { body: { action: 'remove-votes' } });
    if (r) {
      setData(r);
      toast(`Removed ${r.removed} vote${r.removed === 1 ? '' : 's'}`, 'success');
    }
  }
  async function remove() {
    const typed = prompt(`This deletes ${u.email} and everything they made (looks, comments, likes, previews). It cannot be undone.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    if (await act(`/admin/users/${id}`, { method: 'DELETE' }, 'Account deleted')) router.replace('/admin/users');
  }
  async function hideLook(l: LookRow) {
    if (await act(`/admin/looks/${l.id}`, { body: { hidden: !l.hidden } }, l.hidden ? 'Look is back on the Runway' : 'Look hidden from the Runway')) reload();
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link className="text-plum" href="/admin/users">
          ← All players
        </Link>
      </p>
      <PageTitle title={u.username ? `@${u.username}` : u.name}>
        {u.suspended && <Badge tone="bad">Suspended {ago(u.suspendedAt)}</Badge>}
        {!u.verified && <Badge tone="warn">Email not confirmed</Badge>}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 text-sm lg:col-span-2">
          <Row label="Name" value={u.name} />
          <Row label="Email" value={<a className="break-all text-plum" href={`mailto:${u.email}`}>{u.email}</a>} />
          <Row label="Username" value={u.username ? `@${u.username}` : 'not chosen yet'} />
          <Row label="Joined" value={dateTime(u.createdAt)} />
          <Row label="Email confirmed" value={u.verified ? dateTime(u.verifiedAt) : 'No'} />
          <Row label="Last active" value={ago(u.lastSeen)} />
          <Row label="Invited by" value={u.invitedBy ? <Link className="text-plum" href={`/admin/users/${u.invitedBy.id}`}>@{u.invitedBy.username}</Link> : '—'} />
          {d.profile && (
            <Row
              label="Taste quiz"
              value={[d.profile.gender, d.profile.ageRange, `coverage ${d.profile.coverage}/5`, `budget ${pkr(d.profile.budgetMin)}–${pkr(d.profile.budgetMax)}`].filter(Boolean).join(' · ')}
            />
          )}
          <Row label="Public page" value={<Link className="text-plum" href={`/u/${u.id}`}>Open profile</Link>} />
        </div>

        <div className="card space-y-3">
          <h2 className="font-sans text-sm font-semibold">Actions</h2>
          <button className={`btn w-full ${u.suspended ? 'btn-primary' : 'btn-ghost'}`} onClick={suspend}>
            {u.suspended ? 'Lift the suspension' : 'Suspend player'}
          </button>
          {!u.verified && (
            <button className="btn btn-ghost w-full" onClick={() => action({ action: 'verify' }, 'Email marked as confirmed')}>
              Mark email as confirmed
            </button>
          )}
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="credits">
              Previews to give
            </label>
            <input id="credits" className="input w-20" type="number" min={-50} max={50} value={credits} onChange={(e) => setCredits(e.target.value)} />
            <button className="btn btn-ghost flex-1 px-3" onClick={() => action({ action: 'credits', credits: Number(credits) }, `${Number(credits) > 0 ? 'Gave' : 'Took'} ${Math.abs(Number(credits))} preview(s)`)}>
              Give AI previews
            </button>
          </div>
          <button className="btn btn-ghost w-full" onClick={() => setRename(rename ? null : { username: u.username ?? '', name: u.name })}>
            Change name or username
          </button>
          {rename && (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await action({ action: 'rename', ...rename }, 'Saved');
                setRename(null);
              }}
            >
              <input className="input" aria-label="Name" value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} />
              <input className="input" aria-label="Username" value={rename.username} onChange={(e) => setRename({ ...rename, username: e.target.value })} />
              <button className="btn btn-primary w-full">Save</button>
            </form>
          )}
          <button className="btn btn-ghost w-full" onClick={removeVotes}>
            Remove all their likes
          </button>
          <button className="btn w-full border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={remove}>
            Delete account
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Published looks" value={num(d.stats.looks)} note={`${d.stats.drafts} draft · ${d.stats.hidden} hidden`} />
        <Stat label="Likes received" value={num(d.stats.likes)} note={`gave ${num(d.stats.votesGiven)} votes`} />
        <Stat label="Comments written" value={num(d.stats.comments)} />
        <Stat label="AI previews" value={`${d.previews.used} used`} note={`${d.previews.left} left (${d.previews.free} free + ${d.previews.earned} extra)`} />
      </div>

      <Section title={`Looks (${d.looks.length})`}>
        {!d.looks.length ? (
          <p className="text-sm text-ink/70">No looks yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.looks.map((l) => (
              <li key={l.id} className="card flex gap-3">
                <Thumb src={l.previewUrl ?? l.image} alt="" className="h-24 w-16" />
                <div className="min-w-0 flex-1 text-sm">
                  <Link href={`/admin/looks/${l.id}`} className="font-semibold text-plum">
                    {l.challenge}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.status === 'draft' ? <Badge>Draft</Badge> : l.hidden ? <Badge tone="bad">Hidden</Badge> : <Badge tone="good">On the Runway</Badge>}
                  </div>
                  <p className="mt-1 text-ink/70">
                    ♥ {l.up} · 💬 {l.comments} · {date(l.createdAt)}
                  </p>
                  {l.status !== 'draft' && (
                    <button className="mt-1 min-h-[32px] text-sm font-semibold text-plum" onClick={() => hideLook(l)}>
                      {l.hidden ? 'Show again' : 'Hide from Runway'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Friends they invited (${d.invited.length})`}>
        {!d.invited.length ? (
          <p className="text-sm text-ink/70">Nobody has joined from their link yet.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {d.invited.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="font-semibold text-plum" href={`/admin/users/${f.id}`}>
                  @{f.username}
                </Link>
                <span className="text-ink/70">
                  joined {date(f.joined)} · {f.published ? 'published a look' : 'no look yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Latest comments (${d.stats.comments})`}>
        {!d.comments.length ? (
          <p className="text-sm text-ink/70">No comments.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {d.comments.map((c) => (
              <li key={c.id} className="py-2">
                <p className="break-words">“{c.text}”</p>
                <p className="text-xs text-ink/70">
                  {c.reply ? 'Reply' : 'Comment'} on <Link className="text-plum" href={`/admin/looks/${c.lookId}`}>{c.lookTitle}</Link> · {ago(c.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <span className="text-ink/65">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}
