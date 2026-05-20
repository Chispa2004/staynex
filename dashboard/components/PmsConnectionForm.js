'use client';

import { X } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const PmsConnectionForm = ({
  provider,
  initialConnection,
  form,
  setForm,
  onSave,
  onClose,
  saving
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!provider) {
    return null;
  }

  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300'
    : 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/30';
  const labelClass = isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <form onSubmit={onSave} className={isLight ? 'w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/40' : 'w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1019] p-6 shadow-2xl shadow-black/40'}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>{initialConnection ? 'Edit' : 'Connect'} {provider.name}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              Secrets are encrypted before they are stored.
            </p>
          </div>
          <button type="button" onClick={onClose} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:bg-white/[0.08]'}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className={labelClass}>Provider</span>
            <input className={inputClass} value={provider.name} disabled />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Base URL</span>
            <input
              className={inputClass}
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder={provider.defaultBaseUrl || 'https://api.provider.example'}
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Client ID</span>
            <input
              className={inputClass}
              value={form.client_id}
              onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}
              placeholder={`${provider.name} client id`}
              required
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Account Code</span>
            <input
              className={inputClass}
              value={form.account_code}
              onChange={(event) => setForm((current) => ({ ...current, account_code: event.target.value }))}
              placeholder={`${provider.name} account code`}
              required
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className={labelClass}>Client Secret</span>
            <input
              type="password"
              className={inputClass}
              value={form.client_secret}
              onChange={(event) => setForm((current) => ({ ...current, client_secret: event.target.value }))}
              placeholder={initialConnection?.has_client_secret ? 'Leave blank to keep existing secret' : `${provider.name} client secret`}
              required={!initialConnection?.has_client_secret}
            />
          </label>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-500"
            />
            <span className={isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-300'}>Enable this integration</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={isLight ? 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};
