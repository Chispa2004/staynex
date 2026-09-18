'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowRight, Users, TicketCheck } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { switchWorkspace } from '@/lib/workspace-context';
import { getFirstAllowedRoute, ROLE_LABELS } from '@/lib/permissions';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import styles from './OrganizationDirectoryClient.module.css';

export function OrganizationDirectoryClient({ platform = false, initialOrganizationId = '' }) {
  const { tx } = useDashboardLanguage();
  const [directory, setDirectory] = useState(null);
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const headers = async () => {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' };
  };
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setDirectory(null); setError('');
    (async () => {
      try {
        const params = new URLSearchParams();
        if (platform) params.set('platform', '1');
        if (organizationId) params.set('organizationId', organizationId);
        const response = await fetch(`/api/organizations?${params}`, { headers: await headers(), cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (version === generation.current) setDirectory(body);
      } catch (e) { if (e.name !== 'AbortError' && version === generation.current) setError(e.message); }
    })();
    return () => { generation.current++; controller.abort(); };
  }, [organizationId, revision, platform]);
  const enter = async hotel => {
    setBusy(true); setError('');
    try {
      const auth = await headers();
      const context = await switchWorkspace({ hotelId: hotel.id, accessToken: auth.Authorization.slice(7) });
      window.sessionStorage.removeItem('staynex_support_session');
      // A fresh document discards all previous hotel component and request state.
      window.location.assign(`${getFirstAllowedRoute(context.role)}?hotelId=${encodeURIComponent(hotel.id)}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  const manage = async (event, action) => {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    if (action !== 'create') payload.organization_id = directory.selectedOrganizationId;
    try {
      const response = await fetch('/api/organizations', { method: 'POST', headers: await headers(), body: JSON.stringify({ action, payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (action === 'create') setOrganizationId(body.result.id);
      form.reset(); setRevision(r => r + 1);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const selected = directory?.organizations.find(o => o.id === directory.selectedOrganizationId);
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>STAYNEX {platform ? ' / PLATFORM' : ''}</p><h1>{platform ? 'Cadenas y clientes' : 'Mis hoteles'}</h1><p>{platform ? 'Organizaciones y acceso a los espacios hotelarios.' : 'Tu operación, en los hoteles a los que tienes acceso.'}</p></div>
      {platform && <nav aria-label="Platform"><Link href="/platform/organizations">Cadenas</Link><Link href="/platform/hotels">Todos los hoteles</Link></nav>}
    </header>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => setRevision(r => r + 1)}>Reintentar</button></div>}
    {!directory && !error && <p role="status">Cargando tu ámbito autorizado…</p>}
    {directory && <>
      <div className={styles.scope}><label>Organización<select value={directory.selectedOrganizationId || ''} onChange={e => { setDirectory(null); setOrganizationId(e.target.value); }}>
        <option value="">{platform ? 'Todas las organizaciones' : 'Selecciona una organización'}</option>
        {directory.organizations.map(o => <option key={o.id} value={o.id}>{o.name}{o.status === 'disabled' ? ' · suspendida' : ''}</option>)}
      </select></label><span>{selected ? (selected.kind === 'independent' ? 'Cliente independiente' : 'Cadena hotelera') : 'Directorio de hoteles'}</span></div>
      {directory.requiresOrganizationSelection ? <p>Selecciona una organización para ver sus hoteles e indicadores.</p> : <>
        <section className={styles.metrics} aria-label="Indicadores del ámbito autorizado">
          {[[Building2,'Hoteles',directory.metrics?.hotels],[Users,'Users',directory.metrics?.people],[Users,'Hotel accesses',directory.metrics?.assignments],[TicketCheck,'Tickets abiertos',directory.metrics?.openTickets]].map(([Icon,label,value]) => <article key={label}><Icon size={19} aria-hidden="true"/><strong>{value ?? 0}</strong><span>{tx(label)}</span>{label === 'Hotel accesses' && <small>{tx('One person can have access to several hotels')}</small>}</article>)}
        </section>
        <section className={styles.hotels} aria-label="Hoteles autorizados">
          {directory.hotels.map(h => <article key={h.id} className={styles.hotel}>
            <div className={styles.hotelIcon}><Building2 aria-hidden="true"/></div><p className={styles.eyebrow}>{h.organizationName}</p><h2>{h.name}</h2>
            <p>{[h.city,h.country_code].filter(Boolean).join(' · ') || 'Hotel incorporado a Staynex'}</p>
            <p className={styles.role}>{h.canEnter ? tx(ROLE_LABELS[h.role] || h.role) : 'Acceso operativo suspendido'}{platform ? ' · Identidad Staynex' : ''}</p>
            <dl><div><dt>Tickets abiertos</dt><dd>{h.openTickets}</dd></div><div><dt>Urgentes abiertos</dt><dd>{h.urgentTickets}</dd></div></dl>
            <button disabled={busy || !h.canEnter} onClick={() => enter(h)}>Abrir hotel <ArrowRight size={17} aria-hidden="true"/></button>
          </article>)}
        </section>
        {!directory.hotels.length && <p>No hay hoteles disponibles en este ámbito.</p>}
      </>}
      {directory.canManage && <section className={styles.management}><h2>Administración de Staynex</h2>
        <details><summary>Crear organización</summary><form onSubmit={e => manage(e, 'create')}><label>Nombre<input name="name" required maxLength={160}/></label><label>Tipo<select name="kind"><option value="chain">Cadena</option><option value="independent">Independiente</option></select></label><button disabled={busy}>Crear organización</button></form></details>
        {selected && <>
          <details><summary>Incorporar hotel existente</summary><form onSubmit={e => manage(e, 'incorporate')}><label>UUID del hotel<input name="hotel_id" required placeholder="UUID del directorio Todos los hoteles"/></label><p>Se conservan los usuarios actuales como miembros ordinarios. Un hotel ya incorporado no puede trasladarse desde aquí.</p><button disabled={busy}>Incorporar hotel</button></form></details>
          <details><summary>Administradores y membresías de la organización</summary><form onSubmit={e => manage(e, 'member')}><label>Correo de la cuenta<input name="email" type="email" required/></label><label>Rol<select name="role"><option value="org_admin">Administrador de cadena</option><option value="member">Miembro ordinario</option></select></label><label>Estado<select name="status"><option value="invited">Invitar</option><option value="active">Activo (cuenta vinculada)</option><option value="disabled">Revocado</option></select></label><p>La invitación se vincula al iniciar sesión con ese correo. El rol de cadena concede administración en sus hoteles.</p><button disabled={busy}>Guardar membresía</button></form></details>
          <details><summary>Estado de la organización</summary><form onSubmit={e => manage(e, 'status')}><label>Estado<select name="status" defaultValue={selected.status}><option value="active">Activa</option><option value="disabled">Suspendida</option></select></label><button disabled={busy}>Guardar estado</button></form></details>
        </>}
      </section>}
    </>}
  </main>;
}
