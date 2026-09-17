# Auditoría Badar: exclusión del envío de automatizaciones

Revisión local del 17 de septiembre de 2026. Base: `dcf3383d39acce09be7df56ff6afba36b4e62f28`.
Rama: `codex/automation-dispatch-exclusion`. No se publican código, SQL ni cambios de flags.

## Diagnóstico y recorrido real

El riesgo **no estaba resuelto en el consumidor de la cola**. En la base revisada,
`getDueScheduledMessages` seleccionaba `scheduled`, sin reclamación, y
`processScheduledMessage` llamaba a `sendWhatsAppMessage` antes de actualizar por
`id` sin condición de estado/propietario. Dos lectores podían seleccionar la misma
fila, superar las mismas guardas y ejecutar dos POST. El `catch` abarcaba proveedor,
persistencia y auditoría: también convertía una aceptación seguida de un error de
escritura en `failed`. El SID se escribía únicamente en logs.

Protecciones existentes conservadas: índice único `(hotel_id, idempotency_key)`,
runtime canónico, modo/certificación, aprobación explícita del hotel, Kill Switch,
Human Takeover y sus variantes, estado y fechas de la reserva, destinatario almacenado,
tipos exclusivos de preview y las identidades reservadas de la demo. La deduplicación
inbound y los intentos manuales de Inbox son recorridos distintos; no se sustituyen.

Recorridos revisados:

| Recorrido | Comportamiento y cobertura |
| --- | --- |
| `shared/automations/runtime.js`, `queue-writer.js` y sus adaptadores | Evalúan/escriben la cola. El runtime actual limita a preview y conserva su idempotencia. No llaman a Twilio. |
| `dashboard/lib/automation-runner.js`, `/api/automations/run` | Generan previews bajo autorización existente. No son consumidores de envío. |
| `src/services/scheduler.service.js` | Legacy desactivado por defecto; cuando se invoca explícitamente crea previews. |
| `scripts/jobs-pre-checkout-folio.js`, `jobs-post-stay-review-intelligence.js` | Previews; los tipos correspondientes continúan bloqueados para envío. |
| `message-queue.service.js` | `processDueScheduledMessages` → selección → `processScheduledMessage` → reclamación → guardas → inicio duradero → proveedor → resultado. La entrada directa usa la misma exclusión. |
| `/api/platform/monitoring`, acción `retry_automation` | Antes escribía `retry` incondicionalmente. Ahora conserva la autenticación de administrador y permisos, obtiene el hotel de la fila y usa la RPC de reintento con evidencia. Devuelve 409 si no es seguro. |
| `automation-reconciliation.service.js` | Cancela/sustituye filas mediante condiciones de estado. No envía. Cambios de fila o reserva entre claim e inicio invalidan el inicio. |

No hay cron/worker de envío registrado en `src/server.js`, ni un llamador externo
a `processDueScheduledMessages` en el código del repositorio. No se activa ninguno
en este cambio. El problema es una carencia del recorrido disponible para consumo,
no una afirmación de duplicados observados en producción. Los envíos de respuesta
inbound en `staynex.service.js` no consumen `scheduled_messages` y quedan fuera de
esta corrección.

## Contrato persistente

Migración: `supabase/sql/add_automation_dispatch_exclusion.sql`.

Añade `automation_dispatches`, con una fila de control por mensaje, identidad de
intento, lease, evidencia del proveedor e historial de los intentos sustituidos.
No modifica ni vuelve a habilitar registros existentes. Las cinco RPC son
`SECURITY DEFINER`, con `search_path` fijo: sin EXECUTE para PUBLIC/anon/authenticated;
solo `service_role` puede invocarlas. La tabla tiene RLS, lectura de servidor y no
permite modificar evidencia directamente a `service_role`.

Cada RPC bloquea primero la fila de cola del hotel solicitado y después su control
de envío. La reclamación se decide dentro de esa transacción. Un segundo consumidor
no obtiene la identidad activa. Los cambios de fase requieren la misma identidad
y un lease vigente; las actualizaciones de un worker obsoleto no afectan al actual.
No hay transacciones abiertas durante la espera del proveedor.

| Fase | Recuperación / reintento |
| --- | --- |
| `claimed` | Todavía no se permite llamar al proveedor. Tras 60 s puede reclamarse con una identidad nueva; la anterior queda invalidada. |
| `dispatching` | Inicio duradero confirmado. Puede haber alcanzado al proveedor. Nunca vuelve automáticamente a scheduled/retry. Tras 120 s, una visita del consumidor lo marca `unknown`. |
| `accepted` | Existe SID de recurso Twilio; se conserva también su estado. La cola mantiene su estado operativo `sent`, que **no acredita entrega**. No se recrea el recurso, incluso si su estado es failed/undelivered. |
| `rejected` | Rechazo explícito de API 4xx con código Twilio, excluyendo 408, o preflight local que acredita que Messages.create no se llamó. Solo 429 y preflight permiten solicitar reintento, con espera mínima de 30 s y nueva identidad. |
| `unknown` | Timeout, desconexión, 5xx, respuesta sin SID o caducidad posterior al inicio. Comprobación operativa; ningún reenvío automático. |
| `blocked` | Una guarda denegó el envío antes del proveedor. Conserva el motivo; no autoriza un reintento genérico. |

El inicio duradero compara la fila completa con la que se validó y vuelve a comprobar
en PostgreSQL los datos de hotel, reserva y estado humano usados por las guardas.
Cambios concurrentes invalidan el inicio; no se envía con el payload del llamador.
Los flags de proceso se comprueban antes de reclamar y antes del inicio. Con los
envíos desactivados, las denegaciones tempranas de demo/preview son de solo lectura;
con envíos habilitados, se persisten mediante el intento reclamado y cercado.

El adaptador de automatizaciones limita la espera a 15 s y desactiva `autoRetry` del
SDK. No presupone idempotencia de POST Messages. La documentación de Twilio distingue
[creación/aceptación y entrega](https://www.twilio.com/docs/messaging/api/message-resource)
y acredita que [429 no procesa la petición](https://www.twilio.com/docs/api/errors/20429).
Se adopta una política conservadora para 5xx, aunque un error pudiera acabar siendo
recuperable después de investigar.

Si guardar el resultado falla, puede que PostgreSQL haya confirmado la escritura
sin que su respuesta llegue al worker. No se escribe `failed` como compensación ni
se repite el POST. Se devuelve `reconciliationRequired`, y el log restringido conserva
mensaje, intento, SID disponible y tipo de resultado, sin teléfono ni contenido.
La BD permanece `dispatching` o ya `accepted`; el consumidor puede convertir el
primero en `unknown` al caducar. Fallar la auditoría posterior no altera una aceptación.

## Verificación local

**Estado Badar: resuelto localmente para este recorrido; pendiente de publicación
y aplicación autorizada de SQL.** Resultados ejecutados el 17/09/2026:

| Comprobación | Resultado |
| --- | --- |
| `npm run ci:critical` | PASS, incluidas las regresiones afectadas y 308 archivos de sintaxis |
| `npm run ci:postgres` | PASS, Knowledge/Messages y 15 escenarios nuevos de dispatch, 592 conexiones independientes |
| `npm run ci:dashboard` | PASS, compilación y 64 páginas; avisos de caché de webpack no bloqueantes |
| `git diff --check` | PASS |

Las pruebas usan Node 24.19.0, PostgreSQL 17.10 desechable con `--network none`,
sin puertos ni volúmenes persistentes. Cada consulta/RPC usa una conexión psql
independiente; las RPC se invocan como `service_role`. El proveedor se inyecta y es
simulado. `SEND_AUTOMATIONS=false` permanece en el proceso de pruebas; únicamente
la configuración inyectada del procesador habilita el recorrido.

- `npm run ci:critical`: sintaxis, contrato del adaptador y ruta de reintento,
  envío manual, Inbox, autorización, aislamiento de hoteles, controles humanos,
  Knowledge/traducción, demo, runtime foundation/phase2a1/phase2a2 y perímetro HTTP.
- `npm run ci:postgres`: conserva Knowledge/Messages e incorpora explícitamente
  `test:automation-dispatch-postgres`; Knowledge por sí solo no acredita este cierre.
- Suite de dispatch: carrera de dos workers; consumidor/reintento solapados;
  distintos mensajes/hoteles durante una llamada pendiente; worker obsoleto;
  caídas antes/después del inicio; fallo o pérdida de respuesta al persistir inicio;
  timeout/reset/5xx/408/SID ausente; aceptación con persistencia perdida antes o después
  del commit; auditoría fallida; rechazo 429 y terminal; backoff; cambio de payload,
  hotel/reserva/control humano; flags y guardas; doce slots reservados (nueve actuales
  y tres antiguos); migración ausente; permisos y repetición de la migración.
- `npm run ci:dashboard`: build de Next, sin cambios de interfaz.
- `git diff --check`: comprobación del diff.

El job de PostgreSQL del CI instala dependencias de backend y ahora se llama
`PostgreSQL knowledge and automation dispatch`. Si hay reglas remotas que exigen el
nombre anterior, deben ajustarse en la futura publicación; no se modificaron aquí.

## Publicación y recuperación futuras (no ejecutadas)

1. Mantener `SEND_AUTOMATIONS=false`. Detener/drainar **todos** los consumidores y
   reintentos antiguos, incluidos jobs fuera del repositorio y réplicas solapadas.
   Esperar su salida; investigar cualquier envío en curso antes de continuar.
   Un worker antiguo que ya ejecuta el adaptador sin claim no puede ser cercado
   retroactivamente por esta migración. No hacer rolling overlap con ese worker activo.
2. Con respaldo privado y revisión de permisos, verificar que existen las tablas y
   columnas de runtime foundation, `hotels.ai_auto_reply_enabled`, los datos de reserva
   y `conversation_ai_state`. Aplicar la migración incremental en una publicación
   autorizada. No resetear failed/retry/processing históricos: sin evidencia quedan
   fuera de la recuperación automática.
3. Publicar backend y ruta de monitoring compatibles, verificar los cinco permisos/RPC
   y los checks. Si falta SQL o una columna, el nuevo recorrido falla cerrado antes
   del proveedor. No activar flags ni nuevos jobs como parte de esta corrección.
4. Cualquier activación live futura requiere la autorización habitual, incluyendo
   hotel, certificación, estado humano y revisión de cola. No hace falta habilitar
   live para probar esta regresión: ejecutar los tests aislados.
5. Para recuperación operativa, consultar `automation_dispatches` por hotel/mensaje,
   incluyendo `previous_attempts`. Una reclamación vencida sin inicio puede recuperarse
   al volver a consumir. Un `dispatching` vencido puede visitarse con la RPC claim
   (solo servidor) para convertirlo en unknown sin llamar al proveedor, incluso si
   el consumidor normal está detenido. Contrastar SID/logs con Twilio antes de decidir
   sobre un resultado incierto. La ausencia de un callback no es evidencia de rechazo.
   No borrar el control, cambiar unknown a scheduled ni reconstruir otra fila para
   eludirlo. No se añade aquí un sistema de callbacks ni un botón de resolución manual.
6. Rollback: mantener consumidores/flags detenidos, conservar tabla e historial y
   restaurar código solo sin consumo activo. No eliminar la evidencia ni volver a
   poner en marcha un consumidor anterior que ignora las reclamaciones.

Límite: exclusión de despacho de una misma fila/intento entre consumidores compatibles,
no entrega exactamente una vez. Tras el inicio duradero puede existir una caída antes
de que salga el POST: se sacrifica el reenvío automático para evitar duplicados.
Los cambios de seguridad posteriores al punto duradero no pueden retirar una petición
ya autorizada/en vuelo. Un fallo total justo tras aceptar puede perder el SID antes
de persistirlo o registrarlo; aun así el control duradero impide reenviar. Un administrador
de BD o un worker antiguo que ignore este contrato quedan fuera de la garantía.

Los datos publicados, ejemplos de Hotel Demo Checkin, identidades reservadas, proveedores,
permisos de aplicación, flags, respaldos e inventario privado quedan sin cambios.
