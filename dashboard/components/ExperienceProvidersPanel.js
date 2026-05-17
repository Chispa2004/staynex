'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const categories = ['culture', 'adventure', 'wellness', 'restaurant', 'romantic', 'family', 'luxury', 'transfer', 'tour'];
const audienceOptions = ['family', 'couples', 'vip', 'culture', 'adventure', 'wellness'];

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

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
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

const formatDate = (value) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
};

const ProviderBadge = ({ children, tone = 'emerald', isLight }) => (
  <span className={ui.badge(isLight, tone, true)}>{children}</span>
);

const ProviderAssignmentCard = ({
  assignment,
  hotelId,
  isLight,
  savingKey,
  onBusy,
  onReload,
  onNotice,
  onError
}) => {
  const [draft, setDraft] = useState({
    leadEmail: assignment.lead_email || assignment.provider?.contact_email || '',
    priority: assignment.priority ?? 0,
    notes: assignment.notes || ''
  });
  const provider = assignment.provider || {};
  const metrics = assignment.metrics || {};

  const update = async (updates = {}) => {
    onBusy(`assignment-${assignment.id}`);
    onError(null);
    onNotice(null);

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
          priority: updates.priority ?? draft.priority,
          leadEmail: updates.leadEmail ?? draft.leadEmail,
          notes: updates.notes ?? draft.notes
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update provider assignment');
      }

      onNotice('Provider assignment updated.');
      await onReload({ silent: true });
    } catch (error) {
      onError(error.message);
    } finally {
      onBusy(null);
    }
  };

  const disconnect = async () => {
    onBusy(`assignment-${assignment.id}`);
    onError(null);
    onNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'disconnect_provider',
          assignmentId: assignment.id
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not disconnect provider');
      }

      onNotice('Provider disconnected from this hotel.');
      await onReload({ silent: true });
    } catch (error) {
      onError(error.message);
    } finally {
      onBusy(null);
    }
  };

  const busy = savingKey === `assignment-${assignment.id}`;

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('text-sm font-semibold', ui.text.title(isLight))}>{provider.name || 'Provider'}</h3>
            <ProviderBadge isLight={isLight} tone={assignment.active ? 'emerald' : 'slate'}>
              {assignment.active ? 'Active' : 'Inactive'}
            </ProviderBadge>
          </div>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
            Connected {formatDate(assignment.created_at)} / {provider.destination_country || 'Destination not set'}
          </p>
        </div>
        <ProviderBadge isLight={isLight} tone="sky">
          {assignment.experience_count || 0} excursions
        </ProviderBadge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 md:col-span-2">
          <span className={ui.text.eyebrow(isLight)}>Lead email</span>
          <input
            className={cn('w-full', ui.input(isLight))}
            value={draft.leadEmail}
            onChange={(event) => setDraft((current) => ({ ...current, leadEmail: event.target.value }))}
            placeholder={provider.contact_email || 'provider@example.com'}
          />
        </label>
        <label className="space-y-1.5">
          <span className={ui.text.eyebrow(isLight)}>Priority</span>
          <input
            className={cn('w-full', ui.input(isLight))}
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
          />
        </label>
        <label className="space-y-1.5 md:col-span-3">
          <span className={ui.text.eyebrow(isLight)}>Notes</span>
          <input
            className={cn('w-full', ui.input(isLight))}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Internal platform notes"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Leads</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{metrics.leadsGenerated || 0}</p>
        </div>
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Revenue</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.estimatedRevenue || 0)}</p>
        </div>
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Commission</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.commissionEstimate || 0)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => update()} className={ui.button(isLight, 'secondary')}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Saving...' : 'Save provider'}
        </button>
        <button type="button" disabled={busy} onClick={() => update({ active: !assignment.active })} className={ui.button(isLight, 'secondary')}>
          {assignment.active ? 'Deactivate' : 'Activate'}
        </button>
        <button type="button" disabled={busy} onClick={disconnect} className={ui.button(isLight, 'danger')}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Disconnect
        </button>
      </div>
    </article>
  );
};

const ProviderExperienceCard = ({
  hotelId,
  experience,
  isLight,
  savingKey,
  onBusy,
  onReload,
  onNotice,
  onError
}) => {
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
  const provider = experience.provider || {};
  const metrics = experience.metrics || {};
  const busy = savingKey === `experience-${experience.id}`;
  const isHotelScoped = Boolean(experience.hotel_scoped);

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (updates = {}) => {
    onBusy(`experience-${experience.id}`);
    onError(null);
    onNotice(null);

    try {
      const nextDraft = { ...draft, ...updates };
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'update_experience',
          experienceId: experience.id,
          ...nextDraft,
          tags: normalizeTags(nextDraft.tags),
          audience_tags: normalizeTags(nextDraft.audience_tags)
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update provider experience');
      }

      onNotice('Provider excursion updated.');
      await onReload({ silent: true });
    } catch (error) {
      onError(error.message);
    } finally {
      onBusy(null);
    }
  };

  const remove = async () => {
    onBusy(`experience-${experience.id}`);
    onError(null);
    onNotice(null);

    try {
      const response = await fetch(`/api/platform/hotels/${hotelId}/experience-providers`, {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'delete_experience',
          experienceId: experience.id
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete provider excursion');
      }

      onNotice('Provider excursion deleted.');
      await onReload({ silent: true });
    } catch (error) {
      onError(error.message);
    } finally {
      onBusy(null);
    }
  };

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('truncate text-sm font-semibold', ui.text.title(isLight))}>{experience.title}</h3>
            <ProviderBadge isLight={isLight} tone={experience.active ? 'emerald' : 'slate'}>
              {experience.active ? 'Active' : 'Inactive'}
            </ProviderBadge>
            {experience.hotel_scoped ? <ProviderBadge isLight={isLight} tone="sky">Hotel scoped</ProviderBadge> : <ProviderBadge isLight={isLight} tone="slate">Provider global</ProviderBadge>}
          </div>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
            {provider.name || 'Provider'} / {experience.destination_city || 'Any city'} / {formatCurrency(experience.price, experience.currency)}
          </p>
        </div>
        <ProviderBadge isLight={isLight} tone="amber">
          {experience.commission_percent || 0}% commission
        </ProviderBadge>
      </div>

      <p className={cn('mt-3 line-clamp-2 text-sm leading-6', ui.text.body(isLight))}>
        {experience.short_description || experience.description || 'No description yet.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <ProviderBadge isLight={isLight} tone="slate">{experience.category || 'tour'}</ProviderBadge>
        {experience.duration ? <ProviderBadge isLight={isLight} tone="slate">{experience.duration}</ProviderBadge> : null}
        {(experience.tags || []).slice(0, 5).map((tag) => <ProviderBadge key={tag} isLight={isLight} tone="slate">{tag}</ProviderBadge>)}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input className={cn('w-full', ui.input(isLight))} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} disabled={!isHotelScoped} />
        <select className={cn('w-full', ui.input(isLight))} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} disabled={!isHotelScoped}>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <input className={cn('w-full', ui.input(isLight))} placeholder="Destination city" value={draft.destination_city} onChange={(event) => updateDraft('destination_city', event.target.value)} disabled={!isHotelScoped} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Duration" value={draft.duration} onChange={(event) => updateDraft('duration', event.target.value)} disabled={!isHotelScoped} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Price" value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} disabled={!isHotelScoped} />
        <input className={cn('w-full', ui.input(isLight))} placeholder="Commission %" value={draft.commission_percent} onChange={(event) => updateDraft('commission_percent', event.target.value)} disabled={!isHotelScoped} />
        <input className={cn('w-full md:col-span-2', ui.input(isLight))} placeholder="Tags, comma separated" value={draft.tags} onChange={(event) => updateDraft('tags', event.target.value)} disabled={!isHotelScoped} />
        <input className={cn('w-full md:col-span-2', ui.input(isLight))} placeholder="Audience tags" value={draft.audience_tags} onChange={(event) => updateDraft('audience_tags', event.target.value)} disabled={!isHotelScoped} />
        <textarea className={cn('min-h-20 w-full md:col-span-2', ui.input(isLight))} placeholder="Short description" value={draft.short_description} onChange={(event) => updateDraft('short_description', event.target.value)} disabled={!isHotelScoped} />
      </div>

      {!isHotelScoped ? (
        <p className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-300/10 text-amber-100')}>
          Shared provider catalog item. It is visible because this provider is connected to the hotel, but editing/deleting is reserved for hotel-specific excursions.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Leads</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{metrics.leadsGenerated || 0}</p>
        </div>
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Revenue</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.estimatedRevenue || 0)}</p>
        </div>
        <div className={cn('rounded-lg border p-3', ui.surface(isLight))}>
          <p className={ui.text.eyebrow(isLight)}>Commission</p>
          <p className={cn('mt-1 font-semibold', ui.text.title(isLight))}>{formatCurrency(metrics.commissionEstimate || 0)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className={cn('inline-flex items-center gap-2 text-sm', ui.text.body(isLight))}>
          <input type="checkbox" checked={draft.active} onChange={(event) => {
            updateDraft('active', event.target.checked);
          }} disabled={!isHotelScoped} />
          Active for AI recommendations
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} disabled={busy || !isHotelScoped} className={ui.button(isLight, 'secondary')}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => save({ active: !experience.active })} disabled={busy || !isHotelScoped} className={ui.button(isLight, 'secondary')}>
            {experience.active ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" onClick={remove} disabled={busy || !isHotelScoped} className={ui.button(isLight, 'danger')}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
};

export const ExperienceProvidersPanel = ({ hotelId }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [state, setState] = useState({
    providers: [],
    connectedProviders: [],
    providerExperiences: [],
    assignments: [],
    experiences: []
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({ providerId: '', leadEmail: '', priority: 100, active: true });
  const [experienceForm, setExperienceForm] = useState(initialExperienceForm);
  const submitLocks = useRef(new Set());

  const connectedProviders = state.connectedProviders || state.assignments || [];
  const providerExperiences = state.providerExperiences || state.experiences || [];
  const assignedProviderIds = useMemo(
    () => new Set(connectedProviders.map((assignment) => assignment.provider_id)),
    [connectedProviders]
  );
  const availableProviders = (state.providers || []).filter((provider) => !assignedProviderIds.has(provider.id));

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

      const nextState = {
        ...body,
        connectedProviders: body.connectedProviders || body.assignments || [],
        providerExperiences: body.providerExperiences || body.experiences || []
      };
      const uniqueExperiences = Array.from(new Map(nextState.providerExperiences.map((item) => [item.id, item])).values());

      setState({
        ...nextState,
        providerExperiences: uniqueExperiences,
        experiences: uniqueExperiences
      });

      const nextAssignedProviderIds = new Set((nextState.connectedProviders || []).map((assignment) => assignment.provider_id));
      const nextAvailableProviders = (nextState.providers || []).filter((provider) => !nextAssignedProviderIds.has(provider.id));
      const firstConnectedProviderId = nextState.connectedProviders?.[0]?.provider_id || '';
      const firstAvailableProviderId = nextAvailableProviders?.[0]?.id || '';
      setAssignmentForm((current) => ({
        ...current,
        providerId: current.providerId || firstAvailableProviderId
      }));
      setExperienceForm((current) => ({
        ...current,
        providerId: current.providerId || firstConnectedProviderId || firstAvailableProviderId
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
    if (submitLocks.current.has('assign-provider')) return;
    submitLocks.current.add('assign-provider');
    setSavingKey('assign-provider');
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

      setNotice('Provider connected to this hotel.');
      setAssignmentForm((current) => ({ ...current, leadEmail: '', priority: 100, active: true, providerId: '' }));
      await loadProviders({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      submitLocks.current.delete('assign-provider');
      setSavingKey(null);
    }
  };

  const createExperience = async (event) => {
    event.preventDefault();
    if (submitLocks.current.has('create-experience')) return;
    submitLocks.current.add('create-experience');
    setSavingKey('create-experience');
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

      setNotice('Provider excursion created.');
      setExperienceForm((current) => ({
        ...initialExperienceForm,
        providerId: current.providerId
      }));
      await loadProviders({ silent: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      submitLocks.current.delete('create-experience');
      setSavingKey(null);
    }
  };

  const connectedProviderOptions = connectedProviders
    .map((assignment) => assignment.provider)
    .filter(Boolean);

  return (
    <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Experience Providers</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Per-hotel provider catalog</h2>
          <p className={cn('mt-1 max-w-3xl text-sm', ui.text.body(isLight))}>
            Providers and excursions shown here belong to this hotel context. A hotel only sees provider excursions when the provider is connected to this hotel.
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={ui.text.eyebrow(isLight)}>Section 1</p>
                <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>Connected Providers</h3>
              </div>
              <ProviderBadge isLight={isLight} tone="sky">{connectedProviders.length}</ProviderBadge>
            </div>

            <form onSubmit={assignProvider} className={cn('mt-4 rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
              <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Connect provider to this hotel</p>
              <div className="mt-4 grid gap-3">
                <select
                  className={cn('w-full', ui.input(isLight))}
                  value={assignmentForm.providerId}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, providerId: event.target.value }))}
                  disabled={availableProviders.length === 0}
                >
                  <option value="">{availableProviders.length ? 'Choose provider' : 'All providers connected'}</option>
                  {availableProviders.map((provider) => (
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
                <button type="submit" disabled={savingKey === 'assign-provider' || !assignmentForm.providerId} className={ui.button(isLight, 'primary')}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {savingKey === 'assign-provider' ? 'Connecting...' : 'Connect provider'}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-3">
            {connectedProviders.map((assignment) => (
              <ProviderAssignmentCard
                key={assignment.id}
                assignment={assignment}
                hotelId={hotelId}
                isLight={isLight}
                savingKey={savingKey}
                onBusy={setSavingKey}
                onReload={loadProviders}
                onNotice={setNotice}
                onError={setError}
              />
            ))}
            {!connectedProviders.length ? (
              <div className={cn('rounded-xl border border-dashed p-5 text-sm', isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
                No provider connected yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={ui.text.eyebrow(isLight)}>Section 2</p>
                <h3 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>Provider Excursions for this hotel</h3>
              </div>
              <ProviderBadge isLight={isLight} tone="sky">{providerExperiences.length}</ProviderBadge>
            </div>

            <form onSubmit={createExperience} className={cn('mt-4 rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
              <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Add provider excursion</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select className={cn('w-full', ui.input(isLight))} value={experienceForm.providerId} onChange={(event) => setExperienceForm((current) => ({ ...current, providerId: event.target.value }))} disabled={!connectedProviderOptions.length}>
                  <option value="">{connectedProviderOptions.length ? 'Choose connected provider' : 'Connect provider first'}</option>
                  {connectedProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
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
                  <button type="submit" disabled={savingKey === 'create-experience' || !experienceForm.providerId || !experienceForm.title.trim()} className={ui.button(isLight, 'primary')}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {savingKey === 'create-experience' ? 'Creating...' : 'Add excursion'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="grid gap-3">
            {providerExperiences.map((experience) => (
              <ProviderExperienceCard
                key={experience.id}
                hotelId={hotelId}
                experience={experience}
                isLight={isLight}
                savingKey={savingKey}
                onBusy={setSavingKey}
                onReload={loadProviders}
                onNotice={setNotice}
                onError={setError}
              />
            ))}
            {!providerExperiences.length ? (
              <div className={cn('rounded-xl border border-dashed p-5 text-sm', isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
                No provider excursions for this hotel yet. Connect Luxotour Morocco, then add Agafay, Atlas, Essaouira, Hammam or Quad experiences.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn('mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Lead emails are prepared from provider booking requests. Real sending remains future-ready behind the provider email mode.</p>
      </div>
    </section>
  );
};
