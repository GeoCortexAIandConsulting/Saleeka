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
