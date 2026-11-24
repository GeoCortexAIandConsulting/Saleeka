'use client';
import { useState, type InputHTMLAttributes } from 'react';

/** A password box with a Show / Hide button, so players can check what they typed. */
export default function PasswordInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative mt-1 block">
      <input {...props} type={shown ? 'text' : 'password'} className={`input pr-20 ${className}`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-1 my-auto h-10 rounded-xl px-3 text-sm font-medium text-plum hover:bg-plum/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-plum"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
