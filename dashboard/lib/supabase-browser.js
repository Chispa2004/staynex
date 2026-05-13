'use client';

import { createClient } from '@supabase/supabase-js';

let supabaseBrowser;

export const getSupabaseBrowser = () => {
  if (supabaseBrowser) {
    return supabaseBrowser;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Realtime error', {
      reason: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    });
    return null;
  }

  supabaseBrowser = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  return supabaseBrowser;
};
