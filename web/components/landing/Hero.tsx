'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { UrduName } from '@/components/Logo';

/**
 * Full-viewport video hero. The files in public/videos were made from public/video_a.mp4 (20 s, 720p):
 * hero.mp4, hero-mobile.mp4 (a portrait crop), hero-poster.jpg and hero-poster-mobile.jpg.
 * TODO: swap in a 1080p master for hero.mp4 when one exists. If any file is missing, the gradient shows.
 *
 * The poster is a real <img> rather than the video's poster attribute: it paints first (it is the LCP
 * element), each screen size downloads only its own poster, and the video fades in over it once playing.
 * The video is started from code so that reduced-motion visitors never get it autoplaying.
 */
export default function Hero() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const small = window.matchMedia('(max-width: 767px)').matches || connection?.saveData;
    v.muted = true; // React does not reliably set this as an attribute, and browsers need it to autoplay.
    v.src = small ? '/videos/hero-mobile.mp4' : '/videos/hero.mp4';
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
    <section className="relative z-10 flex min-h-[calc(100svh-65px)] items-end overflow-hidden bg-gradient-to-br from-plum-dark via-plum to-night lg:items-center">
      <picture>
        <source media="(max-width: 767px)" srcSet="/videos/hero-poster-mobile.jpg" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/videos/hero-poster.jpg"
          alt=""
          width={1280}
          height={720}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </picture>
      {!failed && (
        <video
          ref={video}
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${playing ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {/* Plum fading to clear: up from the bottom on phones, in from the left on large screens. */}
      <div className="absolute inset-0 bg-gradient-to-t from-night from-30% via-night/70 via-55% to-transparent to-80% lg:bg-gradient-to-r lg:from-night/90 lg:from-0% lg:via-night/55 lg:via-45% lg:to-65%" aria-hidden="true" />

      <div className="page relative pb-20 pt-40 lg:py-24">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold-light">
            Saleeqa <span aria-hidden="true">·</span> <UrduName className="text-base leading-[2]" />
          </p>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.02] text-white sm:text-7xl">Your taste, styled head to toe.</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">
            An AI personal stylist for Pakistani women: complete looks, modest-friendly, priced in PKR.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-light">Find my style</Link>
            <Link href="/login" className="btn btn-outline-light">I have an account</Link>
          </div>
        </div>
      </div>

      <a href="#how" className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded text-[11px] uppercase tracking-[0.25em] text-white/85">
        Scroll
        <span className="scroll-cue block h-6 w-px bg-gold-light" aria-hidden="true" />
      </a>

      {!failed && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? 'Play background video' : 'Pause background video'}
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-night/50 text-white backdrop-blur-sm transition-colors hover:bg-night/75"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}
          </svg>
        </button>
      )}
    </section>
  );
}
