'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { QuestionInput, answersBody, helpOf, isAnswered, visibleQuestions, type Answers } from '@/components/QuestionInput';
import { api } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { Question } from '@/lib/types';

export default function Quiz() {
  const me = useRequireUser();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ questions: Question[] }>('/quiz/questions').then((d) => setQuestions(d.questions));
  }, []);

  const visible = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);
  useEffect(() => {
    window.scrollTo({ top: 0 }); // each question starts at the top
  }, [step]);

  const q = visible[step];
  const value = q ? answers[q.id] : undefined;
  const last = step === visible.length - 1;
  const valid = q ? isAnswered(q, answers) : false;

  async function finish() {
    setBusy(true);
    setError('');
    try {
      await api('/quiz/answers', { body: answersBody(questions, answers) });
      // The ranking rounds show women's looks (they teach the women's stylist); men go straight to the Studio.
      router.replace(answers.gender === 'male' ? '/studio' : '/rounds');
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!me || !q) return (<><Header /><main className="p-8 text-center text-ink/65">Loading…</main></>);
  const pct = ((step + 1) / visible.length) * 100;

  return (
    <>
      <Header />
      <main className="page pt-6 lg:pt-10">
        {/* Phones: one column. Large screens: the question stays on the left while the choices scroll on the right. */}
        <div className="lg:grid lg:grid-cols-[minmax(260px,5fr)_8fr] lg:gap-12">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="mb-1 flex justify-between text-xs text-ink/65">
              <span>Question {step + 1} of {visible.length}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <div className="mb-6 h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={step + 1} aria-valuemax={visible.length}>
              <div className="h-full rounded-full bg-plum transition-all" style={{ width: `${pct}%` }} />
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">{q.title}</h1>
            {helpOf(q, answers) && <p className="mt-2 text-sm text-ink/65 lg:text-base">{helpOf(q, answers)}</p>}
            {q.type === 'multi' && q.max && <p className="mt-1 text-xs text-ink/65">Pick up to {q.max}</p>}
          </aside>

          <section className="mt-5 lg:mt-0">
            <QuestionInput q={q} answers={answers} setAnswers={setAnswers} />
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {/* Sits right under the options; on long questions it sticks to the bottom of the screen. */}
            <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
              <div className="flex items-center gap-3">
                <button className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</button>
                <div className="flex-1" />
                {q.optional && !last && (value === undefined || (Array.isArray(value) && value.length === 0)) && (
                  <button className="btn btn-ghost" onClick={() => setStep(step + 1)}>Skip</button>
                )}
                {last ? (
                  <button className="btn btn-primary" disabled={!valid || busy} onClick={finish}>{busy ? 'Building your profile…' : 'See my looks'}</button>
                ) : (
                  <button className="btn btn-primary" disabled={!valid} onClick={() => setStep(step + 1)}>Next</button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
