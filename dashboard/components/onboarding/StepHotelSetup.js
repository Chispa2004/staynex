'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';

const inputClass = (isLight) => (
  isLight
    ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-300'
    : 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-300/30'
);

const labelClass = (isLight) => (
  isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'
);

export const StepHotelSetup = ({ hotel, onSaved }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setForm({
      name: hotel?.name || '',
      brand_name: hotel?.brand_name || '',
      timezone: hotel?.timezone || 'Europe/Madrid',
      default_language: hotel?.default_language || 'es',
      check_in_time: hotel?.check_in_time || '15:00',
      check_out_time: hotel?.check_out_time || '11:00',
      address: hotel?.address || '',
      phone: hotel?.phone || '',
      whatsapp_number: hotel?.whatsapp_number || '',
      description: hotel?.description || ''
    });
  }, [hotel]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/onboarding/hotel', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save hotel setup');
      }

      setMessage({ type: 'success', text: 'Hotel profile saved.' });
      onSaved?.(body.hotel);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExecutiveCard className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <ExecutiveBadge tone="emerald">Step 1</ExecutiveBadge>
          <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>Hotel setup</h2>
          <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>Define the hotel identity Staynex will use across WhatsApp, AI Concierge and dashboards.</p>
        </div>
        <Building2 className="h-6 w-6 text-emerald-400" />
      </div>

      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['name', 'Hotel name'],
            ['brand_name', 'Brand name'],
            ['timezone', 'Timezone'],
            ['default_language', 'Default language'],
            ['check_in_time', 'Check-in time'],
            ['check_out_time', 'Check-out time'],
            ['phone', 'Hotel phone'],
            ['whatsapp_number', 'WhatsApp number']
          ].map(([field, label]) => (
            <label key={field} className="space-y-2">
              <span className={labelClass(isLight)}>{label}</span>
              <input className={inputClass(isLight)} value={form[field] || ''} onChange={(event) => update(field, event.target.value)} />
            </label>
          ))}
        </div>

        <label className="space-y-2">
          <span className={labelClass(isLight)}>Address</span>
          <input className={inputClass(isLight)} value={form.address || ''} onChange={(event) => update('address', event.target.value)} />
        </label>

        <label className="space-y-2">
          <span className={labelClass(isLight)}>Short description</span>
          <textarea rows={3} className={inputClass(isLight)} value={form.description || ''} onChange={(event) => update('description', event.target.value)} />
        </label>

        {message ? (
          <p className={message.type === 'error' ? 'text-sm text-red-400' : 'text-sm text-emerald-500'}>{message.text}</p>
        ) : null}

        <button type="submit" disabled={saving} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
          {saving ? 'Saving...' : 'Save hotel setup'}
        </button>
      </form>
    </ExecutiveCard>
  );
};
