import Link from 'next/link';
import Logo, { UrduName } from '@/components/Logo';
import LookFigure from './LookFigure';
import ModestySlider from './ModestySlider';
import RunwayShowcase from './RunwayShowcase';

/* The landing page after the hero, in reading order. */

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.28em] ${light ? 'text-gold-light' : 'text-gold-deep'}`}>
      <span className="text-gold" aria-hidden="true">✦</span>
      {children}
    </p>
  );
}

/* -------------------------------------- Brand ticker -------------------------------------- */

// The brands whose pieces are in the Studio, women's and men's. Logos come from each brand's own site
// (public/brands) and are shown in one ivory tone so they sit together on the plum band. Bareeze's and
// Outfitters' logos could not be read from their sites, so their names are set as wordmarks for now.
const BRANDS: { name: string; logo?: string; h: string }[] = [
  { name: 'Maria B', logo: '/brands/maria-b.svg', h: 'h-7 sm:h-8' },
  { name: 'J. (Junaid Jamshed)', logo: '/brands/junaid-jamshed.svg', h: 'h-14 sm:h-16' },
  { name: 'Sapphire', logo: '/brands/sapphire.svg', h: 'h-4 sm:h-5' },
  { name: 'Diners', logo: '/brands/diners.svg', h: 'h-7 sm:h-8' },
  { name: 'Gul Ahmed', logo: '/brands/gul-ahmed.svg', h: 'h-6 sm:h-7' },
  { name: 'Edenrobe', logo: '/brands/edenrobe.png', h: 'h-6 sm:h-7' },
  { name: 'Limelight', logo: '/brands/limelight.svg', h: 'h-7 sm:h-8' },
  { name: 'Amir Adnan', logo: '/brands/amir-adnan.png', h: 'h-10 sm:h-12' },
  { name: 'Nishat Linen', logo: '/brands/nishat-linen.png', h: 'h-6 sm:h-8' },
  { name: 'Bonanza Satrangi', logo: '/brands/bonanza-satrangi.png', h: 'h-7 sm:h-8' },
  { name: 'Ethnic', logo: '/brands/ethnic.svg', h: 'h-6 sm:h-8' },
  { name: 'Charcoal', logo: '/brands/charcoal.png', h: 'h-5 sm:h-6' },
  { name: 'Beechtree', logo: '/brands/beechtree.svg', h: 'h-6 sm:h-7' },
  { name: 'Alkaram Studio', logo: '/brands/alkaram-studio.png', h: 'h-9 sm:h-11' },
  { name: 'Outfitters', h: '' },
  { name: 'Bareeze', h: '' },
];

export function BrandTicker() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {BRANDS.map((b) => (
        <li key={b.name} className="flex items-center px-8 sm:px-12">
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logo} alt={hidden ? '' : b.name} className={`brand-logo w-auto ${b.h}`} loading="lazy" />
          ) : (
            <span className="whitespace-nowrap font-display text-2xl font-semibold uppercase tracking-[0.3em] text-ivory/85 sm:text-3xl">{b.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Brands in the Studio" className="relative overflow-hidden border-y border-gold/40 bg-plum-dark pb-6 pt-5">
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-light">
        Style real pieces from Pakistan’s favourite brands
      </p>
      <div className="marquee flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}

/* --------------------------------------- Try it now --------------------------------------- */

export function TryIt() {
  return (
    <section id="try" className="relative scroll-mt-20 bg-ivory py-20 sm:py-28">
      <div className="page">
        <div className="reveal mx-auto max-w-2xl text-center">
          <Eyebrow>Free to join</Eyebrow>
          <h2 className="mt-4 text-5xl font-semibold leading-[1] sm:text-6xl">
            Create your first design <span className="italic text-plum">for free.</span>
          </h2>
          <p className="mt-5 text-lg text-ink/75">
            Create a free account, pick a challenge, and put a complete look together from real pieces of 20+ Pakistani
            brands, head to toe. Your first AI preview is free too: see your look on a model before you publish it.
          </p>
          <ol className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
            {['Create a free account', 'Pick a challenge and your pieces', 'Publish to the Runway'].map((step, i) => (
              <li key={step} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-sm font-semibold text-white">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary !px-8 !py-4 text-base">Create my first design</Link>
            <Link href="/runway" className="btn btn-ghost !px-8 !py-4 text-base">See the Runway</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------- How it works -------------------------------------- */

function TicketsArt() {
  const tickets = [
    { t: 'Mehndi', c: ['#D4A017', '#0F7B5A'], r: '-rotate-6' },
    { t: 'Eid', c: ['#F6EFE0', '#E2C07A'], r: 'rotate-3' },
    { t: 'Office', c: ['#1F3A5F', '#F3EBDD'], r: '-rotate-1' },
  ];
  return (
    <div className="relative h-full w-full">
      {tickets.map((k, i) => (
        <div
          key={k.t}
          className={`absolute left-1/2 flex w-40 -translate-x-1/2 items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 shadow-md ${k.r}`}
          style={{ top: `${18 + i * 22}%` }}
        >
          <span className="font-display text-lg font-semibold">{k.t}</span>
          <span className="flex gap-1">{k.c.map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-ink/10" style={{ background: c }} />)}</span>
        </div>
      ))}
    </div>
  );
}

function BoardArt() {
  return (
    <div className="grid h-[78%] w-[62%] grid-cols-[1.4fr_1fr] gap-1.5 rounded-2xl bg-[#FBF3EA] p-1.5 shadow-md">
      <div className="rounded-xl" style={{ background: 'linear-gradient(160deg,#0F7B5A,#0B5E45)' }} />
      <div className="flex flex-col gap-1.5">
        {['#F3EBDD', '#E2C07A', '#C9A24A', '#D8B25A'].map((c) => <div key={c} className="flex-1 rounded-lg" style={{ background: c }} />)}
      </div>
    </div>
  );
}

function ReactionsArt() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-[10%] h-[78%] w-[44%] -translate-x-1/2 overflow-hidden rounded-t-full bg-gradient-to-b from-[#F2D9D6] to-white shadow-md">
        <LookFigure
          id="step-3"
          label="A baraat look in red and gold"
          look={{ kameez: '#9E1F2E', bottom: '#6F1D2B', dupatta: '#C9A24A', shoes: '#C9A24A', jewel: { kind: 'choker', color: '#D4AF37' } }}
          className="mx-auto mt-3 block h-[92%] w-auto"
        />
      </div>
      <span className="float absolute left-[8%] top-[30%] rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-md">👍 401</span>
      <span className="float float-2 absolute right-[6%] top-[52%] rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-md">💬 22</span>
      <span className="float float-3 absolute bottom-[6%] right-[8%] whitespace-nowrap rounded-2xl rounded-bl-sm bg-plum px-3 py-1.5 text-xs text-white shadow-md">Bridal party goals!</span>
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    { n: '01', t: 'Pick a challenge', b: 'Mehndi in mustard, Eid in white, a sharp office look. Each one sets the occasion, the colours and how covered the look should be.', art: <TicketsArt /> },
    { n: '02', t: 'Build it head to toe', b: 'Outfit and bottom, then the finishing touches: a dupatta, bag and jewellery for her, a waistcoat and a watch for him. Real pieces from Pakistan’s favourite brands, with the total in PKR.', art: <BoardArt /> },
    { n: '03', t: 'Walk the Runway', b: 'Publish your look for everyone to see. Like what you love, comment and reply, and tap any brand to shop the real piece.', art: <ReactionsArt /> },
  ];
  return (
    <section id="how" className="relative bg-sand py-20 sm:py-28">
      <div className="grain" aria-hidden="true" />
      <div className="page relative">
        <div className="reveal max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-5xl font-semibold leading-[1] sm:text-6xl">Three steps to the Runway</h2>
        </div>
        <ol className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s) => (
            <li key={s.n} className="reveal">
              <div className="arch arch-frame relative flex aspect-[4/3.6] items-center justify-center overflow-hidden bg-ivory">{s.art}</div>
              <div className="mt-6 flex items-baseline gap-4">
                <span className="numeral font-display text-6xl font-semibold leading-none" aria-hidden="true">{s.n}</span>
                <h3 className="text-3xl font-semibold">{s.t}</h3>
              </div>
              <p className="mt-3 leading-relaxed text-ink/75">{s.b}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------- The Runway --------------------------------------- */

export function OnTheRunway() {
  return (
    <section className="relative overflow-hidden bg-night py-20 text-white sm:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_10%,rgb(107_45_92_/_0.55),transparent_70%),radial-gradient(40%_40%_at_10%_90%,rgb(184_137_59_/_0.18),transparent_70%)]" aria-hidden="true" />
      <div className="page relative">
        <div className="reveal grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <Eyebrow light>On the Runway</Eyebrow>
            <h2 className="mt-4 text-5xl font-semibold leading-[1] sm:text-6xl">
              Every look gets its <span className="italic text-gold-light">moment.</span>
            </h2>
            <p className="mt-5 text-lg text-white/75">
              Women’s and men’s looks from players across Pakistan, styled from real pieces. Like the ones you love, tell
              them why, and find your next favourite outfit in someone else’s look.
            </p>
          </div>
          <Link href="/signup" className="btn btn-light self-start lg:self-end">Join the Runway</Link>
        </div>
        <div className="mt-14">
          <RunwayShowcase />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------- Modesty ---------------------------------------- */

export function Modesty() {
  return (
    <section className="relative bg-ivory py-20 sm:py-28">
      <div className="page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="reveal">
          <Eyebrow>Modest-friendly</Eyebrow>
          <h2 className="mt-4 text-5xl font-semibold leading-[1] sm:text-6xl">
            Modesty is part of the <span className="italic text-plum">brief.</span>
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink/75">
            Every women’s challenge sets a coverage level, from relaxed to fully covered. Only pieces that meet it can be
            chosen, and modest challenges ask for a dupatta or scarf. Slide to see how a look changes.
          </p>
        </div>
        <div className="reveal"><ModestySlider /></div>
      </div>
    </section>
  );
}

/* ---------------------------------------- Brands ---------------------------------------- */

export function ForBrands() {
  const points = [
    { t: 'Styled by shoppers', b: 'Your pieces worn in complete looks, put together by the people who buy them.' },
    { t: 'Clicks to your shop', b: 'Every brand name links to the product on your own site, and every click is counted.' },
    { t: 'Your own dashboard', b: 'Add pieces one by one or from a spreadsheet, and see which get styled, liked and clicked.' },
    { t: 'A free 90-day pilot', b: 'Join while we’re early and help shape what we build.' },
  ];
  return (
    <section className="relative overflow-hidden bg-plum-dark py-20 text-white sm:py-28">
      <div className="pointer-events-none absolute -left-20 -top-24 h-96 w-96 rounded-full border border-gold/20" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-10 -top-14 h-96 w-96 rounded-full border border-gold/10" aria-hidden="true" />
      <div className="page relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="reveal">
          <Eyebrow light>For brands</Eyebrow>
          <h2 className="mt-4 text-5xl font-semibold leading-[1] sm:text-6xl">Your pieces, styled by the people who shop them.</h2>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/brand/apply" className="btn btn-light">Create a brand account</Link>
            <Link href="/login" className="btn btn-outline-light">Brand sign in</Link>
          </div>
          <p className="mt-3 text-sm text-white/75">Our team reviews every application, usually within two working days.</p>
        </div>
        <ul className="reveal grid gap-px overflow-hidden rounded-3xl border border-white/15 bg-white/15 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p.t} className="bg-plum-dark p-6">
              <h3 className="text-2xl font-semibold text-gold-light">{p.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{p.b}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------- Privacy ---------------------------------------- */

export function Privacy() {
  const points = [
    { t: 'First name only', b: 'The Runway shows your first name, never your full name or email.' },
    { t: 'No photos needed', b: 'Style and share looks without ever uploading one.' },
    { t: 'Delete any time', b: 'Remove all your data with one tap in Account.' },
  ];
  return (
    <section className="bg-ivory pb-20">
      <div className="page">
        <div className="hairline" />
        <ul className="grid gap-8 py-12 sm:grid-cols-3">
          {points.map((p) => (
            <li key={p.t} className="reveal flex gap-4">
              <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold-deep" aria-hidden="true">✦</span>
              <div>
                <h3 className="text-2xl font-semibold text-plum-dark">{p.t}</h3>
                <p className="mt-1 text-sm text-ink/75">{p.b}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="hairline" />
      </div>
    </section>
  );
}

/* ---------------------------------------- Finale ---------------------------------------- */

export function Finale() {
  return (
    <section className="relative overflow-hidden bg-night py-24 text-center text-white sm:py-32">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14rem] leading-none text-gold/[0.08] sm:text-[24rem]" aria-hidden="true">
        <UrduName className="leading-[1.6]" />
      </div>
      <div className="page relative">
        <div className="reveal mx-auto max-w-3xl">
          <Eyebrow light>Your turn</Eyebrow>
          <h2 className="mt-5 text-5xl font-semibold leading-[1] sm:text-7xl">
            Your first look is a few <span className="italic text-gold-light">minutes away.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/75">
            Create a free account: style looks as a player, or show your pieces as a brand.
          </p>
          <AccountChoice />
        </div>
      </div>
    </section>
  );
}

/** Two ways in: a player account (to style looks) or a brand account (to show your pieces). */
function AccountChoice() {
  const options = [
    {
      title: 'I’m here to style',
      body: 'Build complete looks from real pieces, share them on the Runway, and get likes and comments.',
      cta: 'Create my account',
      href: '/signup',
      signIn: '/login',
      note: 'Free, ready in a minute',
    },
    {
      title: 'I’m a brand',
      body: 'Put your pieces in front of shoppers styling complete looks, and see what they pick, like and click.',
      cta: 'Create a brand account',
      href: '/brand/apply',
      signIn: '/login',
      note: 'Reviewed by our team first',
    },
  ];
  return (
    <ul className="mx-auto mt-10 grid max-w-3xl gap-4 text-left sm:grid-cols-2">
      {options.map((o) => (
        <li key={o.href} className="flex flex-col rounded-3xl border border-white/20 bg-white/[0.06] p-6 backdrop-blur-sm">
          <h3 className="text-3xl font-semibold text-gold-light">{o.title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-white/80">{o.body}</p>
          <Link href={o.href} className="btn btn-light mt-5 w-full">
            {o.cta}
          </Link>
          <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/75">
            <span>{o.note}</span>
            <Link href={o.signIn} className="flex min-h-[32px] items-center font-semibold text-white underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------- Footer ---------------------------------------- */

export function Footer() {
  return (
    <footer className="bg-sand py-10">
      <div className="page flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <UrduName className="text-lg leading-[2] text-gold-deep" />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 text-sm text-ink/80">
          <Link href="/signup" className="flex min-h-[44px] items-center hover:text-ink">Get started</Link>
          <Link href="/login" className="flex min-h-[44px] items-center hover:text-ink">Sign in</Link>
          <Link href="/brand/apply" className="flex min-h-[44px] items-center hover:text-ink">For brands</Link>
          <Link href="/credits" className="flex min-h-[44px] items-center hover:text-ink">Photo credits</Link>
        </nav>
      </div>
      <p className="page mt-6 text-xs text-ink/65">Early preview: the looks on this page are illustrated samples.</p>
    </footer>
  );
}
