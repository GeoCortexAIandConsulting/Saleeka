'use client';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import BodyFigure, { type Gender } from '@/components/BodyFigure';
import { EmbellishPreview, SilhouetteCollage, type Embellishment, type LookStyle } from '@/components/SilhouetteArt';
import ComplexionHelper from '@/components/ComplexionHelper';
import type { Question } from '@/lib/types';

export type Value = string | string[] | number | undefined;

const CM_PER_INCH = 2.54;

/** Height entry in cm or feet + inches. Always reports centimetres (rounded) to the parent. */
export function HeightInput({ value, onChange }: { value: number | undefined; onChange: (cm: number | undefined) => void }) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [cmText, setCmText] = useState(value === undefined ? '' : String(value));
  const [ftText, setFtText] = useState('');
  const [inText, setInText] = useState('');

  // Fill the other unit's fields from the current value when switching.
  const switchTo = (next: 'cm' | 'ft') => {
    if (next === unit) return;
    if (next === 'ft') {
      if (value === undefined) { setFtText(''); setInText(''); }
      else {
        const totalIn = Math.round(value / CM_PER_INCH);
        setFtText(String(Math.floor(totalIn / 12)));
        setInText(String(totalIn % 12));
      }
    } else {
      setCmText(value === undefined ? '' : String(value));
    }
    setUnit(next);
  };

  const updateFtIn = (ft: string, inch: string) => {
    setFtText(ft);
    setInText(inch);
    if (ft === '' && inch === '') return onChange(undefined);
    const totalIn = Number(ft || 0) * 12 + Number(inch || 0);
    onChange(Number.isFinite(totalIn) ? Math.round(totalIn * CM_PER_INCH) : undefined);
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full border border-line bg-white p-1" role="group" aria-label="Height unit">
        {(['cm', 'ft'] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => switchTo(u)}
            aria-pressed={unit === u}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${unit === u ? 'bg-plum text-white' : 'text-ink/70 hover:text-ink'}`}
          >
            {u === 'cm' ? 'cm' : 'ft / in'}
          </button>
        ))}
      </div>

      {unit === 'cm' ? (
        <div className="flex items-center gap-2">
          <input
            className="input max-w-[160px]"
            type="number"
            inputMode="numeric"
            min={130}
            max={200}
            aria-label="Height in centimetres"
            value={cmText}
            onChange={(e) => {
              setCmText(e.target.value);
              onChange(e.target.value === '' ? undefined : Number(e.target.value));
            }}
          />
          <span className="text-ink/65">cm</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            className="input max-w-[90px]"
            type="number"
            inputMode="numeric"
            min={4}
            max={6}
            aria-label="Feet"
            value={ftText}
            onChange={(e) => updateFtIn(e.target.value, inText)}
          />
          <span className="text-ink/65">ft</span>
          <input
            className="input max-w-[90px]"
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
            aria-label="Inches"
            value={inText}
            onChange={(e) => updateFtIn(ftText, e.target.value)}
          />
          <span className="text-ink/65">in</span>
        </div>
      )}

      {unit === 'ft' && value !== undefined && <p className="text-xs text-ink/65">≈ {value} cm</p>}
    </div>
  );
}


export type Answers = Record<string, Value>;

/** Gender the quiz is styling for (a skipped gender counts as female). */
export const genderOf = (answers: Answers): Gender => (answers.gender === 'male' ? 'male' : 'female');

/** Options that apply to this gender, without duplicates. */
export function optionsFor(q: Question, gender: Gender) {
  const seen = new Set<string>();
  return (q.options ?? []).filter((o) => {
    if (o.genders && !o.genders.includes(gender)) return false;
    if (seen.has(o.value)) return false; // never show the same choice twice
    seen.add(o.value);
    return true;
  });
}

/** Follow-up questions (showIf) only count when their trigger answer is chosen. */
export const visibleQuestions = (questions: Question[], answers: Answers) =>
  questions.filter((q) => !q.showIf || answers[q.showIf.id] === q.showIf.value);

/** Whether a question has an acceptable answer (optional questions always do). */
export function isAnswered(q: Question, answers: Answers) {
  if (q.optional) return true;
  const value = answers[q.id];
  if (q.id === 'colorsLiked') {
    if (answers.colorMode === 'any') return true;
    if (answers.colorMode === 'complexion' && answers.undertone && answers.skinDepth) return true;
  }
  if (q.type === 'multi') return Array.isArray(value) && value.length > 0;
  return value !== undefined && value !== '';
}

/** The answers in the shape the server expects, dropping picks hidden by a gender change. */
export function answersBody(questions: Question[], answers: Answers): Record<string, unknown> {
  const gender = genderOf(answers);
  const body: Record<string, unknown> = {};
  for (const q of visibleQuestions(questions, answers)) {
    const v = answers[q.id];
    if (q.type === 'multi') {
      const allowed = new Set(optionsFor(q, gender).map((o) => o.value));
      body[q.id] = Array.isArray(v) ? v.filter((x) => allowed.has(x)) : [];
    } else if (q.type === 'single') {
      if (typeof v === 'string' && optionsFor(q, gender).some((o) => o.value === v)) body[q.id] = v;
    } else if (q.type === 'number') {
      if (v !== undefined && v !== '') body[q.id] = Number(v);
    } else if (v !== undefined && v !== '') body[q.id] = v;
  }
  const colorMode = (answers.colorMode as string | undefined) ?? 'pick';
  body.colorMode = colorMode;
  if (colorMode === 'any') body.colorsLiked = [];
  if (colorMode === 'complexion') {
    body.undertone = answers.undertone;
    body.skinDepth = answers.skinDepth;
  }
  return body;
}

/** A readable one-line version of an answer, for the Account page. */
export function describeAnswer(q: Question, answers: Answers): string {
  const v = answers[q.id];
  const gender = genderOf(answers);
  const label = (x: string) => (q.options ?? []).find((o) => o.value === x && (!o.genders || o.genders.includes(gender)))?.label ?? (q.options ?? []).find((o) => o.value === x)?.label ?? x;
  if (q.id === 'colorsLiked') {
    if (answers.colorMode === 'any') return 'Any colour';
    const picks = Array.isArray(v) ? v.map(label).join(', ') : '';
    if (answers.colorMode === 'complexion' && answers.undertone) {
      return `${picks || 'Suggested for you'} (${answers.undertone} undertone, ${answers.skinDepth} depth)`;
    }
    return picks || 'Not answered';
  }
  if (q.id === 'heightCm' && v !== undefined && v !== '') {
    const cm = Number(v);
    const totalIn = Math.round(cm / CM_PER_INCH);
    return `${cm} cm (${Math.floor(totalIn / 12)} ft ${totalIn % 12} in)`;
  }
  if (q.type === 'number' && q.unit && v !== undefined && v !== '') return `${v} ${q.unit}`;
  if (Array.isArray(v)) return v.length ? v.map(label).join(', ') : 'Not answered';
  if (v === undefined || v === '') return 'Not answered';
  return typeof v === 'string' ? label(v) : String(v);
}

/**
 * The controls for one quiz question. Used step by step in the quiz and inline on the Account page.
 */
export function QuestionInput({ q, answers, setAnswers }: { q: Question; answers: Answers; setAnswers: Dispatch<SetStateAction<Answers>> }) {
  const [hovered, setHovered] = useState<string | undefined>();
  const [showAllFabrics, setShowAllFabrics] = useState(false);
  const [lookStyle, setLookStyle] = useState<LookStyle | null>(null);
  useEffect(() => {
    setHovered(undefined);
  }, [q.id]);

  const value = answers[q.id];
  const gender = genderOf(answers);
  const choices = (qu: Question) => optionsFor(qu, gender);
  const colorMode = (answers.colorMode as string | undefined) ?? 'pick';
  const setColorMode = (mode: 'pick' | 'any' | 'complexion') =>
    setAnswers((a) => ({ ...a, colorMode: mode, ...(mode === 'any' ? { colorsLiked: [] } : {}) }));
  const set = (v: Value) => setAnswers((a) => ({ ...a, [q.id]: v }));
  const toggle = (opt: string) => {
    const exclusive = new Set((q.options ?? []).filter((o) => o.exclusive).map((o) => o.value));
    if (exclusive.has(opt)) return set(Array.isArray(value) && value.includes(opt) ? [] : [opt]); // "All …" stands alone
    const cur = ((Array.isArray(value) ? value : []) as string[]).filter((x) => !exclusive.has(x));
    if (cur.includes(opt)) return set(cur.filter((x) => x !== opt));
    if (q.max && cur.length >= q.max) return set([...cur.slice(1), opt]); // replace the oldest pick
    set([...cur, opt]);
  };

  return (
    <div>
          {q.type === 'single' && q.id === 'bodyShape' && (() => {
            const opts = choices(q);
            const previewValue = hovered ?? (typeof value === 'string' ? value : undefined);
            const preview = opts.find((o) => o.value === previewValue);
            const notSure = !preview || preview.value === 'not-sure';
            const height = answers.heightCm === undefined || answers.heightCm === '' ? undefined : Number(answers.heightCm);
            const weight = answers.weightKg === undefined || answers.weightKg === '' ? undefined : Number(answers.weightKg);
            return (
              <div className="grid gap-4 landscape:grid-cols-[1fr_180px] sm:grid-cols-[1fr_200px] sm:items-start xl:grid-cols-[1fr_260px]">
                <figure className="mx-auto w-full max-w-[260px] rounded-3xl border border-line bg-gradient-to-b from-plum-soft to-ivory p-2 landscape:order-2 sm:sticky sm:top-24 sm:order-2">
                  <BodyFigure gender={gender} shape={notSure ? undefined : preview!.value} heightCm={height} weightKg={weight} ghost={notSure} className="h-[220px] landscape:h-[200px] sm:h-[280px] xl:h-[360px]" />
                  <figcaption className="px-2 pb-2 text-center" aria-live="polite">
                    <div className="text-sm font-semibold">{notSure ? (preview ? 'We’ll work it out' : 'Hover a shape to preview') : preview!.label}</div>
                    {!notSure && preview!.hint && <div className="text-xs text-ink/65">{preview!.hint}</div>}
                  </figcaption>
                </figure>
                <div className="grid gap-2 landscape:order-1 sm:order-1 xl:grid-cols-2" onMouseLeave={() => setHovered(undefined)}>
                  {opts.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => set(o.value)}
                      onMouseEnter={() => setHovered(o.value)}
                      onFocus={() => setHovered(o.value)}
                      onBlur={() => setHovered(undefined)}
                      aria-pressed={value === o.value}
                      className={`w-full rounded-2xl border p-4 text-left transition ${value === o.value ? 'border-plum bg-plum-soft' : 'border-line bg-white hover:border-plum/50'}`}
                    >
                      <div className="font-semibold">{o.label}</div>
                      {o.hint && <div className="text-sm text-ink/65">{o.hint}</div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {q.type === 'single' && q.id === 'embellishment' && (() => {
            // Women can compare eastern and western looks; default to western if that's the only silhouette they picked.
            const sil = (Array.isArray(answers.silhouettes) ? answers.silhouettes : []) as string[];
            const look: LookStyle = lookStyle ?? (sil.length > 0 && sil.every((x) => x === 'western' || x === 'fusion') ? 'western' : 'eastern');
            return (
            <>
            {gender === 'female' && (
              <div className="mb-3 inline-flex rounded-full border border-line bg-white p-1" role="group" aria-label="Look style">
                {(['eastern', 'western'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLookStyle(l)}
                    aria-pressed={look === l}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${look === l ? 'bg-plum text-white' : 'text-ink/70 hover:text-ink'}`}
                  >
                    {l === 'eastern' ? 'Eastern looks' : 'Western looks'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid max-w-3xl grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
              {choices(q).map((o) => (
                <button
                  key={o.value}
                  onClick={() => set(o.value)}
                  aria-pressed={value === o.value}
                  className={`rounded-2xl border p-2 text-left transition ${value === o.value ? 'border-plum bg-plum-soft ring-2 ring-plum' : 'border-line bg-white hover:border-plum/50'}`}
                >
                  <EmbellishPreview level={o.value as Embellishment} gender={gender} look={look} />
                  <div className="mt-2 px-1 font-semibold">{o.label}</div>
                  {o.hint && <div className="px-1 text-xs text-ink/65 sm:text-sm">{o.hint}</div>}
                </button>
              ))}
            </div>
            </>
            );
          })()}

          {q.type === 'single' && q.id !== 'bodyShape' && q.id !== 'embellishment' && (
            <div className="grid gap-2 landscape:grid-cols-2 md:grid-cols-2">
              {choices(q).map((o) => (
                <button
                  key={o.value}
                  onClick={() => set(o.value)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${value === o.value ? 'border-plum bg-plum-soft' : 'border-line bg-white hover:border-plum/50'}`}
                >
                  <div className="font-semibold">{o.label}</div>
                  {o.hint && <div className="text-sm text-ink/65">{o.hint}</div>}
                </button>
              ))}
            </div>
          )}

          {q.type === 'multi' && q.id === 'silhouettes' && (
            <div className="grid grid-cols-2 gap-3 landscape:grid-cols-3 sm:grid-cols-3 xl:grid-cols-4">
              {choices(q).map((o) => {
                const on = Array.isArray(value) && value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    aria-pressed={on}
                    className={`relative rounded-2xl border p-2 text-left transition ${on ? 'border-plum bg-plum-soft ring-2 ring-plum' : 'border-line bg-white hover:border-plum/50'}`}
                  >
                    <SilhouetteCollage kind={o.value} gender={gender} />
                    <div className="mt-2 px-1 text-sm font-semibold">{o.label}</div>
                    {on && (
                      <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-plum text-xs text-white" aria-hidden="true">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {q.id === 'colorsLiked' && (
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How to choose colours">
                {([
                  ['pick', 'I’ll pick'],
                  ['any', 'Any colour'],
                  ['complexion', 'Suggest for my complexion'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={colorMode === mode}
                    onClick={() => setColorMode(mode)}
                    className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${colorMode === mode ? 'border-plum bg-plum text-white' : 'border-line bg-white hover:border-plum/50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {colorMode === 'any' && (
                <p className="rounded-xl bg-plum-soft p-3 text-sm">Great, we won’t filter by colour. You can still tell us colours you never wear next.</p>
              )}
              {colorMode === 'complexion' && (
                <ComplexionHelper
                  palettes={q.palettes ?? {}}
                  hexOf={(c) => q.options?.find((o) => o.value === c)?.hex}
                  initial={{ undertone: answers.undertone as any, depth: answers.skinDepth as any }}
                  onApply={(r) => setAnswers((a) => ({ ...a, undertone: r.undertone, skinDepth: r.depth, colorsLiked: r.colors.slice(0, q.max ?? 5) }))}
                />
              )}
            </div>
          )}

          {q.type === 'multi' && q.id === 'silhouettes' && (
            <p className="mt-3 text-xs text-ink/65">
              Example photos for illustration only. <a href="/credits" target="_blank" className="underline">Photo credits</a>
            </p>
          )}

          {q.type === 'multi' && q.id === 'seasons' && (
            <div className="grid grid-cols-2 gap-3 landscape:grid-cols-4 sm:grid-cols-4">
              {choices(q).map((o) => {
                const on = Array.isArray(value) && value.includes(o.value);
                const icon: Record<string, string> = { summer: '☀️', autumn: '🍂', winter: '❄️', spring: '🌸', all: '🗓️' };
                return (
                  <button
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    aria-pressed={on}
                    className={`rounded-2xl border p-4 text-left transition ${o.exclusive ? 'col-span-2 sm:col-span-4' : ''} ${on ? 'border-plum bg-plum-soft ring-2 ring-plum' : 'border-line bg-white hover:border-plum/50'}`}
                  >
                    <div className="text-2xl" aria-hidden="true">{icon[o.value]}</div>
                    <div className="mt-1 font-semibold">{o.label}</div>
                    {o.hint && <div className="text-xs text-ink/65">{o.hint}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'multi' && q.id === 'fabrics' && (() => {
            const picked = (Array.isArray(answers.seasons) ? answers.seasons : []) as string[];
            const anySeason = picked.length === 0 || picked.includes('all');
            const opts = choices(q);
            const allOpt = opts.filter((o) => o.exclusive);
            const fits = (o: (typeof opts)[number]) => anySeason || (o.seasons ?? []).some((s) => picked.includes(s));
            const matched = opts.filter((o) => !o.exclusive && fits(o));
            const others = opts.filter((o) => !o.exclusive && !fits(o));
            const chip = (o: (typeof opts)[number]) => {
              const on = Array.isArray(value) && value.includes(o.value);
              return (
                <button key={o.value} onClick={() => toggle(o.value)} className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on}>
                  {o.label}
                  {o.hint && <span className="ml-1 text-xs opacity-70">· {o.hint}</span>}
                </button>
              );
            };
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">{allOpt.map(chip)}</div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/65">
                    {anySeason ? 'All fabrics' : `Best for ${picked.join(', ')}`}
                  </div>
                  <div className="flex flex-wrap gap-2">{matched.map(chip)}</div>
                </div>
                {others.length > 0 && (
                  <div>
                    <button type="button" className="text-sm font-semibold text-plum underline-offset-2 hover:underline" onClick={() => setShowAllFabrics((v) => !v)} aria-expanded={showAllFabrics}>
                      {showAllFabrics ? 'Hide other fabrics' : `Show more fabrics (${others.length})`}
                    </button>
                    {showAllFabrics && <div className="mt-2 flex flex-wrap gap-2">{others.map(chip)}</div>}
                  </div>
                )}
              </div>
            );
          })()}

          {q.type === 'multi' && !['silhouettes', 'seasons', 'fabrics'].includes(q.id) && !(q.id === 'colorsLiked' && colorMode === 'any') && (
            <div className="flex flex-wrap gap-2">
              {choices(q).map((o) => {
                const on = Array.isArray(value) && value.includes(o.value);
                return (
                  <button key={o.value} onClick={() => toggle(o.value)} className={`chip capitalize ${on ? 'chip-on' : ''}`} aria-pressed={on}>
                    {o.hex && <span className="mr-2 inline-block h-4 w-4 rounded-full border border-black/10" style={{ background: o.hex }} />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'number' && q.id === 'heightCm' && (
            <HeightInput value={value === undefined || value === '' ? undefined : Number(value)} onChange={set} />
          )}

          {q.type === 'number' && q.id !== 'heightCm' && (
            <div className="flex items-center gap-2">
              <input
                className="input max-w-[160px]"
                type="number"
                inputMode="numeric"
                min={q.min}
                max={q.maxValue}
                value={(value as number | string | undefined) ?? ''}
                onChange={(e) => set(e.target.value === '' ? undefined : e.target.value)}
                aria-label={q.unit ? `${q.title.replace(/ \(optional\)$/, '')} in ${q.unit}` : undefined}
              />
              {q.unit && <span className="text-ink/65">{q.unit}</span>}
            </div>
          )}

          {q.type === 'text' && (
            <textarea className="input min-h-[120px]" maxLength={500} value={(value as string | undefined) ?? ''} onChange={(e) => set(e.target.value)} />
          )}
    </div>
  );
}
