import Link from 'next/link';
import Header from '@/components/Header';
import { EmbellishPreview } from '@/components/SilhouetteArt';

const STEPS = [
  { n: '1', title: 'Tell us your taste', body: 'A 3-minute quiz: coverage, colours, cuts, budget and the occasions you shop for.' },
  { n: '2', title: 'Rank a few looks', body: 'Pick your favourites from sets of three and tell us why. Each round sharpens your profile.' },
  { n: '3', title: 'Chat with your stylist', body: '"Mehndi outfit, green, under 25k." Get 3 complete looks from head to toe, with dupatta, shoes and accessories.' },
];

export default function Home() {
  return (
    <>
      <Header signedIn={false} />
      <main className="page pb-16">
        {/* Phones: centred text. Large screens: text left, looks right. */}
        <section className="py-12 text-center sm:py-20 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:text-left">
          <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold">Saleeqa · سلیقہ</p>
          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">Your taste, styled head to toe.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink/70 lg:mx-0">
            One personal stylist for Pakistani fashion. It learns what you love, respects how much coverage you prefer, and builds
            complete looks from real brands, priced in PKR.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link href="/signup" className="btn btn-primary w-full sm:w-auto">Find my style</Link>
            <Link href="/login" className="btn btn-ghost w-full sm:w-auto">I have an account</Link>
          </div>
          </div>
          <div className="mt-12 hidden grid-cols-3 gap-3 sm:grid lg:mt-0 xl:gap-4" aria-hidden="true">
            {(['minimal', 'medium', 'heavy'] as const).map((l, i) => (
              <div key={l} className={i === 1 ? 'lg:-translate-y-6' : ''}>
                <EmbellishPreview level={l} gender="female" look="eastern" />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-plum-soft font-bold text-plum">{s.n}</div>
              <h2 className="text-lg font-bold">{s.title}</h2>
              <p className="mt-1 text-sm text-ink/70">{s.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-bold">Modesty is a setting, not an afterthought</h3>
            <p className="mt-1 text-sm text-ink/70">Choose your coverage level once. Looks below it never appear, and scarves are matched if you wear hijab.</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-bold">Your data stays yours</h3>
            <p className="mt-1 text-sm text-ink/70">Height, body shape and a profile photo are all optional. Complexion selfies never leave your phone. Delete everything with one tap in Account.</p>
          </div>
        </section>
        <p className="mt-10 text-center text-xs text-ink/40">Early preview: products shown are demo data while we onboard brand partners.</p>
      </main>
    </>
  );
}
