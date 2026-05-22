'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Power, Search, Trash2 } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

const SUGGESTED_CATEGORIES = [
  'desayuno',
  'wifi',
  'checkout',
  'piscina',
  'spa',
  'parking',
  'restaurante',
  'room_service',
  'late_checkout',
  'mascotas',
  'gimnasio',
  'transfer'
];

const emptyEntry = {
  title: '',
  key: '',
  category: '',
  value: '',
  is_active: true
};

const normalizeEntries = (entries) => entries.map((entry) => ({
  ...entry,
  draftTitle: entry.title || entry.key || '',
  draftKey: entry.key || '',
  draftCategory: entry.category || '',
  draftValue: entry.value || '',
  draftIsActive: entry.is_active ?? true,
  status: 'idle'
}));

export const KnowledgeBaseEditor = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [entries, setEntries] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [role, setRole] = useState('receptionist');
  const [canManageKnowledge, setCanManageKnowledge] = useState(false);
  const [operationalMode, setOperationalMode] = useState(false);
  const [newEntry, setNewEntry] = useState(emptyEntry);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const panelClass = isLight
    ? 'rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70'
    : 'rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10';
  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500'
    : 'w-full rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40';
  const mutedTextClass = isLight ? 'text-slate-600' : 'text-slate-500';
  const headingTextClass = isLight ? 'text-slate-950' : 'text-white';

  const loadEntries = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/knowledge', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load knowledge base');
      }

      if (!shouldAcceptTenantPayload(body, 'knowledge-base')) {
        return;
      }

      setHotel(body.hotel);
      setRole(body.role || 'receptionist');
      setCanManageKnowledge(Boolean(body.canManageKnowledge));
      setOperationalMode(Boolean(body.operationalMode || body.role === 'receptionist'));
      setEntries(normalizeEntries(body.entries || []));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = new Set(entries.map((entry) => entry.category).filter(Boolean));
    return ['all', ...Array.from(uniqueCategories).sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesCategory = categoryFilter === 'all' || entry.category === categoryFilter;
      const haystack = [
        entry.title,
        entry.key,
        entry.category,
        entry.value
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, entries, searchQuery]);

  const updateDraft = ({ id, field, value }) => {
    setEntries((current) => current.map((entry) => (
      entry.id === id ? { ...entry, [field]: value, status: 'idle' } : entry
    )));
  };

  const payloadFromEntry = (entry) => ({
    title: entry.draftTitle,
    key: entry.draftKey,
    category: entry.draftCategory,
    value: entry.draftValue,
    is_active: entry.draftIsActive
  });

  const saveEntry = async (entry) => {
    setSuccess(null);
    setError(null);
    setEntries((current) => current.map((item) => (
      item.id === entry.id ? { ...item, status: 'saving' } : item
    )));

    try {
      const response = await fetch(`/api/knowledge/${entry.id}`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadFromEntry(entry))
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save entry');
      }

      setEntries((current) => current.map((item) => (
        item.id === entry.id
          ? { ...normalizeEntries([body.entry])[0], status: 'saved' }
          : item
      )));
      setSuccess(t('knowledge.savedEntry'));
    } catch (caughtError) {
      setError(caughtError.message);
      setEntries((current) => current.map((item) => (
        item.id === entry.id ? { ...item, status: 'idle' } : item
      )));
    }
  };

  const createEntry = async (event) => {
    event.preventDefault();
    setCreating(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newEntry)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create entry');
      }

      setEntries((current) => [
        ...current,
        ...normalizeEntries([body.entry])
      ].sort((a, b) => a.key.localeCompare(b.key)));
      setNewEntry(emptyEntry);
      setSuccess(t('knowledge.addedEntry'));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleEntry = async (entry) => {
    const nextEntry = {
      ...entry,
      draftIsActive: !entry.draftIsActive
    };
    updateDraft({ id: entry.id, field: 'draftIsActive', value: nextEntry.draftIsActive });
    await saveEntry(nextEntry);
  };

  const deleteEntry = async (entry) => {
    setSuccess(null);
    setError(null);
    setEntries((current) => current.map((item) => (
      item.id === entry.id ? { ...item, status: 'saving' } : item
    )));

    try {
      const response = await fetch(`/api/knowledge/${entry.id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete entry');
      }

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setSuccess(t('knowledge.deletedEntry'));
    } catch (caughtError) {
      setError(caughtError.message);
      setEntries((current) => current.map((item) => (
        item.id === entry.id ? { ...item, status: 'idle' } : item
      )));
    }
  };

  return (
    <div className="space-y-6">
      <div className={panelClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-sm font-semibold ${headingTextClass}`}>
              {operationalMode ? 'Operational Knowledge Base' : t('knowledge.demoHotel')}
            </p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>
              {hotel?.name || t('knowledge.loadingHotel')}
            </p>
            {operationalMode ? (
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Reception can keep everyday guest information updated here: opening hours, taxis, services, FAQs and temporary operational notes.
              </p>
            ) : null}
          </div>
          {loading ? (
            <span className={`inline-flex items-center gap-2 text-sm ${mutedTextClass}`}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('knowledge.loading')}
            </span>
          ) : null}
        </div>
      </div>

      <div className={panelClass}>
        <p className={`text-sm font-semibold ${headingTextClass}`}>{t('knowledge.usefulCategories')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setNewEntry((current) => ({
                ...current,
                key: current.key || category,
                category,
                title: current.title || category
              }))}
              className={isLight
                ? 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50'
                : 'rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-300/20 hover:bg-white/[0.08] hover:text-white'}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className={panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search knowledge"
              className={`${inputClass} pl-9`}
            />
          </label>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={inputClass}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === 'all' ? 'All categories' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
          {error}
        </div>
      ) : null}

      {success ? (
        <div className={isLight ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100'}>
          {success}
        </div>
      ) : null}

      {canManageKnowledge ? (
      <form onSubmit={createEntry} className={panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <input
            value={newEntry.title}
            onChange={(event) => setNewEntry((current) => ({ ...current, title: event.target.value }))}
            placeholder="Title"
            className={inputClass}
          />
          <input
            value={newEntry.key}
            onChange={(event) => setNewEntry((current) => ({ ...current, key: event.target.value }))}
            placeholder={t('knowledge.key')}
            className={inputClass}
          />
          <input
            value={newEntry.category}
            onChange={(event) => setNewEntry((current) => ({ ...current, category: event.target.value }))}
            placeholder="Category"
            className={inputClass}
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <textarea
            value={newEntry.value}
            onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))}
            placeholder={t('knowledge.value')}
            rows={3}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={creating || !newEntry.key.trim() || !newEntry.value.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {t('buttons.add')}
          </button>
        </div>
      </form>
      ) : (
        <div className={panelClass}>
          <p className={`text-sm font-semibold ${headingTextClass}`}>View only</p>
          <p className={`mt-1 text-sm ${mutedTextClass}`}>You can search and read hotel knowledge, but only admins can edit this workspace.</p>
        </div>
      )}

      <div className="grid gap-3">
        {filteredEntries.map((entry) => (
          <div key={entry.id} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60 transition hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10 transition hover:bg-white/[0.05]'}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={entry.draftIsActive
                ? isLight
                  ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800'
                  : 'rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100'
                : isLight
                  ? 'rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'
                  : 'rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-400'}
              >
                {entry.draftIsActive ? 'Active' : 'Inactive'}
              </span>
              {entry.status === 'saved' ? (
                <p className={isLight ? 'text-xs text-emerald-700' : 'text-xs text-emerald-300'}>{t('knowledge.saved')}</p>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px] lg:items-start">
              <input
                value={entry.draftTitle}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftTitle', value: event.target.value })}
                disabled={!canManageKnowledge}
                className={inputClass}
              />
              <input
                value={entry.draftKey}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftKey', value: event.target.value })}
                disabled={!canManageKnowledge}
                className={inputClass}
              />
              <input
                value={entry.draftCategory}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftCategory', value: event.target.value })}
                disabled={!canManageKnowledge}
                className={inputClass}
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-start">
              <textarea
                value={entry.draftValue}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftValue', value: event.target.value })}
                rows={3}
                disabled={!canManageKnowledge}
                className={inputClass}
              />
              <button
                type="button"
                disabled={entry.status === 'saving'}
                onClick={() => saveEntry(entry)}
                hidden={!canManageKnowledge}
                className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60'}
              >
                {entry.status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {t('buttons.save')}
              </button>
              <button
                type="button"
                disabled={entry.status === 'saving'}
                onClick={() => toggleEntry(entry)}
                hidden={!canManageKnowledge}
                className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60'}
              >
                <Power className="h-4 w-4" aria-hidden="true" />
                {entry.draftIsActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                disabled={entry.status === 'saving'}
                onClick={() => deleteEntry(entry)}
                hidden={!canManageKnowledge}
                className={isLight ? 'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60' : 'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60'}
                title={t('buttons.delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('buttons.delete')}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
