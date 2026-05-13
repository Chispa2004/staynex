'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const SUGGESTED_KEYS = [
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

const inputClass = 'w-full rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40';

const normalizeEntries = (entries) => entries.map((entry) => ({
  ...entry,
  draftKey: entry.key,
  draftValue: entry.value,
  status: 'idle'
}));

export const KnowledgeBaseEditor = () => {
  const { t } = useDashboardLanguage();
  const [entries, setEntries] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [newEntry, setNewEntry] = useState({ key: '', value: '' });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/knowledge');
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load knowledge base');
      }

      setHotel(body.hotel);
      setEntries(normalizeEntries(body.entries));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const updateDraft = ({ id, field, value }) => {
    setEntries((current) => current.map((entry) => (
      entry.id === id ? { ...entry, [field]: value, status: 'idle' } : entry
    )));
  };

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: entry.draftKey,
          value: entry.draftValue
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save entry');
      }

      setEntries((current) => current.map((item) => (
        item.id === entry.id
          ? { ...body.entry, draftKey: body.entry.key, draftValue: body.entry.value, status: 'saved' }
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
      setNewEntry({ key: '', value: '' });
      setSuccess(t('knowledge.addedEntry'));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteEntry = async (entry) => {
    setSuccess(null);
    setError(null);
    setEntries((current) => current.map((item) => (
      item.id === entry.id ? { ...item, status: 'saving' } : item
    )));

    try {
      const response = await fetch(`/api/knowledge/${entry.id}`, {
        method: 'DELETE'
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
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{t('knowledge.demoHotel')}</p>
            <p className="text-sm text-slate-500">{hotel?.name || t('knowledge.loadingHotel')}</p>
          </div>
          {loading ? (
            <span className="inline-flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('knowledge.loading')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
        <p className="text-sm font-semibold text-white">{t('knowledge.usefulCategories')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setNewEntry((current) => ({ ...current, key }))}
              className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-300/20 hover:bg-white/[0.08] hover:text-white"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <form onSubmit={createEntry} className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/15">
        <div className="grid gap-3 lg:grid-cols-[240px_1fr_auto] lg:items-start">
          <input
            value={newEntry.key}
            onChange={(event) => setNewEntry((current) => ({ ...current, key: event.target.value }))}
            placeholder={t('knowledge.key')}
            className={inputClass}
          />
          <textarea
            value={newEntry.value}
            onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))}
            placeholder={t('knowledge.value')}
            rows={2}
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

      <div className="grid gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10 transition hover:bg-white/[0.05]">
            <div className="grid gap-3 lg:grid-cols-[240px_1fr_auto_auto] lg:items-start">
              <input
                value={entry.draftKey}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftKey', value: event.target.value })}
                className={inputClass}
              />
              <textarea
                value={entry.draftValue}
                onChange={(event) => updateDraft({ id: entry.id, field: 'draftValue', value: event.target.value })}
                rows={2}
                className={inputClass}
              />
              <button
                type="button"
                disabled={entry.status === 'saving'}
                onClick={() => saveEntry(entry)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
              >
                {entry.status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {t('buttons.save')}
              </button>
              <button
                type="button"
                disabled={entry.status === 'saving'}
                onClick={() => deleteEntry(entry)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
                title={t('buttons.delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('buttons.delete')}</span>
              </button>
            </div>
            {entry.status === 'saved' ? (
              <p className="mt-2 text-xs text-emerald-300">{t('knowledge.saved')}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
