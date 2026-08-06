'use client';

import { getSupabaseBrowser } from './supabase-browser';
import { getWorkspaceRequestHeaders } from './workspace-context';

export const getAuthHeaders = async ({ hotelId = null } = {}) => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const workspaceHeaders = getWorkspaceRequestHeaders({ hotelId });

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}`, ...workspaceHeaders }
    : workspaceHeaders;
};
