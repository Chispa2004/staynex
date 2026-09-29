'use client';

import { useEffect, useRef } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { X } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const PmsConnectionForm = ({
  provider,
  initialConnection,
  form,
  setForm,
  onSave,
  onClose,
  saving,
  error
}) => {
  const { tx } = useDashboardLanguage();
  const dialog = useRef(null);
  useEffect(() => { const opener=document.activeElement;dialog.current?.showModal();return ()=>{dialog.current?.close();if(opener?.isConnected)opener.focus();}; }, []);
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!provider) {
    return null;
  }

  const liveApi = provider.configurationMode === 'live_api';
  const requestActivation = (event) => {
    const targetForm = event.currentTarget.form;
    setForm((current) => ({
      ...current,
      activation_requested: true,
      connection_mode: current.connection_mode || provider.configurationMode || 'manual_setup'
    }));
    window.setTimeout(() => targetForm?.requestSubmit(), 0);
  };
  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300'
    : 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/30';
  const labelClass = isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';
  const keepFocus = event => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')];
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return (
    <dialog ref={dialog} aria-labelledby="pms-form-title" onKeyDown={keepFocus} onCancel={event=>{event.preventDefault();if(!saving)onClose();}} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-transparent p-0 backdrop:bg-slate-950/60">
      <form onSubmit={onSave} className={isLight ? 'w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/40' : 'w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1019] p-6 shadow-2xl shadow-black/40'}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="pms-form-title" className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>{tx(initialConnection ? 'Gestionar configuración' : 'Configurar')} {provider.name}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              {tx(liveApi ? 'Las credenciales se cifran al guardarse. Guardarlas no comprueba la conexión.' : 'Guarda la configuración y coordina la integración con Staynex y el proveedor. Guardar no activa ni notifica al proveedor.')}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={tx('Cerrar configuración PMS')} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:bg-white/[0.08]'}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className={labelClass}>{tx("Proveedor")}</span>
            <input className={inputClass} value={provider.name} disabled />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("Modo de conexión")}</span>
            <input className={inputClass} value={tx(liveApi ? 'API real; cuenta por verificar' : 'Configuración manual')} readOnly />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("URL base")}</span>
            <input
              className={inputClass}
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder={provider.defaultBaseUrl || 'https://api.provider.example'}
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("Identificador del establecimiento")}</span>
            <input
              className={inputClass}
              value={form.property_id}
              onChange={(event) => setForm((current) => ({ ...current, property_id: event.target.value, account_code: event.target.value }))}
              placeholder={`${provider.name} hotel/property ID`}
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("Identificador del cliente")}</span>
            <input
              className={inputClass}
              value={form.client_id}
              onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}
              placeholder={`${provider.name} client id`}
              required={liveApi}
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("Clave API")}</span>
            <input
              type="password"
              className={inputClass}
              value={form.api_key}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder={initialConnection?.api_key_configured ? tx('Deja vacío para conservar la clave actual') : `${provider.name} API key`}
            />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>{tx("Código de cuenta")}</span>
            <input
              className={inputClass}
              value={form.account_code}
              onChange={(event) => setForm((current) => ({ ...current, account_code: event.target.value }))}
              placeholder={`${provider.name} account code`}
              required={liveApi}
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className={labelClass}>{tx("Secreto del cliente")}</span>
            <input
              type="password"
              className={inputClass}
              value={form.client_secret}
              onChange={(event) => setForm((current) => ({ ...current, client_secret: event.target.value }))}
              placeholder={initialConnection?.has_client_secret ? tx('Deja vacío para conservar el secreto actual') : `${provider.name} client secret`}
              required={liveApi && !initialConnection?.has_client_secret}
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className={labelClass}>{tx("Notas")}</span>
            <textarea
              className={`${inputClass} min-h-24`}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder={tx('Notas de integración y dependencia externa pendiente.')}
            />
          </label>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-500"
            />
            <span className={isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-300'}>{tx("Habilitar esta configuración")}</span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={isLight ? 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
            {tx("Cancelar")}
          </button>
          {!liveApi ? (
            <button type="button" onClick={requestActivation} disabled={saving} className={isLight ? 'rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60' : 'rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/15 disabled:opacity-60'}>
              {tx("Guardar solicitud de integración")}
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">
            {tx(saving ? 'Guardando…' : 'Guardar configuración')}
          </button>
        </div>
      </form>
    </dialog>
  );
};
