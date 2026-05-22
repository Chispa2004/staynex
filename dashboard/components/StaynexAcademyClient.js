'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Compass,
  Inbox,
  Languages,
  LifeBuoy,
  PlugZap,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Users
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { cn } from '@/lib/ui/styles';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const roleCopy = {
  admin: {
    label: 'Admin',
    description: 'Guia completa para preparar el hotel, activar canales y supervisar la operacion.'
  },
  owner: {
    label: 'Admin',
    description: 'Guia completa para preparar el hotel, activar canales y supervisar la operacion.'
  },
  manager: {
    label: 'Admin',
    description: 'Guia completa para preparar el hotel, activar canales y supervisar la operacion.'
  },
  receptionist: {
    label: 'Receptionist',
    title: 'Receptionist Academy',
    description: 'Guia operativa para trabajar rapido con Inbox, tickets, traducciones, AI Copilot y conocimiento del hotel.'
  }
};

const adminSteps = [
  'Revisar datos del hotel',
  'Conectar PMS',
  'Configurar WhatsApp',
  'Crear habitaciones y QR Rooms',
  'Anadir experiencias',
  'Anadir Local Knowledge',
  'Invitar recepcionistas',
  'Probar una conversacion',
  'Activar uso con huespedes'
];

const receptionistSteps = [
  'Revisar Inbox',
  'Entender badges y Needs human',
  'Usar traduccion',
  'Gestionar tickets',
  'Usar AI Copilot y suggested replies',
  'Actualizar Knowledge Base operativa',
  'Escalar incidencias'
];

const modules = [
  {
    id: 'first-steps',
    icon: ClipboardList,
    roles: ['admin', 'receptionist'],
    title: 'Primeros pasos',
    summary: 'El mapa rapido para empezar sin perderse.',
    what: 'Staynex centraliza conversaciones, reservas, tickets, experiencias y conocimiento local en un unico panel operativo.',
    use: 'Sirve para que el equipo sepa que revisar primero y que modulo usar en cada situacion.',
    actions: ['Completa el checklist inicial.', 'Abre Inbox para ver conversaciones reales.', 'Revisa tickets abiertos y solicitudes pendientes.'],
    example: 'Antes de activar QR en habitaciones, el admin conecta PMS y recepcion prueba una conversacion interna.',
    mistakes: ['Empezar con huespedes sin probar WhatsApp.', 'Crear experiencias sin revisar que pertenecen al hotel correcto.'],
    recommendation: 'Haz una prueba completa como si fueras un huesped antes del piloto real.'
  },
  {
    id: 'hotel-setup',
    icon: Users,
    roles: ['admin'],
    title: 'Configuracion del hotel',
    summary: 'Datos basicos, usuarios y reglas operativas.',
    what: 'Es la zona donde el admin mantiene identidad del hotel, usuarios y configuracion esencial.',
    use: 'Evita que recepcion trabaje con datos incompletos o accesos incorrectos.',
    actions: ['Revisa nombre, idioma y WhatsApp.', 'Invita solo admins y recepcionistas necesarios.', 'Comprueba permisos antes de abrir el uso al equipo.'],
    example: 'Admin crea una recepcionista para el hotel y confirma que solo ve las pantallas operativas que necesita.',
    mistakes: ['Dar acceso admin a todo el equipo.', 'No revisar el hotel activo antes de configurar.'],
    recommendation: 'Empieza simple: un admin responsable y recepcionistas operativos.'
  },
  {
    id: 'pms',
    icon: PlugZap,
    roles: ['admin'],
    title: 'PMS',
    summary: 'Conexion de reservas reales del hotel.',
    what: 'Permite sincronizar reservas desde Apaleo y futuros PMS.',
    use: 'Da contexto a Staynex: fechas, habitacion, huesped, idioma y estado de estancia.',
    actions: ['Conecta credenciales.', 'Ejecuta test de conexion.', 'Sincroniza reservas en lotes seguros.', 'Revisa errores de sync.'],
    example: 'El hotel importa 500 reservas sin bloquear el panel porque Staynex procesa por lotes.',
    mistakes: ['Reintentar muchas veces sin revisar el error.', 'Usar credenciales de otro hotel.'],
    recommendation: 'Haz primero una sincronizacion de prueba y revisa Reservations.'
  },
  {
    id: 'whatsapp-qr',
    icon: QrCode,
    roles: ['admin'],
    title: 'WhatsApp y QR Rooms',
    summary: 'Entrada principal del huesped al concierge.',
    what: 'Los QR abren WhatsApp con contexto de hotel y habitacion.',
    use: 'Ayuda a que el mensaje llegue al tenant correcto y recepcion sepa desde donde escribe el huesped.',
    actions: ['Comprueba el numero WhatsApp del hotel.', 'Genera QR solo con habitaciones reales.', 'Prueba un QR antes de imprimirlo.'],
    example: 'Huesped escanea QR de habitacion 208 y Staynex guarda ese contexto en la conversacion.',
    mistakes: ['Usar QR demo.', 'Imprimir QR antes de conectar el WhatsApp correcto.'],
    recommendation: 'Valida tres habitaciones reales antes de desplegar todos los QR.'
  },
  {
    id: 'inbox',
    icon: Inbox,
    roles: ['admin', 'receptionist'],
    title: 'Inbox',
    summary: 'Centro de conversaciones con huespedes.',
    what: 'Muestra mensajes, respuestas de IA, conversaciones pendientes y necesidades humanas.',
    use: 'Recepcion revisa lo que la IA resolvio y actua donde hay Needs human.',
    actions: ['Revisa conversaciones marcadas.', 'Comprueba traducciones.', 'Responde cuando haga falta.', 'Abre tickets o reservas asociadas.'],
    example: 'Huesped dice que el aire acondicionado no funciona; Staynex crea ticket y recepcion lo sigue.',
    mistakes: ['Ignorar Needs human.', 'Responder sin comprobar idioma de envio.'],
    recommendation: 'Inbox es la pantalla principal de recepcion durante el turno.'
  },
  {
    id: 'tickets',
    icon: TicketCheck,
    roles: ['admin', 'receptionist'],
    title: 'Tickets',
    summary: 'Incidencias operativas ordenadas por prioridad.',
    what: 'Convierte solicitudes del huesped en tareas claras para recepcion o departamentos.',
    use: 'Evita que se pierdan problemas como limpieza, mantenimiento, ruido o amenities.',
    actions: ['Filtra por urgencia.', 'Actualiza estado.', 'Cierra solo cuando este resuelto.', 'Escala si hay riesgo.'],
    example: 'Ruido en habitacion: ticket high priority y seguimiento por recepcion.',
    mistakes: ['Cerrar sin resolver.', 'No actualizar estado cuando el equipo ya actuo.'],
    recommendation: 'Revisa tickets al inicio, mitad y final del turno.'
  },
  {
    id: 'reservations',
    icon: CalendarDays,
    roles: ['admin'],
    title: 'Reservas',
    summary: 'Contexto PMS para entender cada estancia.',
    what: 'Lista reservas, fechas, habitacion, estado y enlace WhatsApp.',
    use: 'Permite validar quien escribe, fechas de estancia y detalles operativos.',
    actions: ['Busca por nombre, telefono o habitacion.', 'Abre detalle lateral.', 'Comprueba llegada/salida antes de responder.'],
    example: 'Huesped pide late checkout; recepcion revisa departure date antes de contestar.',
    mistakes: ['Responder sin revisar estancia activa.', 'Confundir reservas de otro hotel.'],
    recommendation: 'Usa Reservations para confirmar datos antes de acciones sensibles.'
  },
  {
    id: 'experience-bookings',
    icon: CalendarCheck,
    roles: ['admin'],
    title: 'Experience Bookings',
    summary: 'Solicitudes reales de experiencias detectadas por la IA.',
    what: 'Cuando un huesped quiere reservar una experiencia, Staynex crea una solicitud operativa.',
    use: 'Recepcion confirma disponibilidad, contacta al proveedor si aplica y cambia estado.',
    actions: ['Revisa pendientes.', 'Asigna responsable.', 'Confirma o rechaza.', 'Anade notas internas.'],
    example: 'Huesped pide una experiencia local; se crea una solicitud pendiente para que el equipo revise disponibilidad.',
    mistakes: ['Decir confirmado antes de verificar.', 'No actualizar lead_status o notas.'],
    recommendation: 'La IA solicita; recepcion confirma.'
  },
  {
    id: 'experiences',
    icon: Compass,
    roles: ['admin'],
    title: 'Experiences',
    summary: 'Actividades, servicios y experiencias que la IA puede recomendar.',
    what: 'Catalogo propio del hotel con precio, proveedor visible, tags y reglas operativas.',
    use: 'Hace que la IA recomiende opciones reales del hotel, no contenido generico.',
    actions: ['Crea experiencias claras.', 'Activa solo las disponibles.', 'Anade tags family, romantic, VIP o indoor.', 'Incluye proveedor y precio si existe.'],
    example: 'Recepcion crea "Local sunset experience" y la IA la recomienda cuando preguntan por planes cercanos.',
    mistakes: ['Duplicar experiencias.', 'No desactivar una experiencia no disponible.'],
    recommendation: 'Mantén 5-10 experiencias fuertes antes de crecer el catalogo.'
  },
  {
    id: 'local-knowledge',
    icon: BookOpen,
    roles: ['admin', 'receptionist'],
    title: 'Local Knowledge',
    summary: 'Consejos locales y recomendaciones no necesariamente monetizables.',
    what: 'Tarjetas simples para restaurantes, playas, FAQs, tips insider y lugares cercanos.',
    use: 'Da tono local y humano a la IA sin crear una wiki pesada.',
    actions: ['Anade tips cortos.', 'Marca audiencia: family, romantic, VIP.', 'Prioriza lo que recepcion recomienda de verdad.'],
    example: 'Recepcion anade un lugar tranquilo recomendado para parejas y la IA lo menciona en contexto romantico.',
    mistakes: ['Textos demasiado largos.', 'Recomendaciones sin tags.'],
    recommendation: 'Escribe como hablaria un concierge local.'
  },
  {
    id: 'ai-copilot',
    icon: Sparkles,
    roles: ['admin', 'receptionist'],
    title: 'AI Copilot',
    summary: 'Ayuda interna para entender conversaciones y responder mejor.',
    what: 'AI Copilot resume la conversacion, detecta sentimiento, prioridad, idioma, tickets abiertos y posibles siguientes pasos.',
    use: 'Recepcion puede responder mas rapido sin perder contexto, especialmente cuando hay varios mensajes o cambio de turno.',
    actions: ['Lee el resumen antes de responder.', 'Usa suggested replies como borrador editable.', 'Comprueba prioridad y sentimiento.', 'Escala si Copilot marca riesgo alto.'],
    example: 'Huesped molesto por ruido: Copilot marca prioridad alta, resume el caso y sugiere una respuesta empatica.',
    mistakes: ['Enviar una sugerencia sin revisarla.', 'Ignorar riesgo alto en quejas repetidas.'],
    recommendation: 'Usa Copilot como segunda mirada, no como piloto automatico.'
  },
  {
    id: 'human-control',
    icon: Users,
    roles: ['admin', 'receptionist'],
    title: 'Control humano',
    summary: 'Cuando recepcion debe tomar la conversacion.',
    what: 'Staynex marca conversaciones que necesitan intervencion humana por urgencia, queja, sensibilidad o baja confianza repetida.',
    use: 'Evita que el huesped se quede esperando cuando la IA no debe resolver sola.',
    actions: ['Abre conversaciones Needs human.', 'Lee original y traduccion.', 'Responde con tono claro.', 'Crea o actualiza ticket si hay accion operativa.'],
    example: 'Huesped dice que no puede dormir por ruido; recepcion toma control y confirma que el equipo lo revisa.',
    mistakes: ['Responder demasiado generico.', 'No actualizar ticket despues de actuar.'],
    recommendation: 'En incidencias, reconoce la molestia y da el siguiente paso concreto.'
  },
  {
    id: 'urgencies',
    icon: ShieldCheck,
    roles: ['admin', 'receptionist'],
    title: 'Urgencias e incidencias',
    summary: 'Como detectar casos que no deben esperar.',
    what: 'Incluye emergencias reales, seguridad, salud, problemas graves de habitacion, enfado fuerte o posible mala experiencia.',
    use: 'Ayuda a priorizar y escalar sin depender solo de la IA.',
    actions: ['Marca urgencias como high o urgent.', 'Escala a manager si hay riesgo.', 'Evita vender servicios en quejas.', 'Cierra el caso solo cuando este resuelto.'],
    example: 'Aire acondicionado roto en noche calurosa: ticket urgente y respuesta breve, humana y concreta.',
    mistakes: ['Ofrecer upsells durante una queja.', 'Pedir demasiados datos en una urgencia.'],
    recommendation: 'Primero resolver y tranquilizar; despues documentar.'
  },
  {
    id: 'translation',
    icon: Languages,
    roles: ['admin', 'receptionist'],
    title: 'Traduccion automatica',
    summary: 'Recepcion lee en su idioma y el huesped recibe el suyo.',
    what: 'Staynex detecta idioma del huesped y permite leer traducciones operativas.',
    use: 'Reduce friccion cuando recepcion no habla el idioma del huesped.',
    actions: ['Selecciona "Leer en" en Inbox.', 'Revisa original si algo parece raro.', 'Confirma el idioma de envio antes de responder.'],
    example: 'Huesped aleman pregunta por desayuno; recepcion lo lee en espanol y responde en espanol; el huesped recibe aleman.',
    mistakes: ['Enviar texto manual en otro idioma sin revisar.', 'No mirar el original en mensajes delicados.'],
    recommendation: 'Para quejas, lee original y traduccion antes de responder.'
  },
  {
    id: 'ai-concierge',
    icon: Bot,
    roles: ['admin', 'receptionist'],
    title: 'IA Concierge',
    summary: 'Asistente que responde, detecta oportunidades y escala incidencias.',
    what: 'La IA contesta preguntas frecuentes, usa contexto del hotel y crea tickets o solicitudes cuando hace falta.',
    use: 'Ahorra tiempo, pero recepcion sigue controlando casos operativos importantes.',
    actions: ['Revisa la respuesta antes de tomar control.', 'Corrige Knowledge Base si falta informacion.', 'No dependas de la IA para confirmar disponibilidad humana.'],
    example: 'La IA responde horario de desayuno; para una queja de ruido crea ticket y evita vender.',
    mistakes: ['Tratar la IA como confirmacion final de reservas.', 'No mejorar knowledge tras errores repetidos.'],
    recommendation: 'La IA debe sonar como concierge, no como vendedor.'
  },
  {
    id: 'privacy',
    icon: ShieldCheck,
    roles: ['admin'],
    title: 'Privacidad y datos',
    summary: 'Retencion y anonimizacion GDPR.',
    what: 'Staynex puede anonimizar datos personales tras checkout y conservar analitica agregada.',
    use: 'Ayuda al hotel a explicar una politica de retencion clara.',
    actions: ['Revisa los dias de retencion.', 'Confirma que la politica esta aprobada por el hotel.', 'Consulta el ultimo estado de limpieza.'],
    example: 'Datos personales se anonimizan tras 30 dias; revenue y conteos quedan para analitica.',
    mistakes: ['Cambiar la politica sin revisarla internamente.', 'Confundir analitica agregada con datos personales.'],
    recommendation: 'Manten una politica clara y facil de explicar al equipo.'
  },
  {
    id: 'best-practices',
    icon: Sparkles,
    roles: ['admin', 'receptionist'],
    title: 'Buenas practicas',
    summary: 'Rutina simple para que Staynex se sienta solido.',
    what: 'Habitos de uso para mantener conversaciones, tickets y experiencias bajo control.',
    use: 'Reduce errores, duplicados y tiempos de respuesta.',
    actions: ['Empieza turno revisando Inbox y tickets.', 'Usa notas internas.', 'Mantén experiencias activas limpias.', 'Escala lo urgente rapido.'],
    example: 'Cada cambio de turno revisa pendientes y bookings antes de cerrar sesion.',
    mistakes: ['Dejar solicitudes pending sin responsable.', 'Responder sin contexto de reserva.'],
    recommendation: 'Una rutina simple vale mas que configurar demasiadas cosas.'
  },
  {
    id: 'faq',
    icon: LifeBuoy,
    roles: ['admin', 'receptionist'],
    title: 'Preguntas frecuentes',
    summary: 'Respuestas rapidas para dudas comunes.',
    what: 'Mini FAQ interna para el equipo del hotel.',
    use: 'Ayuda a decidir donde mirar cuando algo no aparece o la IA no responde como esperabas.',
    actions: ['Si falta una respuesta, revisa Knowledge Base o Local Knowledge.', 'Si falta una reserva, revisa PMS sync.', 'Si falta una experiencia, comprueba que este activa.'],
    example: 'La IA no recomienda un restaurante: falta en Local Knowledge o no tiene tags correctos.',
    mistakes: ['Crear tickets para problemas de configuracion.', 'Usar datos demo para pruebas reales.'],
    recommendation: 'Si algo se repite, conviertelo en knowledge o proceso.'
  }
];

const getVisibleModules = (role) => {
  const normalizedRole = ['owner', 'admin', 'manager'].includes(role) ? 'admin' : role;

  return modules.filter((item) => item.roles.includes(normalizedRole));
};

const getChecklist = (role) => (
  role === 'receptionist' ? receptionistSteps : adminSteps
);

export const StaynexAcademyClient = () => {
  const [context, setContext] = useState(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState('first-steps');
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const response = await fetch('/api/current-hotel', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!cancelled && response.ok) {
        setContext(body);
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setContext(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const role = context?.role || 'receptionist';
  const roleMode = role === 'receptionist' ? 'receptionist' : 'admin';
  const storageKey = `staynex_academy_progress_${context?.user?.id || 'local'}_${roleMode}`;
  const checklist = useMemo(() => getChecklist(roleMode), [roleMode]);
  const visibleModules = useMemo(() => getVisibleModules(roleMode), [roleMode]);
  const filteredModules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return visibleModules;
    }

    return visibleModules.filter((item) => [
      item.title,
      item.summary,
      item.what,
      item.use,
      item.example,
      item.recommendation,
      ...item.actions,
      ...item.mistakes
    ].join(' ').toLowerCase().includes(normalizedQuery));
  }, [query, visibleModules]);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored) {
      try {
        setCompletedSteps(JSON.parse(stored));
      } catch {
        setCompletedSteps([]);
      }
    } else {
      setCompletedSteps([]);
    }
  }, [storageKey]);

  const toggleStep = (step) => {
    setCompletedSteps((current) => {
      const next = current.includes(step)
        ? current.filter((item) => item !== step)
        : [...current, step];

      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const progress = checklist.length
    ? Math.round((completedSteps.length / checklist.length) * 100)
    : 0;
  const activeRoleCopy = roleCopy[roleMode] || roleCopy.admin;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="sidebar.settings"
        fallbackTitle={activeRoleCopy.title || 'Staynex Academy'}
        fallbackDescription={activeRoleCopy.description}
      />

      <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Vista para {activeRoleCopy.label}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Roadmap operativo del hotel</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">{activeRoleCopy.description}</p>
          </div>
          <div className="min-w-44 rounded-lg border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Progreso</p>
            <p className="mt-2 text-2xl font-semibold text-white">{progress}%</p>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section className="rounded-xl border border-borderline bg-panel/80 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Checklist inicial</p>
              <h2 className="mt-2 text-lg font-semibold text-white">Activacion paso a paso</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300">
              {completedSteps.length}/{checklist.length}
            </span>
          </div>
          <div className="mt-5 space-y-2">
            {checklist.map((step, index) => {
              const completed = completedSteps.includes(step);

              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => toggleStep(step)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition',
                    completed
                      ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                  )}
                >
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    completed ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-white/10 text-slate-400'
                  )}>
                    {completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : index + 1}
                  </span>
                  <span>{step}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-borderline bg-panel/80 p-4">
            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar ayuda: PMS, WhatsApp, QR, traduccion, experiencias..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="space-y-3">
            {filteredModules.map((item) => (
              <AcademyModule
                key={item.id}
                module={item}
                open={openId === item.id}
                onToggle={() => setOpenId((current) => current === item.id ? null : item.id)}
                roleMode={roleMode}
              />
            ))}
            {filteredModules.length === 0 ? (
              <div className="rounded-xl border border-borderline bg-panel/80 p-6 text-sm text-slate-400">
                No hay resultados para esa busqueda. Prueba con Inbox, tickets, PMS, QR o experiencias.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
};

const AcademyModule = ({ module, open, onToggle, roleMode }) => {
  const Icon = module.icon;

  return (
    <article className="overflow-hidden rounded-xl border border-borderline bg-panel/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-white/[0.03]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{module.title}</span>
              <RoleBadge role={roleMode} />
            </span>
            <span className="mt-1 block text-sm leading-6 text-slate-400">{module.summary}</span>
          </span>
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-500 transition', open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>

      {open ? (
        <div className="border-t border-white/10 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <InfoBlock title="Que es" text={module.what} />
            <InfoBlock title="Para que sirve" text={module.use} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ListBlock title="Que tengo que hacer" items={module.actions} tone="emerald" />
            <ListBlock title="Errores comunes" items={module.mistakes} tone="amber" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoBlock title="Ejemplo practico" text={module.example} />
            <InfoBlock title="Recomendacion Staynex" text={module.recommendation} />
          </div>
        </div>
      ) : null}
    </article>
  );
};

const RoleBadge = ({ role }) => (
  <span className={cn(
    'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]',
    role === 'receptionist'
      ? 'border-sky-300/20 bg-sky-300/10 text-sky-100'
      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
  )}>
    {role === 'receptionist' ? 'Receptionist' : 'Admin'}
  </span>
);

const InfoBlock = ({ title, text }) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
    <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
  </div>
);

const ListBlock = ({ title, items, tone }) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
    <div className="mt-3 space-y-2">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
          <span className={cn(
            'mt-2 h-1.5 w-1.5 shrink-0 rounded-full',
            tone === 'amber' ? 'bg-amber-300' : 'bg-emerald-300'
          )} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>
);
