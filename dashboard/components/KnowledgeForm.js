'use client';

import { Save, X } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { LOCAL_KNOWLEDGE_CATEGORIES } from '@/lib/local-knowledge-constants';
import { cn, ui } from '@/lib/ui/styles';

const emptyItem = {
  title: '',
  slug: '',
  category: 'restaurant',
  description: '',
  short_description: '',
  tags: [],
  audience_tags: [],
  recommendation_contexts: [],
  address: '',
  website_url: '',
  phone: '',
  image_url: '',
  opening_hours: '',
  price_range: '',
  priority: 0,
  active: true,
  featured: false,
  indoor: false,
  weather_tags: [],
  metadata: {}
};

const audienceHints = 'family, romantic, vip, kids';
const contextHints = 'sunset, dinner, beach, rainy_day';
const weatherHints = 'sunny, rainy, indoor';
const toCsv = (value) => Array.isArray(value) ? value.join(', ') : value || '';
const fromCsv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

export const KnowledgeForm = ({
  item = null,
  onSubmit,
  onCancel,
  saving = false,
  compact = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const form = {
    ...emptyItem,
    ...(item || {})
  };
  const inputClass = ui.input(isLight);

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      ...form,
      title: data.get('title'),
      slug: data.get('slug'),
      category: data.get('category'),
      description: data.get('description'),
      short_description: data.get('short_description'),
      tags: fromCsv(data.get('tags')),
      audience_tags: fromCsv(data.get('audience_tags')),
      recommendation_contexts: fromCsv(data.get('recommendation_contexts')),
      address: data.get('address'),
      website_url: data.get('website_url'),
      phone: data.get('phone'),
      image_url: data.get('image_url'),
      opening_hours: data.get('opening_hours'),
      price_range: data.get('price_range'),
      priority: data.get('priority'),
      active: data.get('active') === 'on',
      featured: data.get('featured') === 'on',
      indoor: data.get('indoor') === 'on',
      weather_tags: fromCsv(data.get('weather_tags'))
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className={cn('rounded-xl border p-5', ui.surface(isLight))}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{item?.id ? 'Edit local card' : compact ? 'Quick add' : 'New local card'}</p>
          <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>Local concierge knowledge</h2>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>A lightweight recommendation card the AI can use for this hotel only.</p>
        </div>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={ui.button(isLight, 'ghost')}>
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
        <input name="title" defaultValue={form.title} placeholder="Name, e.g. Cala Deia" className={inputClass} required />
        <select name="category" defaultValue={form.category} className={inputClass}>
          {LOCAL_KNOWLEDGE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <input name="priority" type="number" defaultValue={form.priority || 0} placeholder="Priority" className={inputClass} />
      </div>

      {!compact ? (
        <input name="slug" defaultValue={form.slug} placeholder="slug-auto-if-empty" className={cn('mt-3 w-full', inputClass)} />
      ) : null}

      <textarea
        name="description"
        defaultValue={form.description}
        rows={compact ? 3 : 4}
        placeholder="Short insider-style note reception would naturally recommend."
        className={cn('mt-3 w-full resize-none', inputClass)}
        required
      />

      {!compact ? (
        <textarea
          name="short_description"
          defaultValue={form.short_description}
          rows={2}
          placeholder="Optional short summary for cards"
          className={cn('mt-3 w-full resize-none', inputClass)}
        />
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <input name="tags" defaultValue={toCsv(form.tags)} placeholder="Tags: sunset, quiet, premium" className={inputClass} />
        <input name="audience_tags" defaultValue={toCsv(form.audience_tags)} placeholder={`Audience: ${audienceHints}`} className={inputClass} />
        <input name="recommendation_contexts" defaultValue={toCsv(form.recommendation_contexts)} placeholder={`Contexts: ${contextHints}`} className={inputClass} />
      </div>

      {!compact ? (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <input name="address" defaultValue={form.address || ''} placeholder="Address" className={inputClass} />
            <input name="website_url" defaultValue={form.website_url || ''} placeholder="Website URL" className={inputClass} />
            <input name="phone" defaultValue={form.phone || ''} placeholder="Phone" className={inputClass} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <input name="opening_hours" defaultValue={form.opening_hours || ''} placeholder="Opening hours" className={inputClass} />
            <input name="price_range" defaultValue={form.price_range || ''} placeholder="Price range, e.g. EUR EUR" className={inputClass} />
            <input name="weather_tags" defaultValue={toCsv(form.weather_tags)} placeholder={`Weather: ${weatherHints}`} className={inputClass} />
            <input name="image_url" defaultValue={form.image_url || ''} placeholder="Image URL" className={inputClass} />
          </div>
        </>
      ) : (
        <input name="weather_tags" defaultValue={toCsv(form.weather_tags)} placeholder={`Weather: ${weatherHints}`} className={cn('mt-3 w-full', inputClass)} />
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {[
          ['active', 'Active', form.active],
          ['featured', 'Featured', form.featured],
          ['indoor', 'Indoor', form.indoor]
        ].map(([name, label, checked]) => (
          <label key={name} className={cn(ui.badge(isLight, name === 'active' ? 'emerald' : name === 'featured' ? 'amber' : 'sky'), 'cursor-pointer gap-2')}>
            <input name={name} type="checkbox" defaultChecked={checked} className="h-3.5 w-3.5 accent-emerald-500" />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save local card'}
        </button>
      </div>
    </form>
  );
};
