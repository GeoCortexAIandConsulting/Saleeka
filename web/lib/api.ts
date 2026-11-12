export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong');
  return data as T;
}

export const rupees = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;

/**
 * Where to go after signing in: `?next=` when it is a page on this site (a shared look), else the
 * default. The browser resolves it first, so tricks like "/\evil.com" or "/<tab>/evil.com" (which
 * browsers read as another website) are caught: only an address on this same site is followed.
 */
export function nextPath(fallback: string): string {
  return safeNext(new URLSearchParams(window.location.search).get('next'), window.location.origin) ?? fallback;
}

export function safeNext(next: string | null, origin: string): string | null {
  if (!next || !next.startsWith('/')) return null;
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

/**
 * Signs out, and forgets what this device kept for the player (a look in progress), so the next
 * person on a shared computer does not find it.
 */
export async function signOut() {
  await api('/auth/logout', { method: 'POST', body: {} });
  forgetDevice();
}

/** What this device kept for the player; also cleared when they delete their account. */
export function forgetDevice() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('saleeqa:studio:')) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing kept */
  }
}
