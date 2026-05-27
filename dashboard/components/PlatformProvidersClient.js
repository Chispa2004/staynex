'use client';

import {
  AlertTriangle,
  BadgeEuro,
  Building2,
  CheckCircle2,
  Copy,
  Edit3,
  Mail,
  Plus,
  Power,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Store,
  Trash2,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';
import { PremiumLoadingState } from './PremiumLoadingState';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const formatCurrency = (value) => new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const initialProvider = {
  name: '',
  contact_email: '',
  phone: '',
  destination_country: 'Morocco',
  destination_city: '',
  provider_type: 'tour_operator',
  categories: '',
  languages: 'es,en,fr',
  notes: ''
};

const initialExperience = {
  provider_id: '',
  title: '',
  category: 'tour',
  price: '',
  currency: 'EUR',
  duration: '',
  tags: '',
  aliases: '',
  languages: 'es,en,fr',
  provider_email: '',
  internal_notes: '',
  description: ''
};

const initialAssignment = {
  provider_id: '',
  hotel_id: '',
  lead_email: '',
  notes: ''
};

const StatCard = ({ icon: Icon, label, value, isLight }) => {
  const { tx } = useDashboardLanguage();

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
        <Icon className={cn('h-4 w-4', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
      </div>
      <p className={cn('mt-3 text-3xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
    </article>
  );
};

const Field = ({ label, children, isLight }) => {
  const { tx } = useDashboardLanguage();

  return (
    <label className="block">
      <span className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-[0.13em]', isLight ? 'text-slate-500' : 'text-slate-500')}>
        {tx(label)}
      </span>
      {children}
    </label>
  );
};

const experienceToForm = (experience = {}) => ({
  id: experience.id || '',
  provider_id: experience.provider_id || '',
  title: experience.title || '',
  category: experience.category || 'tour',
  price: experience.price ?? '',
  currency: experience.currency || 'EUR',
  duration: experience.duration || '',
  tags: (experience.tags || []).join(', '),
  aliases: (experience.metadata?.ai_aliases || []).join(', '),
  languages: (experience.metadata?.languages || []).join(', '),
  provider_email: experience.metadata?.provider_email || '',
  internal_notes: experience.metadata?.internal_notes || '',
  description: experience.description || '',
  active: experience.active !== false
});

const ProviderCard = ({
  provider,
  isLight,
  saving,
  onAddExperience,
  onEditExperience,
  onToggleExperience,
  onDuplicateExperience,
  onDeleteExperience
}) => {
  const { tx } = useDashboardLanguage();
  const assignments = provider.assignments || [];
  const experiences = provider.experiences || [];

  return (
    <article className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border', isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-200')}>
            <Store className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={cn('truncate text-xl font-semibold', ui.text.title(isLight))}>{provider.name}</h2>
              <span className={ui.badge(isLight, provider.active !== false ? 'emerald' : 'slate', true)}>
                {tx(provider.active !== false ? 'Active' : 'Inactive')}
              </span>
              <span className={ui.badge(isLight, 'sky', true)}>{provider.provider_type || 'provider'}</span>
            </div>
            <p className={cn('mt-2 text-sm', ui.text.muted(isLight))}>
              {[provider.destination_city, provider.destination_country].filter(Boolean).join(', ') || tx('No destination configured')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {provider.contact_email ? (
                <span className={ui.badge(isLight, 'slate', true)}>
                  <Mail className="mr-1 h-3 w-3" aria-hidden="true" />
                  {provider.contact_email}
                </span>
              ) : (
                <span className={ui.badge(isLight, 'amber', true)}>{tx('Reservation email missing')}</span>
              )}
              {(provider.languages || []).slice(0, 4).map((language) => (
                <span key={language} className={ui.badge(isLight, 'slate', true)}>{language.toUpperCase()}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-w-[220px] gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Hotels')}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{provider.metrics?.assignedHotels || 0}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Experiences')}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{provider.metrics?.activeExperiences || 0}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>{tx('Commission')}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{formatCurrency(provider.metrics?.staynexCommission || 0)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx('Assigned hotels')}</p>
          {assignments.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {assignments.slice(0, 8).map((assignment) => (
                <span key={assignment.id} className={ui.badge(isLight, assignment.active !== false ? 'emerald' : 'slate', true)}>
                  {assignment.hotel?.name || tx('Unknown hotel')}
                </span>
              ))}
            </div>
          ) : (
            <p className={cn('mt-3 text-sm', ui.text.body(isLight))}>{tx('Not assigned to a hotel yet.')}</p>
          )}
        </div>
        <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx('Experiences')}</p>
              <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx('Manage AI matching, availability and provider request data.')}</p>
            </div>
            <button type="button" onClick={() => onAddExperience(provider)} className={ui.button(isLight, 'secondary')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tx('Add experience')}
            </button>
          </div>
          {experiences.length ? (
            <div className="mt-4 space-y-3">
              {experiences.map((experience) => (
                <div key={experience.id} className={cn('rounded-lg border p-3', isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-black/10')}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn('font-semibold', ui.text.title(isLight))}>{experience.title}</p>
                        <span className={ui.badge(isLight, experience.active !== false ? 'emerald' : 'slate', true)}>
                          {tx(experience.active !== false ? 'Active' : 'Inactive')}
                        </span>
                        <span className={ui.badge(isLight, 'slate', true)}>
                          {experience.price ? formatCurrency(experience.price) : experience.category}
                        </span>
                      </div>
                      <p className={cn('mt-2 line-clamp-2 text-sm', ui.text.body(isLight))}>
                        {experience.description || experience.short_description || tx('No description yet.')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {experience.duration ? <span className={ui.badge(isLight, 'sky', true)}>{experience.duration}</span> : null}
                        {(experience.tags || []).slice(0, 4).map((tag) => (
                          <span key={tag} className={ui.badge(isLight, 'slate', true)}>{tag}</span>
                        ))}
                        {(experience.metadata?.ai_aliases || []).slice(0, 3).map((alias) => (
                          <span key={alias} className={ui.badge(isLight, 'violet', true)}>{alias}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => onEditExperience(experience)} className={ui.button(isLight, 'secondary')}>
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        {tx('Edit')}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onToggleExperience(experience)}
                        className={ui.button(isLight, experience.active !== false ? 'secondary' : 'primary')}
                      >
                        <Power className="h-4 w-4" aria-hidden="true" />
                        {tx(experience.active !== false ? 'Deactivate' : 'Activate')}
                      </button>
                      <button type="button" disabled={saving} onClick={() => onDuplicateExperience(experience)} className={ui.button(isLight, 'secondary')}>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        {tx('Duplicate')}
                      </button>
                      <button type="button" disabled={saving} onClick={() => onDeleteExperience(experience)} className={ui.button(isLight, 'danger')}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {tx('Delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={cn('mt-3 text-sm', ui.text.body(isLight))}>{tx('Add provider experiences for AI matching.')}</p>
          )}
        </div>
      </div>
    </article>
  );
};

export const PlatformProvidersClient = () => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [data, setData] = useState({ providers: [], hotels: [], metrics: {}, sqlReady: true });
  const [query, setQuery] = useState('');
  const [activeForm, setActiveForm] = useState('provider');
  const [providerForm, setProviderForm] = useState(initialProvider);
  const [experienceForm, setExperienceForm] = useState(initialExperience);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignment);
  const [editingExperience, setEditingExperience] = useState(null);
  const [editExperienceForm, setEditExperienceForm] = useState(initialExperience);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/providers', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not load providers');
      }
      setData(body);
      setNotice(body.warning || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const submitAction = async (action, payload) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/providers', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not save provider marketplace changes');
      }
      setNotice('Provider marketplace updated.');
      await loadProviders();
      if (action === 'create_provider') setProviderForm(initialProvider);
      if (action === 'create_experience') setExperienceForm(initialExperience);
      if (action === 'assign_provider') setAssignmentForm(initialAssignment);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const patchAction = async (action, payload) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/providers', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not update provider marketplace');
      }
      setNotice('Provider marketplace updated.');
      await loadProviders();
      return body;
    } catch (caughtError) {
      setError(caughtError.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteExperience = async (experience) => {
    const confirmed = window.confirm(tx('This will hide the experience from AI recommendations and keep historical booking references safe. Continue?'));
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/providers', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'experience', experience_id: experience.id })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not delete experience');
      }
      setNotice('Experience removed from the active provider catalog.');
      await loadProviders();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const startAddExperience = (provider) => {
    setActiveForm('experience');
    setExperienceForm({
      ...initialExperience,
      provider_id: provider.id,
      provider_email: provider.contact_email || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEditExperience = (experience) => {
    setEditingExperience(experience);
    setEditExperienceForm(experienceToForm(experience));
  };

  const saveExperienceChanges = async () => {
    if (!editingExperience?.id) return;
    const result = await patchAction('update_experience', {
      ...editExperienceForm,
      experience_id: editingExperience.id
    });
    if (result?.ok) {
      setEditingExperience(null);
      setEditExperienceForm(initialExperience);
    }
  };

  const toggleExperience = (experience) => {
    patchAction('set_experience_active', {
      experience_id: experience.id,
      active: experience.active === false
    });
  };

  const duplicateExperience = (experience) => {
    submitAction('duplicate_experience', {
      experience_id: experience.id,
      title: `${experience.title} copy`
    });
  };

  const filteredProviders = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return data.providers || [];
    return (data.providers || []).filter((provider) => [
      provider.name,
      provider.contact_email,
      provider.destination_country,
      provider.destination_city,
      provider.provider_type,
      ...(provider.categories || []),
      ...(provider.experiences || []).map((experience) => experience.title),
      ...(provider.assignments || []).map((assignment) => assignment.hotel?.name)
    ].filter(Boolean).join(' ').toLowerCase().includes(search));
  }, [data.providers, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{tx('Staynex Partner Network')}</p>
          <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>{tx('Experience Providers')}</h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Central marketplace for external providers, their experiences and hotel assignments. Hotel AI only uses assigned providers.')}
          </p>
        </div>
        <button type="button" onClick={loadProviders} className={ui.button(isLight, 'secondary')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          {tx('Refresh')}
        </button>
      </div>

      {notice ? (
        <div className={ui.notice(isLight, 'success')}>
          {tx(notice)}
        </div>
      ) : null}
      {error ? (
        <div className={ui.notice(isLight, 'danger')}>
          {tx(error)}
        </div>
      ) : null}
      {!data.sqlReady ? (
        <div className={ui.notice(isLight, 'warning')}>
          {tx('Provider marketplace SQL migration required.')}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Store} isLight={isLight} label="Providers" value={data.metrics?.totalProviders || 0} />
        <StatCard icon={Sparkles} isLight={isLight} label="Experiences" value={data.metrics?.activeExperiences || 0} />
        <StatCard icon={Building2} isLight={isLight} label="Assigned hotels" value={data.metrics?.assignedHotels || 0} />
        <StatCard icon={Route} isLight={isLight} label="Leads" value={data.metrics?.totalLeads || 0} />
        <StatCard icon={BadgeEuro} isLight={isLight} label="Commission" value={formatCurrency(data.metrics?.staynexCommission || 0)} />
      </section>

      <section className={cn('rounded-xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Marketplace setup</p>
            <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Provider management</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['provider', 'Add provider'],
              ['experience', 'Add experience'],
              ['assignment', 'Assign to hotel']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveForm(key)}
                className={activeForm === key ? ui.button(isLight, 'primary') : ui.button(isLight, 'secondary')}
              >
                {tx(label)}
              </button>
            ))}
          </div>
        </div>

        {activeForm === 'provider' ? (
          <form
            className="mt-5 grid gap-3 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitAction('create_provider', providerForm);
            }}
          >
            <Field label="Name" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="Luxotour Morocco" />
            </Field>
            <Field label="Reservation email" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.contact_email} onChange={(event) => setProviderForm({ ...providerForm, contact_email: event.target.value })} placeholder="reservations@provider.com" />
            </Field>
            <Field label="Country / zone" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.destination_country} onChange={(event) => setProviderForm({ ...providerForm, destination_country: event.target.value })} />
            </Field>
            <Field label="City" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.destination_city} onChange={(event) => setProviderForm({ ...providerForm, destination_city: event.target.value })} placeholder="Marrakech" />
            </Field>
            <Field label="Phone" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.phone} onChange={(event) => setProviderForm({ ...providerForm, phone: event.target.value })} />
            </Field>
            <Field label="Categories" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.categories} onChange={(event) => setProviderForm({ ...providerForm, categories: event.target.value })} placeholder="tours,transfers,wellness" />
            </Field>
            <Field label="Languages" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={providerForm.languages} onChange={(event) => setProviderForm({ ...providerForm, languages: event.target.value })} />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className={cn('w-full', ui.button(isLight, 'primary'))}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tx('Add provider')}
              </button>
            </div>
          </form>
        ) : null}

        {activeForm === 'experience' ? (
          <form
            className="mt-5 grid gap-3 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitAction('create_experience', experienceForm);
            }}
          >
            <Field label="Provider" isLight={isLight}>
              <select className={cn('w-full', ui.input(isLight))} value={experienceForm.provider_id} onChange={(event) => setExperienceForm({ ...experienceForm, provider_id: event.target.value })}>
                <option value="">{tx('Select provider')}</option>
                {(data.providers || []).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Experience" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.title} onChange={(event) => setExperienceForm({ ...experienceForm, title: event.target.value })} placeholder="Coastal excursion" />
            </Field>
            <Field label="Category" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.category} onChange={(event) => setExperienceForm({ ...experienceForm, category: event.target.value })} placeholder="tour" />
            </Field>
            <Field label="Price" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.price} onChange={(event) => setExperienceForm({ ...experienceForm, price: event.target.value })} placeholder="95" />
            </Field>
            <Field label="Currency" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.currency} onChange={(event) => setExperienceForm({ ...experienceForm, currency: event.target.value })} placeholder="EUR" />
            </Field>
            <Field label="Duration" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.duration} onChange={(event) => setExperienceForm({ ...experienceForm, duration: event.target.value })} placeholder="Full day" />
            </Field>
            <Field label="Languages" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.languages} onChange={(event) => setExperienceForm({ ...experienceForm, languages: event.target.value })} placeholder="es,en,fr" />
            </Field>
            <Field label="Tags" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.tags} onChange={(event) => setExperienceForm({ ...experienceForm, tags: event.target.value })} placeholder="culture,coast,day-trip" />
            </Field>
            <Field label="AI aliases" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.aliases} onChange={(event) => setExperienceForm({ ...experienceForm, aliases: event.target.value })} placeholder="essaouira,coastal excursion" />
            </Field>
            <Field label="Provider email" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.provider_email} onChange={(event) => setExperienceForm({ ...experienceForm, provider_email: event.target.value })} placeholder={tx('Optional override')} />
            </Field>
            <Field label="Description" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.description} onChange={(event) => setExperienceForm({ ...experienceForm, description: event.target.value })} />
            </Field>
            <Field label="Internal notes" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.internal_notes} onChange={(event) => setExperienceForm({ ...experienceForm, internal_notes: event.target.value })} />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className={cn('w-full', ui.button(isLight, 'primary'))}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tx('Add experience')}
              </button>
            </div>
          </form>
        ) : null}

        {activeForm === 'assignment' ? (
          <form
            className="mt-5 grid gap-3 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitAction('assign_provider', assignmentForm);
            }}
          >
            <Field label="Provider" isLight={isLight}>
              <select className={cn('w-full', ui.input(isLight))} value={assignmentForm.provider_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, provider_id: event.target.value })}>
                <option value="">{tx('Select provider')}</option>
                {(data.providers || []).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Hotel" isLight={isLight}>
              <select className={cn('w-full', ui.input(isLight))} value={assignmentForm.hotel_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, hotel_id: event.target.value })}>
                <option value="">{tx('Select hotel')}</option>
                {(data.hotels || []).map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Lead email override" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={assignmentForm.lead_email} onChange={(event) => setAssignmentForm({ ...assignmentForm, lead_email: event.target.value })} placeholder={tx('Optional')} />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className={cn('w-full', ui.button(isLight, 'primary'))}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {tx('Assign provider')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', ui.surface(isLight, 'subtle'))}>
        <Search className={cn('h-4 w-4 shrink-0', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tx('Search providers, experiences, hotels...')}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
        />
      </div>

      {loading ? (
        <PremiumLoadingState
          title={tx('Loading experience providers')}
          description={tx('Staynex is preparing provider catalogs, hotel assignments and marketplace health.')}
          rows={4}
          cards={3}
        />
      ) : filteredProviders.length ? (
        <div className="grid gap-4">
          {filteredProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isLight={isLight}
              saving={saving}
              onAddExperience={startAddExperience}
              onEditExperience={startEditExperience}
              onToggleExperience={toggleExperience}
              onDuplicateExperience={duplicateExperience}
              onDeleteExperience={deleteExperience}
            />
          ))}
        </div>
      ) : (
        <PremiumEmptyState
          icon={Store}
          title={tx('No experience providers yet')}
          description={tx('Create external providers and assign them to hotels before AI can recommend their experiences.')}
          action={data.sqlReady ? null : (
            <span className={ui.badge(isLight, 'amber')}>
              <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {tx('Provider marketplace SQL migration required')}
            </span>
          )}
        />
      )}

      {editingExperience ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <section className={cn('max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border p-5 shadow-2xl', ui.surface(isLight))}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={ui.text.eyebrow(isLight)}>{tx('Edit provider experience')}</p>
                <h2 className={cn('mt-2 text-2xl font-semibold', ui.text.title(isLight))}>{editingExperience.title}</h2>
                <p className={cn('mt-2 text-sm', ui.text.body(isLight))}>
                  {tx('Changes update the provider catalog used by AI matching. Inactive experiences are not recommended or bookable.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingExperience(null);
                  setEditExperienceForm(initialExperience);
                }}
                className={ui.button(isLight, 'secondary')}
              >
                {tx('Cancel')}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Field label="Name" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.title} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, title: event.target.value })} />
              </Field>
              <Field label="Category" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.category} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, category: event.target.value })} />
              </Field>
              <Field label="Duration" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.duration} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, duration: event.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base price" isLight={isLight}>
                  <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.price} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, price: event.target.value })} />
                </Field>
                <Field label="Currency" isLight={isLight}>
                  <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.currency} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, currency: event.target.value })} />
                </Field>
              </div>
              <Field label="Languages" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.languages} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, languages: event.target.value })} placeholder="es,en,fr" />
              </Field>
              <Field label="Provider email override" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.provider_email} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, provider_email: event.target.value })} />
              </Field>
              <Field label="Tags" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.tags} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, tags: event.target.value })} placeholder="culture,coast,day-trip" />
              </Field>
              <Field label="AI aliases / matching keywords" isLight={isLight}>
                <input className={cn('w-full', ui.input(isLight))} value={editExperienceForm.aliases} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, aliases: event.target.value })} placeholder="essaouira, coastal excursion" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description" isLight={isLight}>
                  <textarea className={cn('min-h-28 w-full resize-y', ui.input(isLight))} value={editExperienceForm.description} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, description: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Internal notes" isLight={isLight}>
                  <textarea className={cn('min-h-20 w-full resize-y', ui.input(isLight))} value={editExperienceForm.internal_notes} onChange={(event) => setEditExperienceForm({ ...editExperienceForm, internal_notes: event.target.value })} />
                </Field>
              </div>
              <label className={cn('flex items-center justify-between gap-3 rounded-xl border p-3 md:col-span-2', ui.surface(isLight, 'subtle'))}>
                <span>
                  <span className={cn('block text-sm font-semibold', ui.text.title(isLight))}>{tx('Active in AI catalog')}</span>
                  <span className={cn('mt-1 block text-xs', ui.text.muted(isLight))}>{tx('When off, the AI will not recommend or book this experience.')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={editExperienceForm.active !== false}
                  onChange={(event) => setEditExperienceForm({ ...editExperienceForm, active: event.target.checked })}
                  className="h-5 w-5 accent-emerald-500"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingExperience(null);
                  setEditExperienceForm(initialExperience);
                }}
                className={ui.button(isLight, 'secondary')}
              >
                {tx('Cancel')}
              </button>
              <button type="button" disabled={saving} onClick={saveExperienceChanges} className={ui.button(isLight, 'primary')}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {tx('Save changes')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};


