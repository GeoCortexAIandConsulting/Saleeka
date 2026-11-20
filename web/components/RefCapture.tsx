'use client';
import { useEffect } from 'react';
import { rememberRef } from '@/lib/ref';

/** On every page: keeps a share link's invite (?ref=) until the visitor signs up. */
export default function RefCapture() {
  useEffect(rememberRef, []);
  return null;
}
