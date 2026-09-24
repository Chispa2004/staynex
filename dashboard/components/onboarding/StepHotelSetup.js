'use client';

import { useEffect, useRef, useState } from 'react';
import { HotelFieldErrors } from '@/components/HotelFieldErrors';
import { WhatsappDependency } from './WhatsappDependency';
import { hotelFormInput, validateHotelFields, HOTEL_FIELD_LIMITS } from '../../../shared/onboarding/hotel-fields.js';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { Building2, ShieldCheck } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const fields = [
  ['name', 'Nombre del hotel', true],
  ['brand_name', 'Marca', false],
  ['country_code', 'País', true],
  ['city', 'Ciudad', true],
  ['timezone', 'Zona horaria', true],
  ['default_language', 'Idioma por defecto', false],
  ['check_in_time', 'Hora de check-in', false],
  ['check_out_time', 'Hora de check-out', false],
  ['phone', 'Teléfono del hotel', false],
  ['whatsapp_number', 'WhatsApp del hotel', false]
];

const sanitizeError = (message) => {
  if (!message) return 'No se pudo guardar el hotel.';
  if (/supabase|postgres|schema|relation|token|secret|authorization/i.test(message)) {
    return 'No se pudo guardar. Revisa los datos y vuelve a intentarlo.';
  }

  return message;
};

const integrityLabel = (status) => {
  if (status === 'verified') return 'Verificada';
  if (status === 'manual_override') return 'Override manual';
  if (status === 'mismatch') return 'Revisar';
  return 'Pendiente';
};

export const StepHotelSetup = ({ hotel, canEdit = true, onSaved, onDirtyChange, focusField = null }) => {
  const { tx } = useDashboardLanguage();
  const [fieldErrors, setFieldErrors] = useState(null);
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const focusRef = useRef(null);
  useEffect(() => { if (focusField) focusRef.current?.focus(); }, [focusField]);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [dependencyDirty, setDependencyDirty] = useState(false);
  useEffect(() => {onDirtyChange?.(dirty || dependencyDirty);},[dirty,dependencyDirty,onDirtyChange]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setDirty(false);
    onDirtyChange?.(false);
    setForm({
      name: hotel?.name || '',
      brand_name: hotel?.brand_name || '',
      country_code: hotel?.country_code || '',
      city: hotel?.city || '',
      timezone: hotel?.timezone || '',
      timezone_integrity_status: hotel?.timezone_integrity_status || 'unverified',
      default_language: hotel?.default_language || '',
      check_in_time: hotel?.check_in_time || '',
      check_out_time: hotel?.check_out_time || '',
      address: hotel?.address || '',
      phone: hotel?.phone || '',
      whatsapp_number: hotel?.whatsapp_number || '',
      description: hotel?.description || ''
    });
  }, [hotel]);

  const update = (field, value) => { setDirty(true); onDirtyChange?.(true); setForm((current) => ({ ...current, [field]: value })); };

  const confirmTimezoneIntegrity = async (status) => {
    setSaving(true);
    setMessage(null);
    setFieldErrors(null);

    try {
      const response = await fetch('/api/onboarding/hotel', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_timezone_integrity',
          hotelId: hotel?.id,
          timezone_integrity_status: status,
          country_code: form.country_code,
          city: form.city,
          timezone: form.timezone
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudo confirmar la zona horaria.');
      }

      setMessage({
        type: 'success',
        text: status === 'manual_override'
          ? 'Override manual guardado.'
          : 'Zona horaria verificada.'
      });
      onSaved?.(body.hotel);
    } catch (error) {
      setFieldErrors(error.fields);
      setMessage({ type: 'error', text: sanitizeError(error.message) });
    } finally {
      setSaving(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();

    if (!canEdit) {
      setMessage({ type: 'error', text: 'No tienes permiso para modificar el hotel.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/onboarding/hotel', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({...validateHotelFields(hotelFormInput(form)),hotelId:hotel.id})
      });
      const body = await response.json();

      if (!response.ok) {
        throw Object.assign(new Error(body.error || 'No se pudo guardar el hotel.'), {fields:body.fields});
      }

      if (body.hotel?.id !== hotel.id) throw new Error('No se pudo confirmar el hotel guardado. Reintenta.');
      setMessage({ type: 'success', text: 'Hotel guardado.' });
      onSaved?.(body.hotel);
    } catch (error) {
      setFieldErrors(error.fields);
      setMessage({ type: 'error', text: sanitizeError(error.message) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExecutiveCard className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <ExecutiveBadge tone="emerald">Hotel</ExecutiveBadge>
          <h2 className={cn('mt-3 text-2xl font-semibold tracking-normal', ui.text.title(isLight))}>Perfil del hotel</h2>
          <p className={cn('mt-2 max-w-2xl', ui.text.body(isLight))}>
            Revisa nombre, país, ciudad y zona horaria. Solo cuenta como válido si la zona horaria está verificada o con override manual.
          </p>
        </div>
        <Building2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />
      </div>

      {focusField === 'whatsapp_number' ? <p className="mb-4 text-sm">Guardar el número no verifica la conexión. Staynex y el proveedor deben confirmar su funcionamiento antes de operar en vivo.</p> : null}
      {!canEdit ? <p className="mb-4 text-sm">Pide a un administrador del hotel que complete este requisito.</p> : null}
      <form onSubmit={save} noValidate className="space-y-5">
        <HotelFieldErrors fields={fieldErrors} prefix="onboarding" />
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map(([field, label, required]) => (
            <label key={field} className="space-y-2">
              <span className={ui.text.eyebrow(isLight)}>
                {tx(label)}{required ? ' *' : ''}
              </span>
              <input
                id={`onboarding-${field}`}
                required={required}
                aria-invalid={Boolean(fieldErrors?.[field])}
                maxLength={HOTEL_FIELD_LIMITS[field]}
                ref={field === focusField ? focusRef : undefined}
                className={`${ui.input(isLight)} w-full scroll-mt-32`}
                value={form[field] || ''}
                onChange={(event) => update(field, event.target.value)}
                readOnly={!canEdit}
              />
            </label>
          ))}
        </div>

        <label className="space-y-2">
          <span className={ui.text.eyebrow(isLight)}>Dirección</span>
          <input id="onboarding-address" maxLength={500} className={`${ui.input(isLight)} w-full`} value={form.address || ''} onChange={(event) => update('address', event.target.value)} readOnly={!canEdit} />
        </label>

        <label className="space-y-2">
          <span className={ui.text.eyebrow(isLight)}>Descripción breve</span>
          <textarea id="onboarding-description" maxLength={2000} rows={3} className={`${ui.input(isLight)} w-full`} value={form.description || ''} onChange={(event) => update('description', event.target.value)} readOnly={!canEdit} />
        </label>

        {message ? (
          <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'text-sm text-red-400' : 'text-sm text-emerald-500'}>{tx(message.text)}</p>
        ) : null}

        {dirty ? <p role="status" className="text-sm">{tx('Guarda el perfil antes de verificar la zona horaria o finalizar.')}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className={ui.badge(isLight, ['verified', 'manual_override'].includes(form.timezone_integrity_status) ? 'emerald' : 'amber')}>
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Zona horaria: {integrityLabel(form.timezone_integrity_status)}
          </span>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving || dirty} onClick={() => confirmTimezoneIntegrity('verified')} className={ui.button(isLight, 'secondary')}>
                Verificar zona horaria
              </button>
              <button type="button" disabled={saving || dirty} onClick={() => confirmTimezoneIntegrity('manual_override')} className={ui.button(isLight, 'secondary')}>
                Override manual
              </button>
              <button type="submit" disabled={saving} className={ui.button(isLight, 'primary')}>
                {saving ? 'Guardando...' : 'Guardar hotel'}
              </button>
            </div>
          ) : (
            <span className={ui.badge(isLight, 'slate')}>Solo lectura para este rol</span>
          )}
        </div>
      </form>
      {focusField === 'whatsapp_number' ? <WhatsappDependency hotel={hotel} canEdit={canEdit} isLight={isLight}
        profileDirty={dirty} onSaved={onSaved} onDirtyChange={setDependencyDirty} /> : null}
    </ExecutiveCard>
  );
};
