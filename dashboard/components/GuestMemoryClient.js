'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Check, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { PremiumEmptyState } from './PremiumEmptyState';
import { cn, ui } from '@/lib/ui/styles';

const memoryTypes = [
  'all',
  'preference',
  'personal_context',
  'dietary',
  'stay_preference',
  'upsell_interest',
  'language',
  'room_preference'
];

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatConfidence = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${Math.round(numberValue * 100)}%` : '-';
};

export const GuestMemoryClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [memories, setMemories] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cardClass = cn('rounded-xl border transition duration-200', ui.surface(isLight));
  const inputClass = ui.input(isLight);

  const getAuthHeaders = async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

    return data?.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  };

  const loadMemories = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/guest-memory', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load guest memory');
      }

      setMemories((body.memories || []).map((item) => ({
        ...item,
        draftValue: item.memory_value,
        status: 'idle'
      })));
      setHotel(body.hotel || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemories();
  }, []);

  const filteredMemories = useMemo(() => {
    const query = search.trim().toLowerCase();

    return memories.filter((memory) => {
      const matchesType = typeFilter === 'all' || memory.memory_type === typeFilter;
      const haystack = [
        memory.memory_key,
        memory.memory_value,
        memory.memory_type,
        memory.guest?.phone_number,
        memory.guest?.current_room
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesType && (!query || haystack.includes(query));
    });
  }, [memories, search, typeFilter]);

  const updateMemory = async (memory, updates = {}) => {
    setMemories((current) => current.map((item) => (
      item.id === memory.id ? { ...item, status: 'saving' } : item
    )));

    try {
      const response = await fetch('/api/guest-memory', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: memory.id,
          memory_value: memory.draftValue,
          ...updates
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save memory');
      }

      setMemories((current) => current.map((item) => (
        item.id === memory.id
          ? { ...item, ...body.memory, draftValue: body.memory.memory_value, status: 'saved' }
          : item
      )));
    } catch (caughtError) {
      setError(caughtError.message);
      setMemories((current) => current.map((item) => (
        item.id === memory.id ? { ...item, status: 'idle' } : item
      )));
    }
  };

  const deleteMemory = async (memory) => {
    try {
      const response = await fetch('/api/guest-memory', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: memory.id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete memory');
      }

      setMemories((current) => current.filter((item) => item.id !== memory.id));
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <section className={`${cardClass} p-4`}>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Hotel</p>
          <p className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>{hotel?.name || 'Current hotel'}</p>
        </section>
        <section className={`${cardClass} p-4`}>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Memories</p>
          <p className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>{memories.length}</p>
        </section>
        <section className={`${cardClass} p-4`}>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Active</p>
          <p className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>{memories.filter((item) => item.is_active).length}</p>
        </section>
      </div>

      <section className={`${cardClass} p-4`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <label className="relative">
            <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, room or memory"
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
            {memoryTypes.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All memory types' : type}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadMemories}
            className={ui.button(isLight, 'secondary')}
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
          {error}
        </div>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className={isLight ? 'border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900' : 'border-b border-white/10 px-4 py-3 text-sm font-semibold text-white'}>
          {loading ? 'Loading guest memory...' : `${filteredMemories.length} memories`}
        </div>

        <div className="divide-y divide-slate-200/10">
          {filteredMemories.map((memory) => (
            <article key={memory.id} className={isLight ? 'grid gap-4 p-4 hover:bg-slate-50 xl:grid-cols-[0.9fr_1fr_1fr_0.7fr]' : 'grid gap-4 p-4 hover:bg-white/[0.035] xl:grid-cols-[0.9fr_1fr_1fr_0.7fr]'}>
              <div>
                <div className="flex items-center gap-2">
                  <span className={isLight ? 'rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800' : 'rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-100'}>
                    <BrainCircuit className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    {memory.memory_type}
                  </span>
                  <span className={memory.is_active ? 'rounded-full bg-emerald-300 px-2 py-1 text-xs font-bold text-slate-950' : 'rounded-full bg-slate-300 px-2 py-1 text-xs font-bold text-slate-800'}>
                    {memory.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className={isLight ? 'mt-3 text-sm font-semibold text-slate-950' : 'mt-3 text-sm font-semibold text-white'}>{memory.memory_key}</p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>{formatDate(memory.updated_at)}</p>
              </div>

              <div>
                <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>Guest</p>
                <p className={isLight ? 'mt-2 text-sm font-medium text-slate-800' : 'mt-2 text-sm font-medium text-slate-200'}>{memory.guest?.phone_number || '-'}</p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>Room {memory.guest?.current_room || '-'}</p>
              </div>

              <div>
                <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>Value</p>
                <input
                  value={memory.draftValue}
                  onChange={(event) => setMemories((current) => current.map((item) => (
                    item.id === memory.id ? { ...item, draftValue: event.target.value, status: 'idle' } : item
                  )))}
                  className={`${inputClass} mt-2 w-full`}
                />
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>Confidence {formatConfidence(memory.confidence)}</p>
              </div>

              <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                {memory.guest_id ? (
                  <Link
                    href={`/dashboard/guest-memory/${memory.guest_id}`}
                    className={isLight ? 'rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100' : 'rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-400/15'}
                  >
                    AI Profile
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={memory.status === 'saving'}
                  onClick={() => updateMemory(memory)}
                  className={isLight ? 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60' : 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] disabled:opacity-60'}
                  title="Save"
                >
                  {memory.status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  disabled={memory.status === 'saving'}
                  onClick={() => updateMemory(memory, { is_active: !memory.is_active })}
                  className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60' : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-60'}
                >
                  {memory.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMemory(memory)}
                  className={isLight ? 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}

          {!loading && filteredMemories.length === 0 ? (
            <PremiumEmptyState
              icon={BrainCircuit}
              title="No guest memory yet"
              description="Guest preferences, interests and useful service context will appear here as conversations and stays accumulate."
              className="m-4"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
};
