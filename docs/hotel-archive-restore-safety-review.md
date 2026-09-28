# Archivado y recuperación de hoteles — Daniel, parte del punto 10

Base: `origin/main` `feb4e4949a38ddf78601d1d834824808cb607eea`, comprobada el 28/09/2026.
Rama: `codex/hotel-archive-restore-safety`. Organizaciones/PR #11 y proveedores de experiencias como producto quedan fuera.

## Defecto reproducido y alcance

Se reutilizó D8 del informe local de Daniel. Se ejecutó además `archiveHotelWorkspace` de la base exacta contra transporte sintético: el fallo intermedio de tickets devolvía `ok:true`; accesos active/disabled/invited terminaban todos disabled; un mensaje sent pasaba a cancelled; una conexión disabled perdía su sync_status previo. La evidencia privada `baseline-reproduction.json` está fuera de Git. No se ejecutó esa reproducción en producción.

El recorrido anterior era `PlatformConsoleClient` → DELETE `/api/platform/hotels/[id]` → `dashboard/lib/platform.js`. Nueve actualizaciones independientes modificaban hotel_users, hotel_pms_connections, automations, automation_events, scheduled_messages, conversations, tickets, reservations y experience_booking_requests. El fallback incluso cambiaba nombre, slug y descripción ante cualquier error. No había restauración en Platform ni borrado físico de hotels en los endpoints/SQL de producto revisados. El texto «permanently remove» era incorrecto. No se añade eliminación definitiva.

## Contrato nuevo

| Acción | Efecto exacto |
| --- | --- |
| Archivar | Bloquea el espacio operativo y excluye el hotel de métricas activas. Guarda estado anterior, actor y fecha; cambia únicamente los marcadores de archivo del hotel y añade una suspensión operativa persistente. Conserva nombre, UUID, slug, datos, configuración y las nueve colecciones relacionadas sin reescribirlas. |
| Restaurar | Recupera el estado anterior del hotel y limpia los marcadores de archivo. El acceso vuelve a evaluarse con las asignaciones actuales. No acepta invitaciones, no rehabilita usuarios/conexiones, no cambia IA/live ni reinicia colas. Mantiene la suspensión de actividad automática y conectores. |
| Eliminar definitivamente | No existe en este flujo; no se incorpora. El método HTTP DELETE sigue siendo archivo por compatibilidad, con confirmación explícita y nombre visible. |

`shared/hotels/lifecycle.js` centraliza archivo/suspensión. `dashboard/lib/hotel-lifecycle.js` valida rol interno, UUID, confirmación y respuesta completa del RPC. El handler mantiene `getPlatformContext(requireAdmin:true)`; soporte y perfiles hotelarios no pueden mutar ningún hotel. El RPC vuelve a comprobar una asignación interna activa del actor acreditado por el servidor. No acepta un rol enviado por el navegador. El UUID de la ruta es el destino; un hotelId ajeno en el cuerpo no lo sustituye.

`hotel_lifecycle_v1` bloquea la fila del hotel (`FOR UPDATE`) y modifica hotel y registro privado en una transacción. El registro privado tiene RLS, sin grants a anon/authenticated/service_role; solo el RPC SECURITY DEFINER puede modificarlo. Actor y timestamps quedan en ese registro. El registro conserva el ciclo actual/último, no se presenta como una auditoría histórica inmutable de todos los ciclos.

- Repetir archivo no sobrescribe el estado anterior. Repetir restauración tras perder respuesta conserva el resultado.
- El `updated_at` esperado impide que una solicitud antigua vuelva a archivar tras una restauración; el `archived_at` esperado impide restaurar un ciclo posterior.
- Cambios relacionados posteriores se conservan porque nunca se copian estados antiguos sobre ellos. Cambios incompatibles de los marcadores protegidos son rechazados, o generan conflicto si una operación privilegiada externa los cambió. No existe resolución automática ni promoción de permisos.
- El trigger del hotel impide archivar mediante escrituras ordinarias de status/nombre/metadata sin el registro administrativo y restaurar archivos históricos sin estado previo acreditado. Conserva `archive_operational_hold` incluso si otra pantalla guarda metadata antigua. Metadata no-objeto se rechaza sin sobrescribirla.
- Un trigger de invitaciones serializa activaciones con el archivo. No activa invitaciones ni asignaciones por restaurar.
- Archivo histórico sin registro: permanece archivado; UI explica que necesita revisión y RPC rechaza restauración. Sin backfill ni estados inferidos.
- Fallo intermedio revierte hotel y registro. RPC ausente/fallo/incompleto: error, sin fallback que modifique nombre o estados. UI retiene el diálogo, anuncia error y permite reintentar. Timeout de 15 s significa resultado sin confirmar, nunca prueba de ausencia de escritura.

## Límites operativos e intentos en curso

Dashboard conserva identidad interna pero entrega contexto operativo bloqueado y sin permisos para hoteles archivados; selector excluye archivos. La guarda también cubre entrada de huéspedes, mutación PMS de reservas, test/sync de conexiones, perfil para prompts, programación, reemplazos futuros de automatizaciones, envío manual y correo a proveedor con hotel identificado. Salud muestra la suspensión tras restaurar y no permite activar IA para eludirla.

El gate central `shouldAiAutoRespond` y la evaluación de elegibilidad rechazan archivo/suspensión. El contrato de despacho SQL/JS existente **no cambia**: su comparación del snapshot de metadata en begin detecta cambios previos al comienzo. Un intento que cruzó begin antes del archivo puede seguir en curso; no se promete cancelación retroactiva ni se reencola lo incierto. Los workers pueden registrar un bloqueo mediante su contrato existente; la acción de archivo/restauración no reescribe mensajes ni evidencias de despacho.

La suspensión operativa permanece después de restaurar para impedir reanudación implícita de pendientes. No se incorpora un botón de reactivación global. Una eventual reanudación necesita revisar conexiones, elegibilidad y cola por separado; esa revisión no autoriza reintentar intentos inciertos. Los flags globales y ai_auto_reply_enabled/hotel_live_mode no se cambian por estas acciones.

## Pruebas y evidencia

- Reproducción de la implementación anterior con estados mixtos/fallo intermedio: defecto acreditado, sin red.
- `test:hotel-lifecycle` — 5 grupos PASS locales: handlers reales, autorización/UUID/confirmación, fallos e identidad de respuesta, estado histórico/suspensión, elegibilidad y handlers React reales (error, reintento, respuesta incompleta, hotel correcto).
- `test:hotel-lifecycle-postgres` — 20 grupos PASS locales, incluido el esquema remoto sin columnas de archivo: migración repetible/permisos, catálogo incompatible, roles y hoteles rechazados, nueve colecciones conservadas, idempotencia, versiones antiguas, rollback/recuperación de ambas acciones, ocho sesiones concurrentes por operación y carrera entre ciclos, revocaciones posteriores, invitaciones, rechazo de escrituras directas que eluden archivo/restauración, archivos históricos, conflicto, estado previo disabled, metadata incompatible y ausencia de borrado/reencolado. PostgreSQL 17.10 local desechable, network=none, sin volúmenes ni proveedores.
- Regresiones ampliadas de auth-hotel-context, manual-send y automation-runtime-phase2a1: hotel archivado bloqueado con identidad interna conservada; cero traducciones/proveedor/escrituras de envío; cero reemplazos de cola bajo suspensión.
- Fixtures de consumidores actualizados para incluir el hotel consultado y la función real de archivo; no se relajan aserciones de ámbito ni envío.
- `ci:critical` incorpora la suite nueva; `ci:postgres` incorpora PostgreSQL real. El job de Knowledge no sustituye las pruebas nuevas.
- Build local PASS (`ci:dashboard`, 64/64 páginas), sintaxis PASS y `git diff --check` PASS. `ci:postgres` completo PASS; tras reforzar el trigger se repitieron los 20 grupos de lifecycle con PASS. Los nuevos controles están incorporados a los jobs critical y postgres, pero no se ha ejecutado GitHub CI para esta rama.
- Navegador local: componente real y traducciones reales con sesión/transporte sintéticos a 1280×720 y 390×844. Cancelar enfocado al abrir, Tab/Shift+Tab confinados, Escape devuelve foco, error visible y reintento, confirmación de archivo/restauración y textos sin overflow (viewport/scrollWidth 390). Se corrigió el foco observado bajo React Strict Mode. Las capturas privadas `archive-desktop.png` y `restore-mobile.png` quedan fuera de Git.
- El montaje visual usa transporte en memoria; no acredita Auth/RLS remoto. Persistencia, rollback y concurrencia se acreditan separadamente con PostgreSQL, no por las etiquetas del laboratorio.
- `ci:critical`: las suites anteriores a HTTP Security pasan localmente. La última falla por la aserción estática de salto LF en dashboard/lib/demo.js cuando el checkout Windows contiene CRLF. Se comprobó que el blob de base y HEAD es idéntico y tiene LF; HTTP Security completo pasa con ese blob exacto en una copia privada. No se alteró la prueba ni el archivo versionado. El comando completo en el checkout CRLF no se presenta como PASS. Los fallos históricos de Guest AI fuera de este conjunto no se declaran corregidos.

## Migración preparada, no aplicada

SQL exacto: `supabase/sql/add_hotel_lifecycle.sql`. Preflight: `supabase/sql/preflight_hotel_lifecycle.sql`, transacción READ ONLY con columnas, tipos, constraints, triggers, políticas, grants y conteos de incompatibilidades sin datos de huéspedes. Lectura OpenAPI de PostgREST el 28/09/2026 10:18 UTC: destino `vblxmnqbatqrynfaasmf`, metadata jsonb presente; status y los cuatro campos archived/deleted ausentes; RPC nuevo ausente. Evidencia privada `catalog-read.json`, sin filas de huéspedes. Esta lectura acredita el catálogo expuesto de ese proyecto, no sustituye el preflight SQL de constraints/triggers/permisos ni confirma por sí sola las variables efectivas de cada despliegue. No se ha ejecutado SQL remoto.

Incluye dentro de la misma transacción el prerrequisito incremental de campos de archivo ya definido en `add_hotel_archive_fields.sql`: deleted_at, archived_at, archived_by, archived_reason y status text DEFAULT active, solo si faltan. Se ha reproducido precisamente su ausencia remota. Mantiene definitions y datos existentes y aborta/rollback ante tipos incompatibles. Requiere metadata jsonb y hotel_users con user_id/status/platform_role. El default active para la columna nueva no restaura los archivos históricos por sufijo/metadata: siguen bloqueados y sin recuperación inferida. No cambia filas de asignaciones ni flags. Además crea el registro privado, RPC y triggers indicados. No hace backfills, no borra, no toca el contrato de despacho ni concede acceso a clientes. Si el preflight detecta otras incompatibilidades, detenerse y preparar el ajuste exacto para revisión; no ejecutar otras migraciones en bloque.

Orden de publicación para revisión:

1. Revisar esta migración y autorizar su aplicación; confirmar por lectura el destino efectivo de backend y servidor Dashboard (`vblxmnqbatqrynfaasmf`) y ejecutar el preflight exacto. Verificar también ausencia/conflictos de objetos homónimos y propietarios de SECURITY DEFINER. Conservar inventarios privados.
2. Impedir temporalmente el uso del DELETE antiguo de Platform y drenar sus solicitudes ya iniciadas; comprobar que no queda ninguno ejecutando las nueve actualizaciones. Mantener Dashboard/Inbox disponibles. No se ha aplicado todavía ningún bloqueo ni cambio de configuración.
3. Conservar SEND_AUTOMATIONS=false y Guest Memory OFF. Aplicar únicamente el SQL revisado en una transacción. Comprobar firma del RPC, RLS/grants, triggers y recarga PostgREST mediante lectura; no invocar mutaciones contra hoteles reales para probar disponibilidad.
4. Con CI y revisión aprobados, merge normal. Esperar CI main, Vercel y Railway, comprobar SHA real y retirada de versiones anteriores. Mantener inhabilitado el archivado durante convivencia de versiones; los consumidores anteriores no conocen la suspensión nueva. No habilitar automáticamente archive hasta tener ambos despliegues nuevos y contrato compatible.
5. Solo entonces, con cuenta autenticada que ya tenga administración efectiva, crear por interfaz **un único** `Staynex QA archivado y recuperación`, anotar UUID y mantenerlo sin huéspedes/reservas/canales/conectores/envíos. Archivar → comprobar archivo → restaurar → comprobar datos/permisos/hold → volver a archivar. No eliminar definitivamente. Nunca utilizar Demo Checkin ni otro hotel existente.
6. Verificar Salud/Dashboard/Inbox y versiones. Registrar por separado laboratorio y evidencia pública.

Recuperación: antes del commit SQL, rollback transaccional. Tras aplicación, conservar registro/trigger y suspensión; no borrar el registro ni reconstruir estados. Ante fallo de publicación, mantener las acciones de archivo/restauración bloqueadas y corregir hacia delante. **Volver al código antiguo no es una recuperación segura**: puede reescribir relaciones y desconoce la suspensión. Ante conflicto, comparar exclusivamente hotel/registro/relaciones autorizadas y preparar resolución explícita, sin activar permisos ni reencolar incertidumbres. No se prepara un DROP destructivo como rollback.

## Estado de cierre

Comprobación de despliegues por lectura 28/09/2026: Vercel Production Ready/Latest `dpl_Cogx6FLJKcYF6TiCrwunwEvzNHeE` y Railway Active `6cbfd346-3e37-435a-8033-a9a7dffa1c4a` (1 réplica) siguen en `feb4e4949a38ddf78601d1d834824808cb607eea`, sin esta corrección. No se confunde esa disponibilidad con una verificación funcional del archivado nuevo.

Publicación de producción y prueba pública bloqueadas por la revisión/aplicación pendiente de la nueva migración. El intento de push del commit local `fa1849386ed435c5ec07565e9f622e5ee0e17b21` fue rechazado antes de ejecutarse por la revisión automática: el catálogo activo carece de campos/RPC necesarios y la instrucción prohíbe publicar código incompatible. Se solicitó aclarar la autorización de push/PR en borrador/Preview sin merge ni SQL; no se ha recibido respuesta al redactar este cierre. No hay PR ni CI remoto de esta rama. La revisión posterior añade la protección de escrituras directas y su vigésimo escenario PostgreSQL. La publicación seguirá bloqueada hasta resolver esta dependencia; no se intentó una vía alternativa. No se crea aún el hotel técnico: UUID no generado, estado final público no comprobado. Los hoteles actuales, demo, flags e inventarios permanecen intactos.

Texto exacto para Daniel en esta fase:

> Punto 10 — borrado/archivado de hoteles: corrección técnica preparada y probada en laboratorio, pendiente de revisar/aplicar la migración y verificar la publicación. Se elimina la falsa promesa de borrado permanente y la restauración indiscriminada; archivo/restauración transaccionales conservan estados relacionados, revocaciones y bloqueos operativos. No se ha verificado aún el hotel técnico en producción. El acceso a proveedores de experiencias y el cierre completo del punto 10 siguen fuera de este trabajo.
