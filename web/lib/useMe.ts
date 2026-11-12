'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api';
import type { Me } from './types';

/** Loads the signed-in user, or sends the visitor to the login page. */
export function useRequireUser(opts: { needProfile?: boolean } = {}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>('/me')
      .then((m) => {
        if (opts.needProfile && !m.hasProfile) router.replace('/quiz');
        else setMe(m);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return me;
}

/** For pages anyone may open (a shared look): the user if signed in, null if not; `ready` once known. */
export function useMaybeUser() {
  const [state, setState] = useState<{ me: Me | null; ready: boolean }>({ me: null, ready: false });
  useEffect(() => {
    api<Me>('/me')
      .then((m) => setState({ me: m, ready: true }))
      .catch(() => setState({ me: null, ready: true }));
  }, []);
  return state;
}
