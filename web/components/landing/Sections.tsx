import Link from 'next/link';
import Logo, { UrduName } from '@/components/Logo';
import LiteToggle from './LiteToggle';
import ModestySlider from './ModestySlider';

const rupees = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;

/* ---------------------------------------- Stages ---------------------------------------- */

function Stage({ scene, id, kicker, title, body, art, children }: {
  scene: number;
  id?: string;
  kicker: string;
  title: string;
  body: string;
  art: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} data-scene={scene} className="stage stage-glow">
      <div className="page stage-inner">
        <div className="grid w-full items-center gap-10 min-[900px]:grid-cols-2">
          <div className="stage-copy reveal max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-light">{kicker}</p>
            <h2 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-6xl">{title}</h2>
            <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">{body}</p>
            {children}
          </div>
          <div className="stage-art reveal" aria-hidden="true">{art}</div>
        </div>
      </div>
    </section>
  );
}

const SWATCHES = ['#0F7B5A', '#F3C9D0', '#F6EFE0', '#6F1D2B', '#A3B18A', '#C9A24A'];

function SwatchArt() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SWATCHES.map((c, i) => (
        <div key={c} className={`fabric h-24 sm:h-32 ${i % 2 ? 'translate-y-4' : ''}`} style={{ background: `linear-gradient(145deg, ${c}, ${c}cc)` }} />
      ))}
    </div>
  );
}

function RankArt() {
  const looks = [
    { n: 2, c: '#A3B18A', t: 'Sage lawn' },
    { n: 1, c: '#6F1D2B', t: 'Maroon formal' },
    { n: 3, c: '#F3C9D0', t: 'Blush chiffon' },
  ];
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {looks.map((l) => (
        <div key={l.n} className={`rounded-3xl border p-2 ${l.n === 1 ? 'border-gold-light bg-white/10' : 'border-white/15'}`}>
          <div className="fabric h-36 sm:h-48" style={{ background: `linear-gradient(160deg, ${l.c}, ${l.c}bb)` }} />
          <p className="mt-2 text-center text-xs text-white/85">{l.n}. {l.t}</p>
        </div>
      ))}
    </div>
  );
}

function BuildArt() {
  const pieces = ['Emerald kameez', 'Ivory dupatta', 'Gold khussa', 'Potli clutch', 'Jhumkay'];
  return (
    <ul className="rounded-3xl border border-white/15 bg-white/5 p-5">
      {pieces.map((p, i) => (
        <li key={p} className="flex items-center gap-3 border-b border-white/10 py-3 last:border-0">
          <span className="fabric h-9 w-9 shrink-0" style={{ background: SWATCHES[i] }} />
          <span className="text-sm text-white/90">{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function HowItWorks() {
  return (
    <div id="how">
      <Stage scene={0} kicker="Step one" title="Tell us your taste" art={<SwatchArt />}
        body="A 3-minute quiz: coverage, colours, cuts, budget and the occasions you shop for." />
      <Stage scene={1} kicker="Step two" title="Rank your favorites" art={<RankArt />}
        body="Pick your favourites from sets of three and tell us why. Each round sharpens your profile." />
      <Stage scene={2} kicker="Step three" title="Chat with your stylist" art={<BuildArt />}
        body="“Mehndi outfit, green, under 25k.” Get three complete looks from head to toe, with dupatta, shoes, a bag and jewellery." />
    </div>
  );
}

export function Finale() {
  return (
    <Stage scene={3} kicker="Saleeqa" title="Your taste, styled head to toe." art={null}
      body="Three minutes today, and a stylist who remembers what you love.">
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Link href="/signup" className="btn btn-light">Find my style</Link>
        <Link href="/login" className="btn btn-outline-light">I have an account</Link>
      </div>
    </Stage>
  );
}

/* --------------------------------------- Modesty --------------------------------------- */

export function Modesty() {
  return (
    <section className="relative z-10 bg-ivory py-20 sm:py-28">
      <div className="page grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="reveal">
          <p className="eyebrow">Modest-friendly</p>
          <h2 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-6xl">Modesty is a setting, not an afterthought</h2>
          <p className="mt-5 max-w-lg leading-relaxed text-ink/80">
            Choose your coverage once, from relaxed to fully covered. Looks below your level never appear, and if you wear
            hijab, every look comes with a matched scarf. Try the slider to see how a look changes.
          </p>
        </div>
        <div className="reveal"><ModestySlider /></div>
      </div>
    </section>
  );
}

/* ------------------------------------- Sample looks ------------------------------------- */

interface SampleItem { slot: string; title: string; brand: string; price: number; hex: string }
interface SampleLook { label: string; occasion: string; items: SampleItem[] }

// Fictional brands and products, in the same shape as the app's looks.
const SAMPLE_LOOKS: SampleLook[] = [
  { label: 'Best match', occasion: 'Eid', items: [
    { slot: 'Outfit', title: 'Emerald silk 3-piece', brand: 'Demo Studio', price: 15900, hex: '#0F7B5A' },
    { slot: 'Shoes', title: 'Gold khussa', brand: 'Demo Soles', price: 4200, hex: '#C9A24A' },
    { slot: 'Bag', title: 'Ivory potli', brand: 'Demo Carry', price: 3100, hex: '#F6EFE0' },
    { slot: 'Jewellery', title: 'Gold jhumkay', brand: 'Demo Jewels', price: 2600, hex: '#C9A24A' },
  ] },
  { label: 'Fresh pick', occasion: 'Mehndi', items: [
    { slot: 'Outfit', title: 'Mustard angrakha', brand: 'Demo Loom', price: 9800, hex: '#D4A017' },
    { slot: 'Dupatta', title: 'Rust embroidered dupatta', brand: 'Demo Lawn House', price: 3400, hex: '#B4532A' },
    { slot: 'Shoes', title: 'Tan khussa', brand: 'Demo Soles', price: 3600, hex: '#D9C3A0' },
    { slot: 'Jewellery', title: 'Gold maang tikka', brand: 'Demo Jewels', price: 4100, hex: '#C9A24A' },
  ] },
  { label: 'Smart value', occasion: 'Office', items: [
    { slot: 'Outfit', title: 'Sage printed lawn 3-piece', brand: 'Demo Basics', price: 5400, hex: '#A3B18A' },
    { slot: 'Shoes', title: 'Beige flats', brand: 'Demo Soles', price: 3200, hex: '#D9C3A0' },
    { slot: 'Bag', title: 'Brown tote', brand: 'Demo Carry', price: 3800, hex: '#6D4C3A' },
    { slot: 'Jewellery', title: 'Gold studs', brand: 'Demo Jewels', price: 1600, hex: '#C9A24A' },
  ] },
  { label: 'Hijab-friendly', occasion: 'Walima', items: [
    { slot: 'Outfit', title: 'Plum velvet maxi', brand: 'Demo Heritage', price: 24500, hex: '#6B2D5C' },
    { slot: 'Scarf', title: 'Ivory chiffon scarf', brand: 'Demo Loom', price: 2100, hex: '#F6EFE0' },
    { slot: 'Shoes', title: 'Gold heels', brand: 'Demo Soles', price: 5800, hex: '#C9A24A' },
    { slot: 'Bag', title: 'Pearl clutch', brand: 'Demo Carry', price: 4300, hex: '#F6EFE0' },
  ] },
  { label: 'Also great', occasion: 'Baraat', items: [
    { slot: 'Outfit', title: 'Maroon organza 3-piece', brand: 'Demo Heritage', price: 31000, hex: '#6F1D2B' },
    { slot: 'Shoes', title: 'Gold embellished khussa', brand: 'Demo Soles', price: 6400, hex: '#C9A24A' },
    { slot: 'Bag', title: 'Gold potli', brand: 'Demo Carry', price: 4800, hex: '#C9A24A' },
    { slot: 'Jewellery', title: 'Gold necklace set', brand: 'Demo Jewels', price: 7900, hex: '#C9A24A' },
  ] },
];

function SampleCard({ look }: { look: SampleLook }) {
  const total = look.items.reduce((n, i) => n + i.price, 0);
  return (
    <li className="card w-[82vw] max-w-[340px] shrink-0 snap-center p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{look.label}</p>
        <p className="text-xs text-ink/70">{look.occasion}</p>
      </div>
      <p className="mt-1 font-display text-3xl font-semibold">{rupees(total)}</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-line" aria-hidden="true">
        {look.items.map((i, n) => <div key={i.slot} style={{ background: i.hex, flex: n === 0 ? 3 : 1 }} />)}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {look.items.map((i) => (
          <li key={i.slot} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink/70">{i.slot}</p>
              <p className="truncate text-sm font-medium">{i.title}</p>
              <p className="text-xs text-ink/70">{i.brand}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold">{rupees(i.price)}</p>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function SampleLooks() {
  return (
    <section className="relative z-10 bg-sand py-20 sm:py-28">
      <div className="page reveal">
        <p className="eyebrow">Sample looks</p>
        <h2 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-6xl">Complete looks, head to toe</h2>
        <p className="mt-4 max-w-lg text-ink/80">Every look is a full outfit priced in PKR. These are fictional samples, so swipe through.</p>
      </div>
      {/* tabIndex lets keyboard users scroll it with the arrow keys. */}
      <ul
        tabIndex={0}
        aria-label="Sample looks, scrolls sideways"
        className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 motion-reduce:scroll-auto sm:px-6 lg:px-[max(2rem,calc((100vw-80rem)/2+2rem))]"
      >
        {SAMPLE_LOOKS.map((l) => <SampleCard key={l.label} look={l} />)}
      </ul>
    </section>
  );
}

/* ---------------------------------------- Brands ---------------------------------------- */

export function ForBrands() {
  const points = ['New shoppers matched to your style', 'Attributed clicks to your own site', 'A monthly report', 'A free 90-day pilot'];
  return (
    <section className="relative z-10 bg-plum-dark py-20 text-white sm:py-28">
      <div className="page grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="reveal">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-light">For brands</p>
          <h2 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-6xl">Meet shoppers who already love your style</h2>
          <a href="mailto:partners@saleeqa.example" className="btn btn-light mt-8">Partner with us</a>
        </div>
        <ul className="reveal space-y-4">
          {points.map((p) => (
            <li key={p} className="border-b border-white/20 pb-4 font-display text-2xl">{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------- Privacy --------------------------------------- */

export function Privacy() {
  const points = [
    { t: 'Optional details', b: 'Height and body shape are yours to share or skip.' },
    { t: 'No photos needed', b: 'You can use every part of the stylist without uploading one.' },
    { t: 'Delete any time', b: 'Remove all your data with one tap in Account.' },
  ];
  return (
    <section className="relative z-10 bg-ivory py-16">
      <div className="page">
        <div className="hairline" />
        <ul className="grid gap-8 py-10 sm:grid-cols-3">
          {points.map((p) => (
            <li key={p.t} className="reveal">
              <h3 className="text-2xl font-semibold text-plum-dark">{p.t}</h3>
              <p className="mt-1 text-sm text-ink/80">{p.b}</p>
            </li>
          ))}
        </ul>
        <div className="hairline" />
      </div>
    </section>
  );
}

/* ---------------------------------------- Footer ---------------------------------------- */

export function Footer() {
  return (
    <footer className="relative z-10 bg-sand py-10">
      <div className="page flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <UrduName className="text-lg leading-[2] text-gold-deep" />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 text-sm text-ink/80">
          <Link href="/signup" className="flex min-h-[44px] items-center hover:text-ink">Get started</Link>
          <Link href="/login" className="flex min-h-[44px] items-center hover:text-ink">Sign in</Link>
          <Link href="/credits" className="flex min-h-[44px] items-center hover:text-ink">Photo credits</Link>
          <LiteToggle />
        </nav>
      </div>
      <p className="page mt-6 text-xs text-ink/70">Early preview: the sample looks on this page are demo data while we onboard brand partners.</p>
    </footer>
  );
}
