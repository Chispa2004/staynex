'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, Sparkles } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const categories = ['culture', 'adventure', 'wellness', 'restaurant', 'romantic', 'family', 'luxury', 'transfer', 'tour'];
const audienceOptions = ['family', 'couples', 'vip', 'culture', 'adventure', 'wellness'];

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const initialExperienceForm = {
  providerId: '',
  title: '',
  category: 'culture',
  short_description: '',
  description: '',
  price: '',
  commission_percent: '',
  currency: 'EUR',
  destination_city: '',
  duration: '',
  tags: '',
  audience_tags: 'couples,culture'
};

const normalizeTags = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const formatCurrency = (value, currency = 'EUR') => {
  if (value === null || value === undefined || value === '') return 'No price';
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
};

const ProviderBadge = ({ children, tone = 'emerald', isLight }) => (
  <span className={ui.badge(isLight, tone, true)}>{children}</span>
);

const ProviderExperienceCard = ({ hotelId, experience, isLight, onUpdated, onError }) => {
  const [draft, setDraft] = useState({
    title: experience.title || '',
    category: experience.category || 'tour',
    short_description: experience.short_description || '',
    description: experience.description || '',
    price: experience.price ?? '',
    commission_percent: experience.commission_percent ?? '',
    currency: experience.currency || 'EUR',
    destination_city: experience.destination_city || '',
    duration: experience.duration || '',
    tags: (experience.tags || []).join(', '),
    audience_tags: (experience.audience_tags || []).join(', '),
    active: experience.active !== false
  });
  const [saving, setSaving] = useState(false);

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    onError(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'update_experience',
          experienceId: experience.id,
          ...draft,
          tags: normalizeTags(draft.tags),
          audience_tags: normalizeTags(draft.audience_tags)
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update provider experience');
      }

      onUpdated();
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', ui.text.title(isLight))}>{experience.title}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
            {experience.destination_city || 'Any city'} / {formatCurrency(experience.price, experience.currency)}
          </p>
        </div>
        <ProviderBadge isLight={isLight} tone={experience.active ? 'emerald' : 'slate'}>
          {experience.active ? 'Active' : 'Disabled'}
        </ProviderBadge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input className={cn('w-full', ui.input(isLight))} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
        <select className={cn('w-full', ui.input(isLight))} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)}>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <input className={cn('w-full', ui.input(isLight))} placeholder="Destination city" value={draft.destination_city} onChange={(event) => updateDraft('destination_city', event.target.value)} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Duration" value={draft.duration} onChange={(event) => updateDraft('duration', event.target.value)} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Price" value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Commission %" value={draft.commission_percent} onChange={(event) => updateDraft('commission_percent', event.target.value)} />
        <input className={cn('w-full md:col-span-2', ui.input(isLight))} placeholder="Tags, comma separated" value={draft.tags} onChange={(event) => updateDraft('tags', event.target.value)} />
        <input className={cn('w-full md:col-span-2', ui.input(isLight))} placeholder="Audience tags" value={draft.audience_tags} onChange={(event) => updateDraft('audience_tags', event.target.value)} />
        <textarea className={cn('min-h-20 w-full md:col-span-2', ui.input(isLight))} placeholder="Short description" value={draft.short_description} onChange={(event) => updateDraft('short_description', event.target.value)} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className={cn('inline-flex items-center gap-2 text-sm', ui.text.body(isLight))}>
          <input type="checkbox" checked={draft.active} onChange={(event) => updateDraft('active', event.target.checked)} />
          Active for AI recommendations
        </label>
        <button type="button" onClick={save} disabled={saving} className={ui.button(isLight, 'secondary')}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </article>
  );
};

export const ExperienceProvidersPanel = ({ hotelId }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [state, setState] = useState({ providers: [], assignments: [], experiences: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({ providerId: '', leadEmail: '', priority: 100, active: true });
  const [experienceForm, setExperienceForm] = useState(initialExperienceForm);

  const assignedProviderIds = useMemo(
    () => new Set((state.assignments || []).map((assignment) => assignment.provider_id)),
    [state.assignments]
  );
  const availableProviders = (state.providers || []).filter((provider) => !assignedProviderIds.has(provider.id));
  const activeAssignments = state.assignments || [];

  const loadProviders = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load experience providers');
      }

      setState(body);
      const firstProviderId = body.assignments?.[0]?.provider_id || body.providers?.[0]?.id || '';
      setAssignmentForm((current) => ({
        ...current,
        providerId: current.providerId || firstProviderId
      }));
      setExperienceForm((current) => ({
        ...current,
        providerId: current.providerId || body.assignments?.[0]?.provider_id || firstProviderId
      }));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, [hotelId]);

  const assignProvider = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'assign_provider',
          providerId: assignmentForm.providerId,
          leadEmail: assignmentForm.leadEmail,
          priority: assignmentForm.priority,
          active: assignmentForm.active
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not assign provider');
      }

      setNotice('Experience provider connected to this hotel.');
      await loadProviders({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAssignment = async (assignment, updates = {}) => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'update_assignment',
          assignmentId: assignment.id,
          active: updates.active ?? assignment.active,
          priority: updates.priority ?? assignment.priority,
          leadEmail: updates.leadEmail ?? assignment.lead_email,
          notes: updates.notes ?? assignment.notes
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update provider assignment');
      }

      setNotice('Provider assignment updated.');
      await loadProviders({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const createExperience = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'create_experience',
          ...experienceForm,
          tags: normalizeTags(experienceForm.tags),
          audience_tags: normalizeTags(experienceForm.audience_tags)
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create provider experience');
      }

      setNotice('Provider experience added.');
      setExperienceForm((current) => ({
        ...initialExperienceForm,
        providerId: current.providerId
      }));
      await loadProviders({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Experience Providers</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Luxotour Morocco and provider catalogs</h2>
          <p className={cn('mt-1 max-w-3xl text-sm', ui.text.body(isLight))}>
            Platform-managed providers can be connected to a hotel. The concierge AI prioritizes active provider excursions before hotel experiences and local knowledge.
          </p>
        </div>
        <button type="button" onClick={() => loadProviders()} className={ui.button(isLight, 'secondary')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>{error}</div> : null}
      {notice ? <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>{notice}</div> : null}

      {state.missingTable ? (
        <div className={cn('mt-4 rounded-xl border border-dashed p-5 text-sm', isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
          Run <code>supabase/sql/create_experience_providers.sql</code> to enable provider management.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <form onSubmit={assignProvider} className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
            <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Connect provider to hotel</p>
            <div className="mt-4 grid gap-3">
              <select
                className={cn('w-full', ui.input(isLight))}
                value={assignmentForm.providerId}
                onChange={(event) => setAssignmentForm((current) => ({ ...current, providerId: event.target.value }))}
              >
                {(availableProviders.length ? availableProviders : state.providers || []).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
              <input
                className={cn('w-full', ui.input(isLight))}
                placeholder="Lead email, e.g. reservas@luxotour.com"
                value={assignmentForm.leadEmail}
                onChange={(event) => setAssignmentForm((current) => ({ ...current, leadEmail: event.target.value }))}
              />
              <input
                className={cn('w-full', ui.input(isLight))}
                placeholder="Priority"
                value={assignmentForm.priority}
                onChange={(event) => setAssignmentForm((current) => ({ ...current, priority: event.target.value }))}
              />
              <label className={cn('inline-flex items-center gap-2 text-sm', ui.text.body(isLight))}>
                <input type="checkbox" checked={assignmentForm.active} onChange={(event) => setAssignmentForm((current) => ({ ...current, active: event.target.checked }))} />
                Active
              </label>
              <button type="submit" disabled={saving || !assignmentForm.providerId} className={ui.button(isLight, 'primary')}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Connect provider
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {activeAssignments.map((assignment) => (
              <article key={assignment.id} className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{assignment.provider?.name || 'Provider'}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{assignment.lead_email || assignment.provider?.contact_email || 'No lead email'}</p>
                  </div>
                  <ProviderBadge isLight={isLight} tone={assignment.active ? 'emerald' : 'slate'}>
                    {assignment.active ? 'Active' : 'Disabled'}
                  </ProviderBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => updateAssignment(assignment, { active: !assignment.active })} className={ui.button(isLight, 'secondary')}>
                    {assignment.active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </article>
            ))}
            {!activeAssignments.length ? (
              <div className={cn('rounded-xl border border-dashed p-5 text-sm', isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
                No provider connected yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={createExperience} className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
            <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Add provider excursion</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select className={cn('w-full', ui.input(isLight))} value={experienceForm.providerId} onChange={(event) => setExperienceForm((current) => ({ ...current, providerId: event.target.value }))}>
                {(state.providers || []).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select>
              <select className={cn('w-full', ui.input(isLight))} value={experienceForm.category} onChange={(event) => setExperienceForm((current) => ({ ...current, category: event.target.value }))}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <input className={cn('w-full', ui.input(isLight))} placeholder="Title" value={experienceForm.title} onChange={(event) => setExperienceForm((current) => ({ ...current, title: event.target.value }))} required />
              <input className={cn('w-full', ui.input(isLight))} placeholder="Destination city" value={experienceForm.destination_city} onChange={(event) => setExperienceForm((current) => ({ ...current, destination_city: event.target.value }))} />
              <input className={cn('w-full', ui.input(isLight))} placeholder="Price" value={experienceForm.price} onChange={(event) => setExperienceForm((current) => ({ ...current, price: event.target.value }))} />
              <input className={cn('w-full', ui.input(isLight))} placeholder="Commission %" value={experienceForm.commission_percent} onChange={(event) => setExperienceForm((current) => ({ ...current, commission_percent: event.target.value }))} />
              <input className={cn('w-full', ui.input(isLight))} placeholder="Duration" value={experienceForm.duration} onChange={(event) => setExperienceForm((current) => ({ ...current, duration: event.target.value }))} />
              <input className={cn('w-full', ui.input(isLight))} placeholder={`Audience: ${audienceOptions.join(', ')}`} value={experienceForm.audience_tags} onChange={(event) => setExperienceForm((current) => ({ ...current, audience_tags: event.target.value }))} />
              <input className={cn('w-full md:col-span-2', ui.input(isLight))} placeholder="Tags, comma separated" value={experienceForm.tags} onChange={(event) => setExperienceForm((current) => ({ ...current, tags: event.target.value }))} />
              <textarea className={cn('min-h-20 w-full md:col-span-2', ui.input(isLight))} placeholder="Short description" value={experienceForm.short_description} onChange={(event) => setExperienceForm((current) => ({ ...current, short_description: event.target.value }))} />
              <div className="md:col-span-2">
                <button type="submit" disabled={saving || !experienceForm.providerId} className={ui.button(isLight, 'primary')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Saving...' : 'Add excursion'}
                </button>
              </div>
            </div>
          </form>

          <div className="grid gap-3">
            {(state.experiences || []).map((experience) => (
              <ProviderExperienceCard
                key={experience.id}
                hotelId={hotelId}
                experience={experience}
                isLight={isLight}
                onUpdated={() => loadProviders({ silent: true })}
                onError={setError}
              />
            ))}
            {!state.experiences?.length ? (
              <div className={cn('rounded-xl border border-dashed p-5 text-sm', isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
                No provider excursions yet. Add Agafay, Atlas, Essaouira, Hammam or Quad experiences for Morocco hotels.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};
