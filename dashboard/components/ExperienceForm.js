'use client';

import { Loader2, Save, X } from 'lucide-react';
import { ExperienceCategoryBadge } from './ExperienceCategoryBadge';
import { EXPERIENCE_CATEGORIES } from './ExperienceFilters';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const emptyExperience = {
  title: '',
  slug: '',
  description: '',
  category: 'boat_tour',
  tags: [],
  target_guest_types: [],
  price: '',
  commission_percentage: '',
  partner_name: '',
  partner_contact: '',
  booking_url: '',
  image_url: '',
  priority: 0,
  active: true,
  vip_only: false,
  indoor: false,
  weather_dependent: false,
  language: 'en',
  metadata: {}
};

const targetGuestTypes = ['couples', 'family', 'kids', 'vip', 'business', 'repeat_guest', 'honeymoon'];

const toCsv = (value) => Array.isArray(value) ? value.join(', ') : value || '';
const fromCsv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

export const ExperienceForm = ({
  experience = null,
  onSubmit,
  onCancel,
  onUploadImage,
  saving = false
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const inputClass = ui.input(isLight);
  const form = {
    ...emptyExperience,
    ...(experience || {})
  };

  const updateAndSubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const imageFile = data.get('image_file');
    const uploadedImageUrl = imageFile?.size && onUploadImage
      ? await onUploadImage(imageFile)
      : null;
    const payload = {
      ...form,
      title: data.get('title'),
      slug: data.get('slug'),
      description: data.get('description'),
      category: data.get('category'),
      tags: fromCsv(data.get('tags')),
      target_guest_types: fromCsv(data.get('target_guest_types')),
      price: data.get('price'),
      commission_percentage: data.get('commission_percentage'),
      partner_name: data.get('partner_name'),
      partner_contact: data.get('partner_contact'),
      booking_url: data.get('booking_url'),
      image_url: uploadedImageUrl || data.get('image_url'),
      priority: data.get('priority'),
      active: data.get('active') === 'on',
      vip_only: data.get('vip_only') === 'on',
      indoor: data.get('indoor') === 'on',
      weather_dependent: data.get('weather_dependent') === 'on',
      language: data.get('language') || 'en'
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={updateAndSubmit} className={`rounded-xl border p-5 ${ui.surface(isLight)}`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>{experience?.id ? 'Edit experience' : 'New experience'}</p>
          <h2 className={`mt-2 text-xl ${ui.text.title(isLight)}`}>Concierge catalog item</h2>
          <p className={`mt-1 ${ui.text.body(isLight)}`}>This is used by the AI only inside the active hotel workspace.</p>
        </div>
        <ExperienceCategoryBadge category={form.category} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
        <input name="title" defaultValue={form.title} placeholder="Title" className={inputClass} required />
        <input name="slug" defaultValue={form.slug} placeholder="slug-auto-if-empty" className={inputClass} />
        <select name="category" defaultValue={form.category} className={inputClass}>
          {EXPERIENCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      <textarea
        name="description"
        defaultValue={form.description}
        placeholder="Describe the experience like a local concierge would."
        rows={4}
        className={`${inputClass} mt-3 w-full`}
        required
      />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <input name="tags" defaultValue={toCsv(form.tags)} placeholder="Tags: sunset, cala, premium" className={inputClass} />
        <input name="target_guest_types" defaultValue={toCsv(form.target_guest_types)} placeholder={`Targets: ${targetGuestTypes.join(', ')}`} className={inputClass} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <input name="price" type="number" step="0.01" min="0" defaultValue={form.price ?? ''} placeholder="Price EUR" className={inputClass} />
        <input name="commission_percentage" type="number" step="0.01" min="0" defaultValue={form.commission_percentage ?? ''} placeholder="Commission %" className={inputClass} />
        <input name="priority" type="number" defaultValue={form.priority || 0} placeholder="Priority" className={inputClass} />
        <select name="language" defaultValue={form.language || 'en'} className={inputClass}>
          <option value="en">English</option>
          <option value="es">Espanol</option>
          <option value="fr">Francais</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <input name="partner_name" defaultValue={form.partner_name || ''} placeholder="Partner name" className={inputClass} />
        <input name="partner_contact" defaultValue={form.partner_contact || ''} placeholder="Partner contact" className={inputClass} />
        <input name="booking_url" defaultValue={form.booking_url || ''} placeholder="Booking URL" className={inputClass} />
        <input name="image_url" defaultValue={form.image_url || ''} placeholder="Image URL" className={inputClass} />
        <input name="image_file" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {[
          ['active', 'Active', form.active],
          ['vip_only', 'VIP only', form.vip_only],
          ['indoor', 'Indoor', form.indoor],
          ['weather_dependent', 'Weather dependent', form.weather_dependent]
        ].map(([name, label, checked]) => (
          <label key={name} className={cn(ui.badge(isLight, name === 'active' ? 'emerald' : 'slate'), 'cursor-pointer gap-2')}>
            <input name={name} type="checkbox" defaultChecked={checked} className="h-3.5 w-3.5 accent-emerald-500" />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className={ui.button(isLight, 'ghost')}>
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : null}
        <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save experience
        </button>
      </div>
    </form>
  );
};
