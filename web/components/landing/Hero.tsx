'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { UrduName } from '@/components/Logo';

/**
 * The opening spread: an editorial headline beside an arch (a jharokha window) showing the dupatta
 * film, with small cards from the game floating around it. The portrait cut of the film
 * (public/videos/hero-mobile.mp4) fits the arch; its poster paints first. The film only plays for
 * visitors who have not asked for reduced motion, and it can be paused.
 */
export default function Hero() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true; // React does not reliably set this as an attribute, and browsers need it to autoplay.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPaused(true);
      return;
    }
    v.play().catch(() => setPaused(true));
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      setPaused(false);
      v.play().catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <section className="relative overflow-hidden bg-ivory">
      <div className="grain" aria-hidden="true" />
      {/* The brand's name in calligraphy, as a watermark behind the spread */}
      <div className="pointer-events-none absolute -right-10 top-1/2 hidden -translate-y-1/2 select-none text-[22rem] leading-none text-gold/[0.07] lg:block" aria-hidden="true">
        <UrduName className="leading-[1.6]" />
      </div>

      <div className="page relative grid items-center gap-14 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pb-24 lg:pt-16">
        <div className="rise">
          <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-gold-deep">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            A styling game for Pakistani fashion
          </p>
          <h1 className="mt-5 text-[3.25rem] font-semibold leading-[0.95] tracking-tight text-ink sm:text-7xl xl:text-[5.6rem]">
            Style the look.
            <br />
            Walk the{' '}
            <span className="relative inline-block italic text-plum">
              Runway.
              <svg viewBox="0 0 220 18" className="absolute -bottom-2 left-0 w-full text-gold" aria-hidden="true" preserveAspectRatio="none">
                <path className="draw" d="M3 12 C 60 2, 150 2, 217 9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink/75">
            Pick a challenge, put a complete look together from real pieces by the brands you love, kurta to khussa,
            for her or for him, and share it on the Runway for everyone to see.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary !px-8 !py-4 text-base">Start styling, it’s free</Link>
            <a href="#try" className="btn btn-ghost !px-8 !py-4 text-base">Try a look first ↓</a>
          </div>
          <p className="mt-4 text-sm text-ink/75">
            Are you a brand?{' '}
            <Link href="/brand/apply" className="font-semibold text-plum underline-offset-4 hover:underline">
              Create a brand account →
            </Link>
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/65">
            {['Real pieces, real brands', 'Women’s and men’s looks', 'Prices in PKR', 'Modest-friendly'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-gold" aria-hidden="true">✦</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------- the arch, with the game around it ------------------------- */}
        <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[400px]">
          <div className="arch arch-frame relative aspect-[3/4] overflow-hidden bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/videos/hero-poster-mobile.jpg" alt="" width={540} height={720} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
            <video
              ref={video}
              src="/videos/hero-mobile.mp4"
              loop
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
              tabIndex={-1}
              onPlaying={() => setPlaying(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${playing ? 'opacity-100' : 'opacity-0'}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-plum-dark/35 via-transparent to-transparent" aria-hidden="true" />
            <button
              type="button"
              onClick={toggle}
              aria-label={paused ? 'Play the film' : 'Pause the film'}
              className="absolute bottom-4 left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-white/60 bg-night/30 text-white backdrop-blur-sm transition-colors hover:bg-night/55"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}
              </svg>
            </button>
          </div>

          {/* Floating cards: a challenge, a reaction, a look's total and a comment */}
          <div className="float absolute -left-6 top-[10%] rounded-2xl border border-line bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur sm:-left-14" aria-hidden="true">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-deep">Challenge</p>
            <p className="mt-0.5 flex items-center gap-2 font-display text-lg font-semibold leading-none">
              Mehndi
              <span className="flex gap-0.5">
                <span className="h-3 w-3 rounded-full bg-[#D4A017]" />
                <span className="h-3 w-3 rounded-full bg-[#0F7B5A]" />
              </span>
            </p>
          </div>
          <div className="float float-2 absolute -right-5 top-[36%] flex items-center gap-3 rounded-full border border-line bg-white/95 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur sm:-right-10" aria-hidden="true">
            <span>♥ 248</span>
            <span className="h-4 w-px bg-line" />
            <span>💬 31</span>
          </div>
          <div className="float float-3 absolute -left-6 bottom-[18%] w-40 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur sm:-left-16 sm:w-44" aria-hidden="true">
            <div className="flex h-2 gap-0.5">
              {['#D4A017', '#F3EBDD', '#C2562E', '#C9A24A', '#0F7B5A'].map((c) => <span key={c} className="flex-1 rounded-full" style={{ background: c }} />)}
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink/65">Look total</p>
            <p className="font-display text-xl font-semibold text-plum-dark">Rs. 23,500</p>
          </div>
          <div className="float float-2 absolute -right-5 bottom-[3%] max-w-[12rem] rounded-2xl rounded-br-sm bg-plum px-3.5 py-2.5 text-sm text-white shadow-lg sm:-right-12" aria-hidden="true">
            <span className="font-semibold">Sana</span> that khussa is everything ✨
          </div>
        </div>
      </div>
    </section>
  );
}
