'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import ProfilePhoto from '@/components/ProfilePhoto';
import { QuestionInput, answersBody, describeAnswer, isAnswered, visibleQuestions, type Answers } from '@/components/QuestionInput';
import { api, forgetDevice, signOut } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import UsernameField, { type UsernameState } from '@/components/UsernameField';
import { toast } from '@/components/Toaster';
import type { PreviewStatus, Question } from '@/lib/types';

const SECTIONS: { title: string; ids: string[] }[] = [
  { title: 'About you', ids: ['gender', 'ageRange', 'heightCm', 'weightKg'] },
  { title: 'Style', ids: ['coverage', 'silhouettes', 'styleWords', 'neverWear'] },
  { title: 'Colours', ids: ['colorsLiked', 'colorsAvoided'] },
  { title: 'Seasons & fabrics', ids: ['seasons', 'fabrics'] },
  { title: 'Shopping', ids: ['occasions', 'budget', 'brandsLiked', 'brandsAvoided'] },
];

// Changing one of these can change which other answers apply, so they are saved with all answers.
const SHAPING = new Set(['gender', 'colorsLiked']);

interface ProfileInfo {
  summary: string;
  gender?: 'female' | 'male';
  heightCm?: number;
  weightKg?: number;
  bodyShape?: string;
}

export default function Account() {
  const me = useRequireUser();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<Answers | null>(null);
  const [summary, setSummary] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [username, setUsername] = useState('');
  const [savedUsername, setSavedUsername] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameState, setUsernameState] = useState<UsernameState>('empty');
  const [previews, setPreviews] = useState<PreviewStatus | null>(null);
  const [photoVersion, setPhotoVersion] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.user.name);
    setUsername(me.user.username ?? '');
    setSavedUsername(me.user.username ?? '');
    setPhotoVersion(me.user.photoVersion ?? null);
    api<{ status?: PreviewStatus }>('/game/preview')
      .then((r) => setPreviews(r.status ?? null))
      .catch(() => {});
    if (!me.hasProfile) return;
    api<{ questions: Question[] }>('/quiz/questions').then((d) => setQuestions(d.questions));
    api<{ answers: Answers }>('/profile/answers').then((d) => setSaved(d.answers));
    api<{ profile: ProfileInfo }>('/profile').then((d) => setSummary(d.profile.summary));
  }, [me]);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const shown = useMemo(() => new Set(saved ? visibleQuestions(questions, saved).map((q) => q.id) : []), [questions, saved]);

  function startEdit(id: string) {
    setDraft({ ...(saved ?? {}) });
    setEditing(id);
    setEditError('');
    setJustSaved(null);
  }

  async function saveEdit(q: Question) {
    if (!isAnswered(q, draft)) return setEditError('Please choose an answer first.');
    setSaving(true);
    setEditError('');
    try {
      const all = answersBody(questions, draft);
      // Send just the changed question (plus the colour details it carries), or everything when it can reshape others.
      const changes: Record<string, unknown> = SHAPING.has(q.id) ? all : { [q.id]: all[q.id] ?? null };
      if (q.id === 'colorsLiked') Object.assign(changes, { colorMode: all.colorMode, undertone: all.undertone, skinDepth: all.skinDepth });
      if (changes[q.id] === null) delete changes[q.id];
      const out = await api<{ answers: Answers; profile: ProfileInfo }>('/profile/answers', { method: 'PATCH', body: changes });
      setSaved(out.answers);
      setSummary(out.profile.summary);
      setEditing(null);
      setJustSaved(q.id);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveName() {
    try {
      const out = await api<{ user: { name: string } }>('/me', { method: 'PATCH', body: { name } });
      setName(out.user.name);
      setEditingName(false);
    } catch (e: any) {
      setEditError(e.message);
    }
  }

  async function saveUsername() {
    try {
      const out = await api<{ user: { username: string } }>('/me', { method: 'PATCH', body: { username: username.trim().replace(/^@/, '') } });
      setSavedUsername(out.user.username);
      setUsername(out.user.username);
      setEditingUsername(false);
      toast('Username saved.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function wipe() {
    setBusy(true);
    await api('/me', { method: 'DELETE' });
    forgetDevice();
    router.replace('/');
  }

  if (!me) return (<><Header /><main className="p-8 text-center text-ink/65">Loading…</main></>);

  return (
    <>
      <Header />
      <main className="page py-6 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold lg:text-4xl">Account</h1>
          {/* The header has no room for Sign out on phones, so it lives here too. */}
          <button
            type="button"
            className="btn btn-ghost !min-h-[40px] !py-2 text-sm"
            onClick={async () => {
              await signOut();
              router.replace('/');
            }}
          >
            Sign out
          </button>
        </div>

        {/* Large screens: profile card on the left, answers on the right. Phones: stacked. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start xl:grid-cols-[360px_1fr] xl:gap-10">
          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className="card p-6">
              <ProfilePhoto name={name} photoVersion={photoVersion} onChange={setPhotoVersion} />
              <div className="mt-4 text-center">
                {editingName ? (
                  <div className="flex gap-2">
                    <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
                    <button className="btn btn-primary" onClick={saveName}>Save</button>
                  </div>
                ) : (
                  <button className="group font-display text-xl font-bold" onClick={() => setEditingName(true)} title="Change your name">
                    {name} <span className="text-sm font-normal text-plum opacity-0 transition group-hover:opacity-100">Edit</span>
                  </button>
                )}
                <div className="text-sm text-ink/65">{me.user.email}</div>
                {editingUsername ? (
                  <div className="mt-3 text-left">
                    <UsernameField value={username} onChange={setUsername} onState={setUsernameState} current={me.user.username} />
                    <div className="mt-2 flex gap-2">
                      <button className="btn btn-primary !min-h-[40px] flex-1 !py-2 text-sm" disabled={usernameState !== 'ok'} onClick={saveUsername}>Save</button>
                      <button className="btn btn-ghost !min-h-[40px] flex-1 !py-2 text-sm" onClick={() => { setUsername(savedUsername); setEditingUsername(false); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  savedUsername && (
                    <button className="mt-1 text-sm font-medium text-plum underline-offset-2 hover:underline" onClick={() => setEditingUsername(true)} title="Change your username">
                      @{savedUsername} · Change
                    </button>
                  )
                )}
                {previews && (
                  <p className="mt-3 rounded-xl bg-ivory px-3 py-2 text-xs text-ink/80">
                    <strong>AI previews: {previews.left} left.</strong>{' '}
                    {previews.friendsToGo > 0
                      ? `${previews.friends} friend${previews.friends === 1 ? '' : 's'} joined from your share links. ${previews.friendsToGo} more for a free preview.`
                      : 'You’ve earned all the free previews friends can bring. Thank you for sharing!'}
                  </p>
                )}
              </div>
              {summary && <p className="mt-4 border-t border-line pt-4 text-sm text-ink/80">{summary}</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {/* The ranking rounds show women's looks (they teach the women's stylist), so men are not offered them. */}
                {me.gender !== 'male' && <Link href="/rounds" className="btn btn-ghost">More ranking rounds</Link>}
                {!me.hasProfile && <Link href="/quiz" className="btn btn-primary">Take the quiz</Link>}
              </div>
              <p className="mt-4 text-center text-xs text-ink/65">
                Your photo is only shown to you. Complexion selfies are never uploaded.
              </p>
            </div>

            <div className="card hidden border-red-200 lg:block">
              <div className="mb-1 font-semibold">Delete my data</div>
              <p className="text-sm text-ink/70">Removes your account, photo, profile, rankings, chats and saved looks. This cannot be undone.</p>
              {!confirm ? (
                <button className="btn btn-ghost mt-3" onClick={() => setConfirm(true)}>Delete everything</button>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={wipe}>{busy ? 'Deleting…' : 'Yes, delete it all'}</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              )}
            </div>
          </aside>

          <section className="space-y-6">
            {me.hasProfile && !saved && <p className="text-ink/65">Loading your answers…</p>}
            {saved &&
              SECTIONS.map((sec) => {
                const qs = sec.ids.map((id) => byId.get(id)).filter((q): q is Question => !!q && shown.has(q.id));
                if (!qs.length) return null;
                return (
                  <div key={sec.title} className="card p-0">
                    <h2 className="border-b border-line px-5 py-3 text-lg font-bold">{sec.title}</h2>
                    <ul className="divide-y divide-line">
                      {qs.map((q) => (
                        <li key={q.id} className="px-5 py-4">
                          {editing === q.id ? (
                            <div>
                              <div className="mb-3 font-semibold">{q.title}</div>
                              <QuestionInput q={q} answers={draft} setAnswers={setDraft} />
                              {editError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{editError}</p>}
                              <div className="mt-4 flex gap-2">
                                <button className="btn btn-primary" disabled={saving} onClick={() => saveEdit(q)}>{saving ? 'Saving…' : 'Save'}</button>
                                <button className="btn btn-ghost" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-ink/65">{q.title.replace(/ \((optional|pick up to \d+)\)$/, '')}</div>
                                <div className="mt-0.5 font-medium">{describeAnswer(q, saved)}</div>
                                {justSaved === q.id && <div className="mt-1 text-xs font-semibold text-emerald-700">Saved</div>}
                              </div>
                              <button className="btn btn-ghost shrink-0 px-4 py-2 text-xs" onClick={() => startEdit(q.id)} disabled={editing !== null}>
                                Edit
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            {/* On phones and tablets the delete box comes last, after the answers. */}
            <div className="lg:hidden">
            <div className="card border-red-200">
              <div className="mb-1 font-semibold">Delete my data</div>
              <p className="text-sm text-ink/70">Removes your account, photo, profile, rankings, chats and saved looks. This cannot be undone.</p>
              {!confirm ? (
                <button className="btn btn-ghost mt-3" onClick={() => setConfirm(true)}>Delete everything</button>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={wipe}>{busy ? 'Deleting…' : 'Yes, delete it all'}</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              )}
            </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
