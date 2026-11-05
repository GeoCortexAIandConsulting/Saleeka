/** Decides whether a visitor gets the 3D experience or the 2D version of the same page. */
const LITE_KEY = 'saleeqa-lite-mode';
export const LITE_EVENT = 'saleeqa:lite-mode';

export function readLite(): boolean {
  try {
    return window.localStorage.getItem(LITE_KEY) === '1';
  } catch {
    return false; // Storage can be blocked (private windows); the page must work anyway.
  }
}

export function writeLite(on: boolean) {
  try {
    window.localStorage.setItem(LITE_KEY, on ? '1' : '0');
  } catch {
    // Not remembered this time, but the toggle still applies to this visit.
  }
  window.dispatchEvent(new CustomEvent(LITE_EVENT, { detail: on }));
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Whether this device should get 3D: not on Save-Data or low-end hardware, and only with WebGL. */
export function deviceSupports3D(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  return hasWebGL();
}
