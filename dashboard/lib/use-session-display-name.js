'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from './supabase-browser';
import { getUserDisplayName } from './user-presentation';

export const useSessionDisplayName = () => {
  const [name, setName] = useState(null);
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return undefined;
    let active = true;
    let authChanged = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (active) setName(getUserDisplayName(session?.user));
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !authChanged) setName(error ? null : getUserDisplayName(data?.session?.user));
    }).catch(() => {
      if (active && !authChanged) setName(null);
    });
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);
  return name;
};
