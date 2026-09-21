'use client';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';
const plans = ['starter','professional','enterprise','enterprise_demo','pro_demo'];
const languages = ['es','en','fr','de'];
const initialForm = {
  name: '',
  brand_name: '',
  slug: '',
  country_code: '',
  city: '',
  timezone: '',
  default_language: 'es',
  whatsapp_number: '',
  support_email: '',
  brand_color: '#34d399',
  subscription_plan: 'starter',
  admin_email: ''
};

export const CreateHotelForm = ({ isLight, saving, onSubmit, onCancel, organizations: suppliedOrganizations, organizationId = '' }) => {
  const { tx } = useDashboardLanguage();
  const [form, setForm] = useState({ ...initialForm, organization_id: organizationId });

  const [organizations, setOrganizations] = useState(suppliedOrganizations || []);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (suppliedOrganizations) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await getSupabaseBrowser().auth.getSession();
        const response = await fetch('/api/organizations?platform=1', { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` }, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (alive) setOrganizations(body.organizations || []);
      } catch (error) { if (alive) setLoadError(error.message); }
    })();
    return () => { alive = false; };
  }, [suppliedOrganizations]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className={cn('rounded-xl border p-5', ui.surface(isLight))}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx('Create workspace')}</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{tx('New hotel tenant')}</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>El alta crea el hotel y el acceso de dirección. Una cuenta verificada se incorpora; las demás aceptan la invitación al iniciar sesión. No activa conexiones ni envíos.</p>
        </div>
        <button type="button" onClick={onCancel} className={ui.button(isLight, 'ghost')}>{tx('Cancel')}</button>
      </div>

      {loadError && <p role="alert">{loadError}</p>}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5"><span className={ui.text.eyebrow(isLight)}>Organización cliente</span>
          <select required className={cn('w-full', ui.input(isLight))} value={form.organization_id} onChange={event => update('organization_id', event.target.value)} disabled={Boolean(organizationId)}>
            <option value="">Selecciona una organización</option>
            {organizations.filter(o => o.status === 'active').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Hotel name')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Brand name')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_name} onChange={(event) => update('brand_name', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Workspace slug')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.slug} onChange={(event) => update('slug', event.target.value)} placeholder="hotel-costa-azul" />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Dirección del hotel · correo de la cuenta</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.admin_email} onChange={(event) => update('admin_email', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Country code')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.country_code} onChange={(event) => update('country_code', event.target.value)} maxLength={2} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('City')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.city} onChange={(event) => update('city', event.target.value)} required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Timezone')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.timezone} onChange={(event) => update('timezone', event.target.value)} placeholder="Europe/Madrid" required />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Language')}</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.default_language} onChange={(event) => update('default_language', event.target.value)}>
            {languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Support email')}</span>
          <input className={cn('w-full', ui.input(isLight))} type="email" value={form.support_email} onChange={(event) => update('support_email', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Brand color')}</span>
          <input className={cn('w-full', ui.input(isLight))} value={form.brand_color} onChange={(event) => update('brand_color', event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>{tx('Subscription plan')}</span>
          <select className={cn('w-full', ui.input(isLight))} value={form.subscription_plan} onChange={(event) => update('subscription_plan', event.target.value)}>
            {plans.map((plan) => <option key={plan} value={plan}>{plan.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={saving || !form.organization_id} className={ui.button(isLight, 'primary')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tx(saving ? 'Creating...' : 'Create Hotel Workspace')}
        </button>
      </div>
    </form>
  );
};
