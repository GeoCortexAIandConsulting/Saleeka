'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import ProfilePhoto from '@/components/ProfilePhoto';
import AvatarBuilder from '@/components/AvatarBuilder';
import { forgetAvatar } from '@/lib/useAvatar';
import { QuestionInput, answersBody, describeAnswer, isAnswered, visibleQuestions, type Answers } from '@/components/QuestionInput';
import { api } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { Question } from '@/lib/types';

const SECTIONS: { title: string; ids: string[] }[] = [
  { title: 'About you', ids: ['gender', 'ageRange', 'heightCm', 'weightKg', 'bodyShape', 'shapeShoulders', 'shapeWaist'] },
  { title: 'Style', ids: ['coverage', 'dupatta', 'silhouettes', 'embellishment', 'styleWords', 'neverWear'] },
  { title: 'Colours', ids: ['colorsLiked', 'colorsAvoided'] },
  { title: 'Seasons & fabrics', ids: ['seasons', 'fabrics'] },
  { title: 'Shopping', ids: ['occasions', 'budget', 'brandsLiked', 'brandsAvoided', 'footwear'] },
];

// Changing one of these can change which other answers apply, so they are saved with all answers.
const SHAPING = new Set(['gender', 'bodyShape', 'colorsLiked']);

interface ProfileInfo {
  summary: string;
  gender?: 'female' | 'male';
  heightCm?: number;
  weightKg?: number;
  bodyShape?: string;
}
type BodyInfo = Omit<ProfileInfo, 'summary'>;
const bodyOf = (p: ProfileInfo): BodyInfo => ({ gender: p.gender, heightCm: p.heightCm, weightKg: p.weightKg, bodyShape: p.bodyShape });

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
  const [photoVersion, setPhotoVersion] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState<string | null>(null);
  const [body, setBody] = useState<BodyInfo | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.user.name);
    setPhotoVersion(me.user.photoVersion ?? null);
    setAvatarVersion(me.user.avatarVersion ?? null);
    if (!me.hasProfile) return;
    api<{ questions: Question[] }>('/quiz/questions').then((d) => setQuestions(d.questions));
    api<{ answers: Answers }>('/profile/answers').then((d) => setSaved(d.answers));
    api<{ profile: ProfileInfo }>('/profile').then((d) => {
      setSummary(d.profile.summary);
      setBody(bodyOf(d.profile));
    });
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
      setBody(bodyOf(out.profile));
      forgetAvatar(); // try-ons pick up the new height, weight, shape or hijab setting
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

  async function wipe() {
    setBusy(true);
    await api('/me', { method: 'DELETE' });
    router.replace('/');
  }

  if (!me) return (<><Header /><main className="p-8 text-center text-ink/60">Loading…</main></>);

  return (
    <>
      <Header />
      <main className="page py-6 lg:py-10">
        <h1 className="text-3xl font-bold lg:text-4xl">Account</h1>

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
                <div className="text-sm text-ink/60">{me.user.email}</div>
              </div>
              {summary && <p className="mt-4 border-t border-line pt-4 text-sm text-ink/80">{summary}</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/rounds" className="btn btn-ghost">More ranking rounds</Link>
                {!me.hasProfile && <Link href="/quiz" className="btn btn-primary">Take the quiz</Link>}
              </div>
              <p className="mt-4 text-center text-xs text-ink/50">
                Your photo and avatar are only shown to you. Complexion selfies are never uploaded.
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
            {me.hasProfile && body && (
              <div className="card">
                <h2 className="text-lg font-bold">Your 3D avatar</h2>
                <p className="mb-4 mt-1 text-sm text-ink/70">
                  Built from your height, weight and body shape, with your face and skin tone from one selfie.
                </p>
                <AvatarBuilder
                  gender={body.gender ?? 'female'}
                  bodyShape={body.bodyShape}
                  heightCm={body.heightCm}
                  weightKg={body.weightKg}
                  avatarVersion={avatarVersion}
                  onChange={setAvatarVersion}
                />
              </div>
            )}
            {me.hasProfile && !saved && <p className="text-ink/60">Loading your answers…</p>}
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
                                <div className="text-sm text-ink/60">{q.title.replace(/ \((optional|pick up to \d+)\)$/, '')}</div>
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
