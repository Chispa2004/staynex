'use client';

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { WHATSAPP_DEPENDENCIES, getWhatsappDependency, validateWhatsappDependency } from '../../../shared/onboarding/whatsapp-dependency.js';
import { ui } from '@/lib/ui/styles';

export const WhatsappDependency = ({hotel, canEdit, isLight, profileDirty, onSaved, onDirtyChange}) => {
  const {tx} = useDashboardLanguage();
  const [status,setStatus] = useState('');
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState(null);
  const [invalid,setInvalid] = useState(false);
  const existing = getWhatsappDependency(hotel);
  useEffect(() => {setStatus(getWhatsappDependency(hotel)||''); onDirtyChange?.(false);},[hotel]);

  const save = async event => {
    event.preventDefault();
    if (!canEdit || profileDirty || saving) return;
    setSaving(true); setMessage(null); setInvalid(false);
    try {
      const payload = {action:'save_whatsapp_dependency',hotelId:hotel.id,whatsapp_setup_status:status};
      validateWhatsappDependency(payload);
      const response = await fetch('/api/onboarding/hotel', {method:'PATCH',
        headers:{...(await getAuthHeaders()),'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error || 'No se pudo guardar la dependencia. Reintenta.'),{fields:body.fields});
      if (body.hotel?.id !== hotel.id || getWhatsappDependency(body.hotel) !== status) throw new Error('No se pudo confirmar la dependencia guardada. Reintenta.');
      onDirtyChange?.(false);
      setMessage({type:'success',text:'Dependencia guardada. WhatsApp sigue pendiente; no se han activado conexiones ni envíos.'});
      await onSaved?.(body.hotel);
    } catch(error) {
      setInvalid(Boolean(error.fields));
      setMessage({type:'error',text:error.message === 'Failed to fetch' ? 'No se pudo guardar la dependencia. Reintenta.' : error.message});
    } finally {setSaving(false);}
  };

  return <section className="mt-6 space-y-3 border-t pt-6" aria-labelledby="whatsapp-dependency-title">
    <h3 id="whatsapp-dependency-title" className="text-lg font-semibold">{tx('WhatsApp pendiente de configuración')}</h3>
    <p className="text-sm">{tx('Registra quién debe completar la configuración externa. No acredita una conexión ni permite operar en vivo.')}</p>
    {existing ? <p role="status" className="text-sm">{tx('Dependencia guardada')}: {tx(WHATSAPP_DEPENDENCIES[existing])}</p> : null}
    {hotel?.whatsapp_number || hotel?.whatsapp_setup_status ? <p className="text-sm">{tx('Este hotel ya tiene una configuración de WhatsApp. Pide a Staynex que la revise antes de registrar una dependencia.')}</p> : <form onSubmit={save} noValidate className="space-y-3">
      <label className="block space-y-2" htmlFor="whatsapp-dependency-status">
        <span>{tx('Actuación externa pendiente')}</span>
        <select id="whatsapp-dependency-status" className={`${ui.input(isLight)} w-full`} value={status} disabled={!canEdit || saving}
          aria-invalid={invalid} aria-describedby="whatsapp-dependency-help" onChange={event=>{setStatus(event.target.value);onDirtyChange?.(true);}}>
          <option value="">{tx('Selecciona la actuación pendiente')}</option>
          {Object.entries(WHATSAPP_DEPENDENCIES).map(([value,label])=><option key={value} value={value}>{tx(label)}</option>)}
        </select>
      </label>
      <p id="whatsapp-dependency-help" className="text-sm">{tx('No introduzcas números, credenciales ni datos de huéspedes. La actuación pendiente debe ser real.')}</p>
      {!canEdit ? <p>{tx('Pide a un administrador del hotel que complete este requisito.')}</p> : <button type="submit" disabled={saving || profileDirty} className={ui.button(isLight,'primary')}>
        {tx(saving ? 'Guardando...' : existing ? 'Actualizar dependencia' : 'Guardar dependencia')}
      </button>}
      {profileDirty ? <p>{tx('Guarda el perfil antes de registrar la dependencia.')}</p> : null}
    </form>}
    {message ? <p role={message.type==='error'?'alert':'status'} className="text-sm">{tx(message.text)}</p> : null}
  </section>;
};
