'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from './supabase-browser';
import { getActiveWorkspace, getWorkspaceRevision, assertWorkspaceRevision, persistWorkspaceSelection } from './workspace-context';

// One entry attempt owns selection. Abort/replacement/unmount must never apply
// an older support response, even if its transport ignores cancellation.
export const useSupportWorkspaceEntry = ({ onError, onStart = () => {} }) => {
  const router = useRouter();
  const attempt = useRef(null);
  const [pendingHotelId, setPendingHotelId] = useState(null);
  useEffect(() => () => { attempt.current?.abort(); attempt.current = null; }, []);
  const enterWorkspace = async hotelId => {
    if (attempt.current?.hotelId === hotelId) return;
    attempt.current?.abort();
    const controller = new AbortController();
    controller.hotelId = hotelId;
    attempt.current = controller;
    const revision = getWorkspaceRevision();
    const initialSelection = getActiveWorkspace().hotelId;
    setPendingHotelId(hotelId);
    onError(null); onStart();
    let timeout;
    try {
      const body = await Promise.race([
        (async () => {
          const client = getSupabaseBrowser();
          const { data } = client ? await client.auth.getSession() : { data: {} };
          if (controller.signal.aborted) throw new Error('Cancelled');
          const response = await fetch(`/api/platform/hotels/${hotelId}/support`, {
            method: 'POST', cache: 'no-store', signal: controller.signal,
            headers: data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}
          });
          const result = await response.json();
          if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired. Sign in again.' : response.status === 403 ? 'You do not have permission to enter this workspace.' : 'Could not enter hotel workspace. Please retry.');
          return result;
        })(),
        new Promise((_, reject) => { timeout = window.setTimeout(() => {
          controller.abort(); reject(new Error('Workspace entry timed out. Please retry.'));
        }, 15000); })
      ]);
      if (attempt.current !== controller || controller.signal.aborted) return;
      assertWorkspaceRevision(revision);
      if (getActiveWorkspace().hotelId !== initialSelection) throw new Error('Could not verify the selected workspace. Please retry.');
      if (!body.ok || body.hotel?.id !== hotelId || body.supportSession?.hotelId !== hotelId || body.supportSession.readonly !== true) {
        throw new Error('Could not verify the selected workspace. Please retry.');
      }
      window.sessionStorage.setItem('staynex_support_session', JSON.stringify(body.supportSession));
      persistWorkspaceSelection({ hotelId, workspace: { hotel: body.hotel, role: 'support', supportSession: body.supportSession }, notify: true });
      router.push(`/dashboard?hotelId=${encodeURIComponent(hotelId)}`);
    } catch (error) {
      if (attempt.current === controller) onError(error.message);
    } finally {
      window.clearTimeout(timeout);
      if (attempt.current === controller) { attempt.current = null; setPendingHotelId(null); }
    }
  };
  return { enterWorkspace, pendingHotelId };
};
