'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Map, Plus, RefreshCw, Sparkles, Star } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { canAccess } from '@/lib/permissions';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { KnowledgeCard } from './KnowledgeCard';
import { KnowledgeFilters } from './KnowledgeFilters';
import { KnowledgeForm } from './KnowledgeForm';
import { PremiumEmptyState } from './PremiumEmptyState';
import { QuickAddKnowledge } from './QuickAddKnowledge';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const StatCard = ({ icon: Icon, label, value, tone = 'slate', isLight }) => (
  <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <p className={cn('mt-2 text-2xl font-semibold', ui.text.title(isLight))}>{value}</p>
      </div>
      <span className={ui.badge(isLight, tone)}>
        <Icon className="mr-1 h-3.5 w-3.5" />
        Local
      </span>
    </div>
  </article>
);

export const LocalKnowledgeClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [items, setItems] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [role, setRole] = useState('receptionist');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [audience, setAudience] = useState('all');
  const [weather, setWeather] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const requestRef = useRef(0);
  const canManage = canAccess(role, 'local_knowledge_manage');

  const loadItems = async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/local-knowledge', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load local knowledge');
      }

      if (!shouldAcceptTenantPayload(body, 'local-knowledge')) {
        return;
      }

      if (requestId !== requestRef.current) {
        return;
      }

      setItems(body.items || []);
      setHotel(body.hotel || null);
      setRole(body.role || 'receptionist');

      if (body.missingTable) {
        setError('Run supabase/sql/create_local_knowledge_items.sql to enable Local Knowledge Studio.');
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
    loadItems();
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.active).length,
    featured: items.filter((item) => item.featured).length,
    indoor: items.filter((item) => item.indoor || item.weather_tags?.includes('indoor')).length
  }), [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesAudience = audience === 'all'
        || (item.audience_tags || []).includes(audience)
        || (item.recommendation_contexts || []).includes(audience)
        || (item.tags || []).includes(audience);
      const matchesWeather = weather === 'all'
        || (item.weather_tags || []).includes(weather)
        || (weather === 'indoor' && item.indoor);
      const matchesStatus = status === 'all'
        || (status === 'active' && item.active)
        || (status === 'inactive' && !item.active)
        || (status === 'featured' && item.featured)
        || (status === 'indoor' && item.indoor);
      const text = [
        item.title,
        item.slug,
        item.category,
        item.description,
        item.short_description,
        item.address,
        ...(item.tags || []),
        ...(item.audience_tags || []),
        ...(item.recommendation_contexts || []),
        ...(item.weather_tags || [])
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesCategory && matchesAudience && matchesWeather && matchesStatus && (!query || text.includes(query));
    });
  }, [audience, category, items, search, status, weather]);

  const saveItem = async (payload, id = null) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/local-knowledge', {
        method: id ? 'PATCH' : 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(id ? { ...payload, id } : payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save local knowledge');
      }

      setItems((current) => {
        const next = id
          ? current.map((item) => (item.id === id ? body.item : item))
          : [body.item, ...current];
        return next.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.priority || 0) - Number(a.priority || 0));
      });
      setEditing(null);
      setShowCreate(false);
      setSuccess('Local knowledge saved.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item) => {
    setBusyId(item.id);
    await saveItem({ ...item, active: !item.active }, item.id);
    setBusyId(null);
  };

  const deleteItem = async (item) => {
    setBusyId(item.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/local-knowledge', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: item.id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete local knowledge');
      }

      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setSuccess('Local knowledge deleted.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard isLight={isLight} icon={Map} label="Local cards" value={stats.total} tone="sky" />
        <StatCard isLight={isLight} icon={Sparkles} label="Active" value={stats.active} tone="emerald" />
        <StatCard isLight={isLight} icon={Star} label="Featured" value={stats.featured} tone="amber" />
        <StatCard isLight={isLight} icon={BookOpen} label="Indoor/rain ready" value={stats.indoor} tone="violet" />
      </div>

      <section className={cn('rounded-xl border p-4', ui.surface(isLight))}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{hotel?.name || 'Current hotel'}</p>
            <p className={ui.text.body(isLight)}>Simple local intelligence cards for reception and the AI concierge.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadItems} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
            {canManage ? (
              <button type="button" onClick={() => setShowCreate((current) => !current)} className={ui.button(isLight, 'primary')}>
                <Plus className="h-4 w-4" />
                New card
              </button>
            ) : null}
          </div>
        </div>
      </section>

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

      <QuickAddKnowledge canManage={canManage} onSubmit={(payload) => saveItem(payload)} saving={saving} />

      {showCreate ? (
        <KnowledgeForm saving={saving} onSubmit={(payload) => saveItem(payload)} onCancel={() => setShowCreate(false)} />
      ) : null}

      {editing ? (
        <KnowledgeForm item={editing} saving={saving} onSubmit={(payload) => saveItem(payload, editing.id)} onCancel={() => setEditing(null)} />
      ) : null}

      <KnowledgeFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        audience={audience}
        onAudienceChange={setAudience}
        weather={weather}
        onWeatherChange={setWeather}
        status={status}
        onStatusChange={setStatus}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className={cn('h-64 rounded-xl', ui.skeleton(isLight))} />)}
        </div>
      ) : filteredItems.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {filteredItems.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              canManage={canManage}
              busy={busyId === item.id}
              onEdit={setEditing}
              onToggle={toggleItem}
              onDelete={deleteItem}
            />
          ))}
        </div>
      ) : (
        <PremiumEmptyState
          icon={BookOpen}
          title="No local knowledge yet"
          description="Add a restaurant, beach, local tip or rainy-day plan so Staynex can sound like a real local concierge."
        />
      )}
    </div>
  );
};
