'use client';
import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { deviceSupports3D, LITE_EVENT, readLite } from './capability';

// three.js and the scenes stay out of the first download; they load only for visitors who get 3D.
const Scene3D = dynamic(() => import('./three/Scene3D'), { ssr: false });

/** If the 3D ever throws, the page quietly becomes the 2D version instead of breaking. */
class FallBackTo2D extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Everything renders as the 2D page first; capable devices upgrade to 3D once the hero is interactive. */
export default function LandingExperience({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    let idle = 0;
    const decide = () => {
      window.clearTimeout(idle);
      if (readLite() || !deviceSupports3D()) return setMode('2d');
      idle = window.setTimeout(() => setMode('3d'), 600);
    };
    const onLite = () => decide();
    window.addEventListener(LITE_EVENT, onLite);
    if (document.readyState === 'complete') decide();
    else window.addEventListener('load', decide, { once: true });
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener(LITE_EVENT, onLite);
      window.removeEventListener('load', decide);
    };
  }, []);

  return (
    <div data-mode={mode}>
      {mode === '3d' && (
        <FallBackTo2D onError={() => setMode('2d')}>
          <Scene3D />
        </FallBackTo2D>
      )}
      {children}
    </div>
  );
}
