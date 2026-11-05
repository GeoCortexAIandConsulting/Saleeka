'use client';
import { useState } from 'react';

// The same five levels and wording as the quiz's coverage question (server/src/data/questions.ts).
const LEVELS = [
  { label: 'Relaxed', hint: 'Short sleeves and shorter lengths are fine', sleeve: 0.18, hem: 0.5, neck: 0.75, cover: 'none' },
  { label: 'Balanced', hint: 'Mostly covered, some sleeve or length variety', sleeve: 0.42, hem: 0.62, neck: 0.5, cover: 'none' },
  { label: 'Modest', hint: 'Sleeves to the elbow or longer, longer kameez', sleeve: 0.68, hem: 0.74, neck: 0.3, cover: 'dupatta' },
  { label: 'Very modest', hint: 'Full sleeves, long lengths, higher necklines', sleeve: 1, hem: 0.86, neck: 0.1, cover: 'dupatta' },
  { label: 'Fully covered', hint: 'Maximum coverage, with a matched scarf', sleeve: 1, hem: 1, neck: 0, cover: 'scarf' },
] as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A faceless drawn figure whose sleeve, hem, neckline and head covering follow the coverage level. */
function Figure({ level }: { level: (typeof LEVELS)[number] }) {
  const hemY = lerp(150, 270, level.hem);
  const hemX = lerp(36, 58, level.hem);
  const neckY = lerp(62, 78, level.neck);
  const neckX = lerp(9, 19, level.neck);
  const elbow = { x: 104 + 26 * Math.min(1, level.sleeve * 1.6), y: 74 + 62 * Math.min(1, level.sleeve * 1.6) };
  const wrist = { x: lerp(104, 134, level.sleeve), y: lerp(74, 190, level.sleeve) };
  const sleeveEnd = level.sleeve > 0.6 ? wrist : elbow;
  return (
    <svg viewBox="0 0 200 310" role="img" aria-label={`A figure wearing a ${level.label.toLowerCase()} outfit`} className="mx-auto h-72 w-auto sm:h-80">
      <defs>
        <linearGradient id="kameez" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7d3a6c" />
          <stop offset="1" stopColor="#4f1f44" />
        </linearGradient>
      </defs>
      {/* Skin tone is a plain mannequin ivory; there is no face. */}
      <g fill="#E9DCCB">
        <ellipse cx="100" cy="34" rx="17" ry="21" />
        <rect x="93" y="50" width="14" height="18" rx="6" />
        <path d="M78 74 L64 192 L72 194 L90 92 Z" />
        <path d="M122 74 L136 192 L128 194 L110 92 Z" />
        <path d="M86 150 L82 296 L98 296 L100 170 L102 296 L118 296 L114 150 Z" />
      </g>
      {/* Trousers */}
      <path d="M78 190 L72 292 L96 292 L100 214 L104 292 L128 292 L122 190 Z" fill="#F1E9DF" stroke="#E6DACB" />
      {/* Sleeves */}
      <g stroke="url(#kameez)" strokeWidth="17" strokeLinecap="round" fill="none" style={{ transition: 'all 500ms var(--ease-silk)' }}>
        <path d={`M112 76 L${sleeveEnd.x} ${sleeveEnd.y}`} />
        <path d={`M88 76 L${200 - sleeveEnd.x} ${sleeveEnd.y}`} />
      </g>
      {/* Kameez */}
      <path
        d={`M${100 - neckX} ${neckY - 12} Q100 ${neckY + 10} ${100 + neckX} ${neckY - 12} L122 70 L126 118 Q${100 + hemX - 6} ${hemY - 40} ${100 + hemX} ${hemY} L${100 - hemX} ${hemY} Q${100 - hemX + 6} ${hemY - 40} 74 118 L78 70 Z`}
        fill="url(#kameez)"
      />
      <path d={`M${100 - hemX} ${hemY - 6} L${100 + hemX} ${hemY - 6}`} stroke="#B8893B" strokeWidth="1.5" strokeDasharray="4 3" />
      {level.cover === 'dupatta' && <path d="M82 62 Q60 110 70 214 L92 208 Q84 120 104 66 Z" fill="#E2C07A" opacity="0.9" />}
      {level.cover === 'scarf' && <path d="M100 8 C74 8 74 44 76 58 C70 76 72 96 100 100 C128 96 130 76 124 58 C126 44 126 8 100 8 Z M100 20 C88 20 86 34 88 42 C90 52 110 52 112 42 C114 34 112 20 100 20 Z" fill="#F1E9DF" stroke="#D9C9B3" fillRule="evenodd" />}
    </svg>
  );
}

export default function ModestySlider() {
  const [value, setValue] = useState(3);
  const level = LEVELS[value];
  return (
    <div className="card grid items-center gap-4 p-6 sm:grid-cols-[1fr_1.1fr] sm:p-8">
      <Figure level={level} />
      <div>
        <p className="eyebrow">Your coverage</p>
        <p className="mt-1 font-display text-3xl font-semibold text-plum-dark" aria-live="polite">{level.label}</p>
        <p className="mt-1 min-h-[3rem] text-sm text-ink/75">{level.hint}</p>
        <label htmlFor="coverage" className="sr-only">Coverage level</label>
        <input
          id="coverage"
          type="range"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-valuetext={level.label}
          className="mt-4 h-11 w-full cursor-pointer accent-plum"
        />
        <div className="flex justify-between text-xs text-ink/70">
          <span>Relaxed</span>
          <span>Fully covered</span>
        </div>
      </div>
    </div>
  );
}
