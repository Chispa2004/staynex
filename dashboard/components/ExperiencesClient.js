'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Euro, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { ExperienceCard } from './ExperienceCard';
import { ExperienceFilters } from './ExperienceFilters';
import { ExperienceForm } from './ExperienceForm';
import { PremiumEmptyState } from './PremiumEmptyState';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { canAccess } from '@/lib/permissions';
import { cn, ui } from '@/lib/ui/styles';

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border', ui.surface(isLight), className)}>
      {children}
    </section>
  );
};

const StatCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{label}</p>
          <p className={`mt-2 text-2xl ${ui.text.title(isLight)}`}>{value}</p>
        </div>
        <span className={ui.badge(isLight, tone)}>
          <Icon className="mr-1 h-3.5 w-3.5" />
          AI
        </span>
      </div>
    </Card>
  );
};

export const ExperiencesClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [experiences, setExperiences] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [role, setRole] = useState('receptionist');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const requestRef = useRef(0);

  const canManage = canAccess(role, 'experiences_manage');

  const getAuthHeaders = async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

    return data?.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  };

  const loadExperiences = async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/experiences', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load experiences');
      }

      if (requestId !== requestRef.current) {
        return;
      }

      setExperiences(body.experiences || []);
      setHotel(body.hotel || null);
      setRole(body.role || 'receptionist');
      if (body.missingTable) {
        setError('Run supabase/sql/create_hotel_experiences.sql to enable Experience Management.');
      }
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadExperiences();
  }, []);

  const filteredExperiences = useMemo(() => {
    const query = search.trim().toLowerCase();

    return experiences.filter((experience) => {
      const matchesCategory = categoryFilter === 'all' || experience.category === categoryFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && experience.active)
        || (statusFilter === 'inactive' && !experience.active)
        || (statusFilter === 'vip' && experience.vip_only)
        || (statusFilter === 'indoor' && experience.indoor);
      const text = [
        experience.title,
        experience.slug,
        experience.description,
        experience.category,
        experience.partner_name,
        ...(experience.tags || []),
        ...(experience.target_guest_types || [])
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesCategory && matchesStatus && (!query || text.includes(query));
    });
  }, [categoryFilter, experiences, search, statusFilter]);

  const stats = useMemo(() => ({
    total: experiences.length,
    active: experiences.filter((item) => item.active).length,
    vip: experiences.filter((item) => item.vip_only).length,
    potential: experiences.reduce((total, item) => total + Number(item.price || 0), 0)
  }), [experiences]);

  const saveExperience = async (payload, id = null) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/experiences', {
        method: id ? 'PATCH' : 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(id ? { ...payload, id } : payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save experience');
      }

      setExperiences((current) => {
        const next = id
          ? current.map((item) => (item.id === id ? body.experience : item))
          : [body.experience, ...current];
        return next.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
      });
      setEditing(null);
      setShowCreate(false);
      setSuccess('Experience saved.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file) => {
    setSaving(true);
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/experiences/upload', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: formData
    });
    const body = await response.json();

    if (!response.ok) {
      setSaving(false);
      throw new Error(body.error || 'Could not upload image');
    }

    return body.url;
  };

  const toggleExperience = async (experience) => {
    setBusyId(experience.id);
    await saveExperience({ ...experience, active: !experience.active }, experience.id);
    setBusyId(null);
  };

  const deleteExperience = async (experience) => {
    setBusyId(experience.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/experiences', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: experience.id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete experience');
      }

      setExperiences((current) => current.filter((item) => item.id !== experience.id));
      setSuccess('Experience deleted.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Compass} label="Total experiences" value={stats.total} tone="sky" />
        <StatCard icon={Sparkles} label="Active" value={stats.active} tone="emerald" />
        <StatCard icon={Sparkles} label="VIP" value={stats.vip} tone="violet" />
        <StatCard icon={Euro} label="Catalog value" value={new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.potential)} tone="amber" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-sm font-semibold ${isLight ? 'text-slate-950' : 'text-white'}`}>{hotel?.name || 'Current hotel'}</p>
            <p className={ui.text.body(isLight)}>Manage the local experiences Staynex can recommend for this hotel only.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadExperiences} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
            {canManage ? (
              <button type="button" onClick={() => setShowCreate((current) => !current)} className={ui.button(isLight, 'primary')}>
                <Plus className="h-4 w-4" />
                Create experience
              </button>
            ) : null}
          </div>
        </div>
      </Card>

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

      {showCreate ? (
        <ExperienceForm
          saving={saving}
          onSubmit={(payload) => saveExperience(payload)}
          onUploadImage={uploadImage}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {editing ? (
        <ExperienceForm
          experience={editing}
          saving={saving}
          onSubmit={(payload) => saveExperience(payload, editing.id)}
          onUploadImage={uploadImage}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ExperienceFilters
        search={search}
        onSearchChange={setSearch}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        status={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className={`${ui.skeleton(isLight)} h-56`} />
          ))}
        </div>
      ) : filteredExperiences.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredExperiences.map((experience) => (
            <ExperienceCard
              key={experience.id}
              experience={experience}
              canManage={canManage}
              busy={busyId === experience.id}
              onEdit={setEditing}
              onToggle={toggleExperience}
              onDelete={deleteExperience}
            />
          ))}
        </div>
      ) : (
        <PremiumEmptyState
          icon={Compass}
          title="No experiences yet"
          description="Create local recommendations so Staynex can act like a real hotel concierge for this workspace."
        />
      )}
    </div>
  );
};
