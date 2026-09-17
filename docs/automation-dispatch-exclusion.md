# Auditoría Badar: exclusión del envío de automatizaciones

Revisión local del 17 de septiembre de 2026. Base: `dcf3383d39acce09be7df56ff6afba36b4e62f28`.
Rama: `codex/automation-dispatch-exclusion`. Implementación en `4f89499`.
Preparación de PR autorizada posteriormente: push y PR hacia main, sin merge ni
auto-merge. El procedimiento operativo de este documento no se ha ejecutado.

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

### Puerta de entrada: identificar y vaciar consumidores antiguos

Antes de autorizar la migración, el responsable de operaciones debe registrar en
el expediente privado **servicio/job, entorno, comando de arranque, deployment/SHA,
réplicas y ejecuciones activas, responsable y evidencia de parada**. No incluir ese
inventario ni credenciales en la PR. El código revisado no registra consumidores;
eso no demuestra que no haya procesos configurados fuera del repositorio.

| Superficie que debe comprobarse | Acción futura y prueba de cumplimiento |
| --- | --- |
| Backend Railway y cualquier servicio worker del mismo proyecto/entorno | Revisar comandos de arranque, réplicas, deployments activos y ejecuciones puntuales. Si un comando/importador invoca `processDueScheduledMessages`, `processScheduledMessage` o un adaptador propio sobre `scheduled_messages`, detener su planificación y drenar todas sus réplicas antiguas. Registrar ID/SHA y estado terminado de cada ejecución; no basta con que una réplica nueva esté healthy. El `npm start` actual solo inicia `src/server.js`, sin consumidor registrado. |
| Cron, tareas programadas, contenedores y scripts externos | Buscar entradas que importen `message-queue.service.js` o seleccionen `scheduled_messages` para enviar; revisar también reintentos y recuperación ad hoc. Deshabilitar sus disparadores en la ventana autorizada, vaciar ejecuciones activas y comprobar que no queda un reinicio/reintento pendiente. La ausencia de jobs en este repositorio no sustituye esta comprobación del operador. |
| Vercel: función `/api/platform/monitoring` anterior | Impedir nuevas solicitudes de `retry_automation` al deployment antiguo durante el cambio, esperar el fin de las invocaciones activas y sustituir la ruta por la del SHA aprobado. Revisar también aliases/URLs antiguas o previews que conserven acceso a producción; retirar ese acceso o mantenerlas inaccesibles antes de reabrir operaciones. No detener previews que solo generan datos locales. |
| Generadores preview de Dashboard, folio y post-stay | No son consumidores y no se detienen por esta corrección. Solo incluirlos en el drenaje si la configuración real añade un consumidor que no existe en su implementación revisada. |

La evidencia de drenaje exige **cero procesos/invocaciones consumidores antiguos**
y disparadores detenidos, junto con sus estados de terminación. Logs sin actividad,
un contador de réplicas deseadas en cero o `pg_stat_activity` vacío por sí solos no
lo prueban: las conexiones HTTP a Supabase pueden cerrarse entre operaciones.
Una ejecución terminada abruptamente durante un envío sigue siendo incierta.
Los 15 s del nuevo adaptador y sus leases no acotan a los workers antiguos: esperar
su terminación comprobada, no un tiempo fijo. Si no puede identificarse una ejecución,
el despliegue queda pendiente; no activar el consumo para comprobarlo.

### Comprobaciones previas indispensables de la base (preparadas, no ejecutadas)

En la futura ventana, usar una sesión administrativa del propietario de las tablas,
verificar el proyecto/base de destino y la existencia del respaldo privado. Ejecutar
solo las siguientes consultas de metadatos antes de decidir si aplicar la migración.
No hacen backfill, no consultan mensajes ni repiten auditorías de Knowledge/Inbox.

```sql
begin transaction read only;
-- Debe devolver cero filas. Solo dependencias leídas/escritas por el contrato.
with required(table_name, columns) as (values
  ('scheduled_messages', array['id','hotel_id','reservation_id','conversation_id',
    'status','scheduled_for','idempotency_key','execution_mode','runtime_version',
    'updated_at','sent_at','failed_at','error_message','metadata']),
  ('hotels', array['id','metadata','ai_auto_reply_enabled']),
  ('reservations', array['id','hotel_id','status','arrival_date','departure_date']),
  ('conversation_ai_state', array['hotel_id','conversation_id'])
)
select r.table_name, c.column_name as missing_column
from required r cross join lateral unnest(r.columns) c(column_name)
where not exists (
  select 1 from pg_attribute a
  where a.attrelid = to_regclass('public.' || r.table_name)
    and a.attname = c.column_name and a.attnum > 0 and not a.attisdropped
);
-- El actor debe poder crear objetos en public y poseer scheduled_messages
-- (o actuar con el rol administrador autorizado); los tres roles deben existir.
select current_user, has_schema_privilege(current_user, 'public', 'CREATE') as can_create,
  (select pg_get_userbyid(relowner) from pg_class
   where oid=to_regclass('public.scheduled_messages')) as queue_owner;
select rolname from pg_roles where rolname in ('anon','authenticated','service_role');
-- Revisar solo estas restricciones: PK(id), idempotencia existente y cualquier
-- CHECK de status que pudiera impedir processing/retry/unknown/sent/failed.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid=to_regclass('public.scheduled_messages') and contype in ('p','c');
select indexname, indexdef from pg_indexes where schemaname='public'
  and tablename='scheduled_messages' and indexname='scheduled_messages_hotel_idempotency_unique';
-- En la primera instalación no debe haber objetos de dispatch preexistentes.
select to_regclass('public.automation_dispatches') as existing_dispatch_table;
select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace
  and proname like 'automation_dispatch_%';
rollback;
```

Si faltan dependencias/permisos, un CHECK rechaza los estados necesarios o ya hay
objetos de dispatch de procedencia desconocida, no aplicar el fichero a ciegas.
Identificar la diferencia concreta; no borrar ni sobrescribir evidencia existente.
La definición de idempotencia debe seguir siendo única por `(hotel_id,idempotency_key)`
para claves no nulas. Si usa otro nombre, verificar su definición equivalente.
Si estos objetos ya provienen de una instalación aprobada, contrastar las cinco
firmas/definiciones con el SQL del SHA desplegado y conservar sus datos.

### Orden de migración y comprobación de los procesos nuevos

Con drenaje demostrado y `SEND_AUTOMATIONS=false` verificado **en cada servicio y
entorno relevante**, aplicar `add_automation_dispatch_exclusion.sql` una sola vez
con el rol administrativo autorizado. Registrar hash del archivo, resultado de la
transacción y hora. Después desplegar backend y Dashboard del SHA aprobado, con
consumidores aún detenidos. Si los despliegues automáticos entregasen código antes
del SQL, mantenerlos sin consumo: el código nuevo falla cerrado sin la RPC; eso no
constituye una migración completada.

Para cada proceso posterior, registrar su deployment ID y SHA de origen completo,
comando efectivo de arranque y réplicas reales. Debe corresponder al SHA integrado
que contenga `4f89499` y la versión final revisada de esta PR. En imágenes que copian
fuentes, comparar SHA-256 de `src/services/message-queue.service.js`,
`src/services/twilio.service.js` y `shared/automations/dispatch.js` con ese artefacto.
En Vercel, comprobar el SHA del deployment, su build y la inclusión de
`shared/automations/dispatch.js` en la ruta de monitoring compilada/trazada.
Verificar la URL/alias que usa el cliente, no solo el último build disponible.
Una fuente nueva sobre disco con un proceso Node antiguo aún vivo no sirve:
comprobar el arranque de cada réplica a partir del deployment nuevo y que ninguna
ejecución anterior sigue activa. Cualquier wrapper externo debe llamar al procesador
nuevo, sin POST directo ni fallback al envío antiguo; un wrapper no verificable
permanece detenido. No se crea ni activa un worker donde antes no había ninguno.

Tras el SQL, comprobar en metadatos RLS de `automation_dispatches`, EXECUTE de las
cinco firmas solo para los roles administrativos/de servidor previstos, ausencia
de EXECUTE para PUBLIC/anon/authenticated y ausencia de escritura directa de
service_role en la tabla. Contrastar definiciones con el archivo aprobado. Comprobar
que la caché de esquema PostgREST reconoce esas firmas; si no las reconoce, mantener
el envío bloqueado y resolver esa dependencia antes de considerar listo el despliegue.
No usar una fila real ni una llamada de envío como smoke test: los 15 escenarios
se ejecutan en la base desechable. Mantener `SEND_AUTOMATIONS=false` después de publicar.

### Recuperación compatible

Ante un problema, detener el nuevo consumo, conservar tabla/historial y comparar la
fila de cola con su control por hotel, mensaje e intento. No inferir el resultado
solo de `scheduled_messages.status`, que pudo ser escrito por código antiguo.
`claimed` vencido sin inicio es recuperable por el consumidor compatible. Para un
`dispatching` vencido previamente identificado, la RPC claim puede marcarlo unknown;
**no ejecutar claim en lote sobre filas arbitrarias**, pues una fila scheduled elegible
sí quedaría reclamada. Esta operación también requiere autorización operativa futura.

`dispatching`, `unknown` y una aceptación cuyo guardado no está confirmado se
mantienen fuera de reintentos automáticos. Conservar el SID si existe, correlacionar
logs/evidencia del proveedor y registrar la conclusión privada. No borrar el control,
recrear el mensaje, resetearlo a scheduled/retry ni interpretar ausencia de SID o
callback como rechazo. Solo `rejected` con `retry_allowed=true` puede pasar por la
solicitud de reintento existente y su backoff; failed/retry históricos sin evidencia
no son equivalentes. No se implementa una resolución manual de unknown en esta PR.

**Volver al código anterior no es una recuperación segura con consumidores activos:**
ignora la tabla de control y puede reenviar trabajo reservado o incierto. Si hace
falta restaurar una parte del servicio, los consumidores y la ruta antigua de
reintento deben permanecer inaccesibles, con el flag falso en todas las instancias.
Conservar SQL/evidencia y recuperar después con código compatible; cualquier
excepción exige evaluar expresamente esa incompatibilidad antes de autorizarla.

Límite: exclusión de despacho de una misma fila/intento entre consumidores compatibles,
no entrega exactamente una vez. Tras el inicio duradero puede existir una caída antes
de que salga el POST: se sacrifica el reenvío automático para evitar duplicados.
Los cambios de seguridad posteriores al punto duradero no pueden retirar una petición
ya autorizada/en vuelo. Un fallo total justo tras aceptar puede perder el SID antes
de persistirlo o registrarlo; aun así el control duradero impide reenviar. Un administrador
de BD o un worker antiguo que ignore este contrato quedan fuera de la garantía.

Los datos publicados, ejemplos de Hotel Demo Checkin, identidades reservadas, proveedores,
permisos de aplicación, flags, respaldos e inventario privado quedan sin cambios.
