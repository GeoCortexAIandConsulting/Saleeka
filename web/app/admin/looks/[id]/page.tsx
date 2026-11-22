'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, type LookRow, Loading, PageTitle, SLOT_LABEL, Section, Thumb, act, ago, dateTime, pkr, useAdmin } from '@/components/admin/ui';

type Detail = {
  look: LookRow;
  items: Array<{ slot: string; id: string; title: string; brand: string; price: number; image: string | null; inStock: boolean; url: string | null }>;
  comments: Array<{ id: string; text: string; at: string; by: string; userId: string; reply: boolean }>;
  votes: Array<{ by: string; userId: string; up: boolean; at: string; flags: string[]; trusted: boolean }>;
};

export default function AdminLook() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: d, error, loading, reload } = useAdmin<Detail>(`/admin/looks/${id}`);
  if (!d) return <Loading error={error} loading={loading} />;
  const l = d.look;

  async function toggle() {
    if (await act(`/admin/looks/${id}`, { body: { hidden: !l.hidden } }, l.hidden ? 'Look is back on the Runway' : 'Look hidden from the Runway')) reload();
  }
  async function remove() {
    if (!confirm('Delete this look with its likes and comments? It cannot be undone.')) return;
    if (await act(`/admin/looks/${id}`, { method: 'DELETE' }, 'Look deleted')) router.replace('/admin/looks');
  }
  async function removeComment(cid: string) {
    if (!confirm('Delete this comment (and any replies under it)?')) return;
    if (await act(`/admin/comments/${cid}`, { method: 'DELETE' }, 'Comment deleted')) reload();
  }

  const likes = d.votes.filter((v) => v.up);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link className="text-plum" href="/admin/looks">
          ← All looks
        </Link>
      </p>
      <PageTitle title={l.challenge}>
        {l.status !== 'draft' && (
          <button className="btn btn-ghost" onClick={toggle}>
            {l.hidden ? 'Show on the Runway again' : 'Hide from the Runway'}
          </button>
        )}
        <button className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={remove}>
          Delete look
        </button>
      </PageTitle>
      <p className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm text-ink/70">
        by{' '}
        <Link className="font-semibold text-plum" href={`/admin/users/${l.userId}`}>
          @{l.by}
        </Link>{' '}
        · {dateTime(l.createdAt)} · {pkr(l.total)}
        {l.status === 'draft' ? <Badge>Draft</Badge> : l.hidden ? <Badge tone="bad">Hidden</Badge> : <Badge tone="good">On the Runway</Badge>}
        {l.status !== 'draft' && !l.hidden && (
          <Link className="font-semibold text-plum" href={`/runway/${l.id}`}>
            Open the public page →
          </Link>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {l.previewUrl ? <Thumb src={l.previewUrl} alt="AI preview of the look" className="aspect-[3/4] w-full max-w-xs" /> : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.items.map((i) => (
            <li key={`${i.slot}-${i.id}`} className="card flex gap-3 text-sm">
              <Thumb src={i.image} alt="" />
              <div className="min-w-0">
                <div className="text-xs text-ink/65">{SLOT_LABEL[i.slot] ?? i.slot}</div>
                <div className="font-semibold">{i.title}</div>
                <div className="text-ink/70">
                  {i.brand} · {pkr(i.price)} {i.inStock ? '' : '· sold out'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Section title={`Likes (${likes.length}) and dislikes (${d.votes.length - likes.length})`}>
        <p className="mb-3 text-sm text-ink/70">Flags help spot fake votes: a like from the designer, an unconfirmed or brand-new account, or a friend they invited.</p>
        {!d.votes.length ? (
          <p className="text-sm text-ink/70">No votes yet.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {d.votes.map((v) => (
              <li key={v.userId} className="flex flex-wrap items-center gap-2 py-2">
                <span aria-label={v.up ? 'Like' : 'Dislike'}>{v.up ? '♥' : '✕'}</span>
                <Link className="font-semibold text-plum" href={`/admin/users/${v.userId}`}>
                  @{v.by}
                </Link>
                <span className="text-ink/70">{ago(v.at)}</span>
                {v.flags.map((f) => (
                  <Badge key={f} tone={f === 'friend' || f === 'new account' ? 'warn' : 'bad'}>
                    {f}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Comments (${d.comments.length})`}>
        {!d.comments.length ? (
          <p className="text-sm text-ink/70">No comments.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {d.comments.map((c) => (
              <li key={c.id} className={`flex items-start justify-between gap-3 py-2 ${c.reply ? 'pl-6' : ''}`}>
                <div className="min-w-0">
                  <p className="break-words">{c.text}</p>
                  <p className="text-xs text-ink/70">
                    <Link className="text-plum" href={`/admin/users/${c.userId}`}>
                      @{c.by}
                    </Link>{' '}
                    · {ago(c.at)}
                  </p>
                </div>
                <button className="min-h-[32px] shrink-0 font-semibold text-red-700" onClick={() => removeComment(c.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
