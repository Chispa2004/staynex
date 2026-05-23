'use client';

import {
  AlertTriangle,
  BadgeEuro,
  Building2,
  CheckCircle2,
  Mail,
  Plus,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Store,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

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
  duration: '',
  tags: '',
  aliases: '',
  description: ''
};

const initialAssignment = {
  provider_id: '',
  hotel_id: '',
  lead_email: '',
  notes: ''
};

const StatCard = ({ icon: Icon, label, value, isLight }) => (
  <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
    <div className="flex items-center justify-between gap-3">
      <p className={ui.text.eyebrow(isLight)}>{label}</p>
      <Icon className={cn('h-4 w-4', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
    </div>
    <p className={cn('mt-3 text-3xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
  </article>
);

const Field = ({ label, children, isLight }) => (
  <label className="block">
    <span className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-[0.13em]', isLight ? 'text-slate-500' : 'text-slate-500')}>
      {label}
    </span>
    {children}
  </label>
);

const ProviderCard = ({ provider, isLight }) => {
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
                {provider.active !== false ? 'Active' : 'Inactive'}
              </span>
              <span className={ui.badge(isLight, 'sky', true)}>{provider.provider_type || 'provider'}</span>
            </div>
            <p className={cn('mt-2 text-sm', ui.text.muted(isLight))}>
              {[provider.destination_city, provider.destination_country].filter(Boolean).join(', ') || 'No destination configured'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {provider.contact_email ? (
                <span className={ui.badge(isLight, 'slate', true)}>
                  <Mail className="mr-1 h-3 w-3" aria-hidden="true" />
                  {provider.contact_email}
                </span>
              ) : (
                <span className={ui.badge(isLight, 'amber', true)}>Reservation email missing</span>
              )}
              {(provider.languages || []).slice(0, 4).map((language) => (
                <span key={language} className={ui.badge(isLight, 'slate', true)}>{language.toUpperCase()}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-w-[220px] gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>Hotels</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{provider.metrics?.assignedHotels || 0}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>Experiences</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{provider.metrics?.activeExperiences || 0}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
            <p className={ui.text.eyebrow(isLight)}>Commission</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', ui.text.title(isLight))}>{formatCurrency(provider.metrics?.staynexCommission || 0)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Assigned hotels</p>
          {assignments.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {assignments.slice(0, 8).map((assignment) => (
                <span key={assignment.id} className={ui.badge(isLight, assignment.active !== false ? 'emerald' : 'slate', true)}>
                  {assignment.hotel?.name || 'Unknown hotel'}
                </span>
              ))}
            </div>
          ) : (
            <p className={cn('mt-3 text-sm', ui.text.body(isLight))}>Not assigned to a hotel yet.</p>
          )}
        </div>
        <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Experiences</p>
          {experiences.length ? (
            <div className="mt-3 space-y-2">
              {experiences.slice(0, 5).map((experience) => (
                <div key={experience.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className={cn('min-w-0 truncate', ui.text.body(isLight))}>{experience.title}</span>
                  <span className={ui.badge(isLight, experience.active !== false ? 'emerald' : 'slate', true)}>
                    {experience.price ? formatCurrency(experience.price) : experience.category}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={cn('mt-3 text-sm', ui.text.body(isLight))}>Add provider experiences for AI matching.</p>
          )}
        </div>
      </div>
    </article>
  );
};

export const PlatformProvidersClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState({ providers: [], hotels: [], metrics: {}, sqlReady: true });
  const [query, setQuery] = useState('');
  const [activeForm, setActiveForm] = useState('provider');
  const [providerForm, setProviderForm] = useState(initialProvider);
  const [experienceForm, setExperienceForm] = useState(initialExperience);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignment);
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">Staynex Partner Network</p>
          <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>Experience Providers</h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            Central marketplace for external providers, their experiences and hotel assignments. Hotel AI only uses assigned providers.
          </p>
        </div>
        <button type="button" onClick={loadProviders} className={ui.button(isLight, 'secondary')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {notice ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}
      {!data.sqlReady ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100')}>
          Provider marketplace SQL migration required.
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
                {label}
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
                Add provider
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
                <option value="">Select provider</option>
                {(data.providers || []).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Experience" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.title} onChange={(event) => setExperienceForm({ ...experienceForm, title: event.target.value })} placeholder="Coastal excursion" />
            </Field>
            <Field label="Price" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.price} onChange={(event) => setExperienceForm({ ...experienceForm, price: event.target.value })} placeholder="95" />
            </Field>
            <Field label="Duration" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.duration} onChange={(event) => setExperienceForm({ ...experienceForm, duration: event.target.value })} placeholder="Full day" />
            </Field>
            <Field label="Tags" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.tags} onChange={(event) => setExperienceForm({ ...experienceForm, tags: event.target.value })} placeholder="culture,coast,day-trip" />
            </Field>
            <Field label="AI aliases" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.aliases} onChange={(event) => setExperienceForm({ ...experienceForm, aliases: event.target.value })} placeholder="essaouira,coastal excursion" />
            </Field>
            <Field label="Description" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={experienceForm.description} onChange={(event) => setExperienceForm({ ...experienceForm, description: event.target.value })} />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className={cn('w-full', ui.button(isLight, 'primary'))}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add experience
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
                <option value="">Select provider</option>
                {(data.providers || []).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Hotel" isLight={isLight}>
              <select className={cn('w-full', ui.input(isLight))} value={assignmentForm.hotel_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, hotel_id: event.target.value })}>
                <option value="">Select hotel</option>
                {(data.hotels || []).map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Lead email override" isLight={isLight}>
              <input className={cn('w-full', ui.input(isLight))} value={assignmentForm.lead_email} onChange={(event) => setAssignmentForm({ ...assignmentForm, lead_email: event.target.value })} placeholder="Optional" />
            </Field>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className={cn('w-full', ui.button(isLight, 'primary'))}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Assign provider
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
          placeholder="Search providers, experiences, hotels..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
        />
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[0, 1].map((item) => (
            <div key={item} className={cn('h-64 rounded-xl', ui.skeleton(isLight))} />
          ))}
        </div>
      ) : filteredProviders.length ? (
        <div className="grid gap-4">
          {filteredProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} isLight={isLight} />
          ))}
        </div>
      ) : (
        <PremiumEmptyState
          icon={Store}
          title="No experience providers yet"
          description="Create external providers and assign them to hotels before AI can recommend their experiences."
          action={data.sqlReady ? null : (
            <span className={ui.badge(isLight, 'amber')}>
              <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Provider marketplace SQL migration required
            </span>
          )}
        />
      )}
    </div>
  );
};
