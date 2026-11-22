'use client';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from '@/components/Toaster';
import { Badge, Loading, OCCASION_LABEL, PageTitle, Section, act, num, pkr, useAdmin } from '@/components/admin/ui';
import { PALETTE_HEX } from '@/lib/palette';

type Challenge = {
  id: string;
  title: string;
  source: 'seed' | 'search' | 'admin';
  occasion: string;
  gender: 'female' | 'male';
  season: string | null;
  colors: string[];
  coverage: number;
  wantsDupatta: boolean;
  budget: number | null;
  required: string[];
  prize: string | null;
  launch: boolean;
  hidden: boolean;
  listed: boolean;
  asks: number;
  featured: boolean;
  looks: number;
  drafts: number;
  likes: number;
  players: number;
};
type List = { autoFeatured: boolean; launchOn: boolean; challenges: Challenge[]; custom: { count: number; looks: number } };

type Form = { title: string; occasion: string; gender: 'female' | 'male'; colors: string[]; coverage: number; wantsDupatta: boolean; season: string; budget: string; layer: boolean; waistcoat: boolean; prize: string };
const EMPTY: Form = { title: '', occasion: 'eid', gender: 'female', colors: [], coverage: 3, wantsDupatta: true, season: '', budget: '', layer: false, waistcoat: false, prize: '' };
const SOURCE: Record<string, string> = { seed: 'Built in', search: 'From shopper searches', admin: 'Made by you' };
const COVERAGE = ['', 'Relaxed', 'Light', 'Balanced', 'Modest', 'Fully covered'];

export default function AdminChallenges() {
  const { data, setData, error, loading, reload } = useAdmin<List>('/admin/challenges');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (!data) return <Loading error={error} loading={loading} />;

  async function setFeatured(ids: string[]) {
    const r = await act<List>('/admin/featured', { method: 'PUT', body: { ids } }, ids.length ? 'Featured challenges saved' : 'Back to the automatic weekly pick');
    if (r) setData(r);
  }
  const picked = data.challenges.filter((c) => c.featured).map((c) => c.id);
  async function toggleFeatured(c: Challenge) {
    // The first manual change starts from what is featured now.
    await setFeatured(c.featured ? picked.filter((x) => x !== c.id) : [...picked, c.id]);
  }
  async function toggleHidden(c: Challenge) {
    if (!c.hidden && !confirm(`Hide “${c.title}”? Players cannot pick it any more. Looks already made for it stay on the Runway.`)) return;
    if (await act(`/admin/challenges/${c.id}/hidden`, { body: { hidden: !c.hidden } }, c.hidden ? 'Challenge is back' : 'Challenge hidden')) reload();
  }
  async function remove(c: Challenge) {
    if (!confirm(`Delete “${c.title}”?`)) return;
    if (await act(`/admin/challenges/${c.id}`, { method: 'DELETE' }, 'Challenge deleted')) reload();
  }
  function edit(c: Challenge) {
    setEditing(c.id);
    setForm({
      title: c.title,
      occasion: c.occasion,
      gender: c.gender,
      colors: c.colors,
      coverage: c.coverage,
      wantsDupatta: c.wantsDupatta,
      season: c.season ?? '',
      budget: c.budget ? String(c.budget) : '',
      layer: c.required.includes('layer'),
      waistcoat: c.required.includes('waistcoat'),
      prize: c.prize ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = {
      title: form.title,
      occasion: form.occasion,
      gender: form.gender,
      colors: form.colors,
      coverage: form.coverage,
      wantsDupatta: form.gender === 'female' && form.wantsDupatta,
      season: form.season || null,
      budget: form.budget ? Number(form.budget) : null,
      required: [...(form.layer ? ['layer'] : []), ...(form.waistcoat && form.gender === 'male' ? ['waistcoat'] : [])],
      prize: form.prize || null,
    };
    const r = editing ? await act(`/admin/challenges/${editing}`, { method: 'PUT', body }, 'Challenge saved') : await act('/admin/challenges', { body }, 'Challenge created: players can pick it now');
    if (r) {
      setForm(null);
      setEditing(null);
      reload();
    }
  }

  const listed = data.challenges.filter((c) => c.listed);
  const unlisted = data.challenges.filter((c) => !c.listed);
  return (
    <>
      <PageTitle title="Challenges" intro="The briefs players style for. Featured challenges go first in the Studio and make up the weekly board on the Runway.">
        {!form && (
          <button className="btn btn-primary" onClick={() => setForm(EMPTY)}>
            New challenge
          </button>
        )}
      </PageTitle>

      {form && <ChallengeForm form={form} setForm={setForm} onSubmit={save} editing={Boolean(editing)} onCancel={() => (setForm(null), setEditing(null))} />}

      <div className="card mb-6 text-sm">
        <p>
          <strong>Featured right now:</strong> {data.challenges.filter((c) => c.featured).map((c) => c.title).join(' · ') || 'none'}
        </p>
        <p className="mt-1 text-ink/70">
          {data.autoFeatured
            ? data.launchOn
              ? 'Picked automatically: the launch challenges, until the launch week ends.'
              : 'Picked automatically: a new women’s and men’s challenge every Monday.'
            : 'Picked by you. Press “Feature” or “Unfeature” on any challenge to change it.'}
        </p>
        {!data.autoFeatured && (
          <button className="mt-2 min-h-[32px] font-semibold text-plum" onClick={() => setFeatured([])}>
            Go back to the automatic weekly pick
          </button>
        )}
        <p className="mt-2 text-ink/70">
          Players also made {num(data.custom.count)} private briefs of their own (“What's on your mind today?”), with {num(data.custom.looks)} published looks.
        </p>
      </div>

      <Section title={`Players can pick these (${listed.length})`}>
        <ChallengeList list={listed} onFeature={toggleFeatured} onHide={toggleHidden} onEdit={edit} onDelete={remove} />
      </Section>
      {unlisted.length > 0 && (
        <Section title={`Not shown to players (${unlisted.length})`}>
          <p className="mb-3 text-sm text-ink/70">Hidden by you, or shopper searches still waiting for more people to ask.</p>
          <ChallengeList list={unlisted} onFeature={toggleFeatured} onHide={toggleHidden} onEdit={edit} onDelete={remove} />
        </Section>
      )}
    </>
  );
}

function ChallengeList({ list, onFeature, onHide, onEdit, onDelete }: { list: Challenge[]; onFeature: (c: Challenge) => void; onHide: (c: Challenge) => void; onEdit: (c: Challenge) => void; onDelete: (c: Challenge) => void }) {
  return (
    <ul className="space-y-2">
      {list.map((c) => (
        <li key={c.id} className="card flex flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{c.title}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.featured && <Badge tone="gold">★ Featured</Badge>}
              {c.hidden && <Badge tone="bad">Hidden</Badge>}
              {c.launch && <Badge tone="gold">Launch</Badge>}
              <Badge>{SOURCE[c.source] ?? c.source}</Badge>
              <Badge>{c.gender === 'male' ? 'Men' : 'Women'}</Badge>
              <Badge>{OCCASION_LABEL[c.occasion] ?? c.occasion}</Badge>
              {c.season && <Badge>{c.season}</Badge>}
              {c.budget && <Badge>under {pkr(c.budget)}</Badge>}
            </div>
            {c.prize && <p className="mt-1 text-sm text-gold-deep">🏆 {c.prize}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm md:w-64">
            <div>
              <div className="text-xs text-ink/65">Looks</div>
              <Link className="font-semibold text-plum" href={`/admin/looks?filter=all&challenge=${c.id}`}>
                {num(c.looks)}
              </Link>
            </div>
            <div>
              <div className="text-xs text-ink/65">Players</div>
              <div className="font-semibold">{num(c.players)}</div>
            </div>
            <div>
              <div className="text-xs text-ink/65">{c.source === 'search' ? 'Asked' : 'Likes'}</div>
              <div className="font-semibold">{num(c.source === 'search' ? c.asks : c.likes)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:w-72 md:justify-end">
            {(c.listed || c.featured) && (
              <button className={`btn px-4 ${c.featured ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onFeature(c)} aria-pressed={c.featured}>
                {c.featured ? 'Unfeature' : 'Feature'}
              </button>
            )}
            {c.source === 'admin' && (
              <button className="btn btn-ghost px-4" onClick={() => onEdit(c)}>
                Edit
              </button>
            )}
            <button className="btn btn-ghost px-4" onClick={() => onHide(c)}>
              {c.hidden ? 'Show' : 'Hide'}
            </button>
            {c.source === 'admin' && c.looks + c.drafts === 0 && (
              <button className="btn border border-red-200 bg-white px-4 text-red-700 hover:bg-red-50" onClick={() => onDelete(c)}>
                Delete
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChallengeForm({ form, setForm, onSubmit, onCancel, editing }: { form: Form; setForm: (f: Form) => void; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; editing: boolean }) {
  const colours = Object.keys(PALETTE_HEX);
  const toggleColour = (c: string) => {
    if (form.colors.includes(c)) setForm({ ...form, colors: form.colors.filter((x) => x !== c) });
    else if (form.colors.length >= 6) toast('Up to 6 colours', 'error');
    else setForm({ ...form, colors: [...form.colors, c] });
  };
  return (
    <form onSubmit={onSubmit} className="card mb-6 space-y-4">
      <h2 className="text-2xl font-bold">{editing ? 'Edit challenge' : 'New challenge'}</h2>
      <label className="block text-sm font-medium">
        Title players see
        <input className="input mt-1" required minLength={3} maxLength={80} placeholder="e.g. Eid brunch in pastels under Rs 15,000" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium">
          For
          <select className="input mt-1" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Form['gender'] })}>
            <option value="female">Women</option>
            <option value="male">Men</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Occasion
          <select className="input mt-1" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })}>
            {Object.entries(OCCASION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Coverage
          <select className="input mt-1" value={form.coverage} onChange={(e) => setForm({ ...form, coverage: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} · {COVERAGE[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Season
          <select className="input mt-1" value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}>
            <option value="">Any</option>
            <option value="winter">Winter only</option>
            <option value="summer">Summer only</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Budget for the whole look (Rs, optional)
          <input className="input mt-1" type="number" min={1000} step={500} placeholder="No limit" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2 lg:col-span-3">
          Prize (optional)
          <input className="input mt-1" maxLength={120} placeholder="e.g. Top-voted look wins a PKR 5,000 voucher" value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {form.gender === 'female' && (
          <label className="flex min-h-[40px] items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={form.wantsDupatta} onChange={(e) => setForm({ ...form, wantsDupatta: e.target.checked })} /> Needs a dupatta
          </label>
        )}
        <label className="flex min-h-[40px] items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={form.layer} onChange={(e) => setForm({ ...form, layer: e.target.checked })} /> Needs a coat, shawl or jacket
        </label>
        {form.gender === 'male' && (
          <label className="flex min-h-[40px] items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={form.waistcoat} onChange={(e) => setForm({ ...form, waistcoat: e.target.checked })} /> Needs a waistcoat
          </label>
        )}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Colours (optional, up to 6: leave empty for any colour)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {colours.map((c) => (
            <button key={c} type="button" aria-pressed={form.colors.includes(c)} className={`chip gap-2 ${form.colors.includes(c) ? 'chip-on' : ''}`} onClick={() => toggleColour(c)}>
              <span className="h-4 w-4 rounded-full border border-line" style={{ background: PALETTE_HEX[c] }} aria-hidden />
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary">{editing ? 'Save changes' : 'Create challenge'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
