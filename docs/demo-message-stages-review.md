# Dashboard: mensajes antes, durante y después de la estancia

**Actualización:** el cierre de aislamiento descrito al final y
`demo-message-stages-publication.md` sustituyen la condición inicial de detener
globalmente los consumidores. Los apartados iniciales conservan la evidencia histórica.

Revisión local del 14 de septiembre de 2026. Rama `codex/demo-message-stages`,
creada desde `origin/main` `b86209b80c9a54d026d3eaf6ec08baafe73fdc20`.
Sin push, despliegue, SQL remoto ni operaciones sobre datos reales.

## Resultado y clasificación

El bloque inferior se llama **Mensajes**. La tarjeta **Mensajes pendientes** conserva
su nombre y su cálculo. La muestra ordena todas las urgencias antes que pendientes
y resueltos; no reserva plazas para ejemplos. Ofrece ampliación de 5 a 8 filas,
paginación y acceso a Inbox. Las etiquetas usan texto además de color.

`staynex_attention_dashboard_v2` reutiliza sin alterar los cuatro cálculos de v1.
La procedencia seleccionada afecta a indicadores y listado. Las relaciones de
mensaje/conversación/huésped/reserva se limitan al hotel autorizado por la API.
La RPC sigue siendo exclusiva de `service_role`; la autorización del contexto
hotelero sigue en `/api/executive-dashboard`.

| Ejemplo ficticio | Reserva relativa a la fecha local | Atención | Contribución |
|---|---|---|---|
| Ana López | Llegada +1, salida +4 | Pendiente | Recibidos +1, pendientes +1 |
| Carlos Ruiz | Llegada −1, salida +2; habitación 208 | Pendiente, alerta urgente vigente | Recibidos +1, pendientes +1, urgentes +1 |
| Lucía Martín | Llegada −4, salida −1 | Resuelto mediante transición y auditoría explícitas | Recibidos +1, resueltos +1 |

Los tres mensajes se fechan a las 00:00 del día de referencia en la zona del hotel,
por lo que nunca se insertan con una hora futura de ese día. La llegada/salida se
calcula mediante fechas PostgreSQL, sin aritmética de 24 horas sobre UTC.
La carga exige que la referencia sea hoy en esa zona; nunca desplaza datos existentes.
El momento de estancia describe la fecha local **del mensaje**, no la fecha de consulta.
Una reserva explícita en `metadata.reservation_id` debe coincidir con hotel y huésped.
Sin enlace explícito solo se usa una reserva no cancelada inequívoca. En otro caso:
**Estancia no identificada**. Salir del hotel o recibir una respuesta de IA no resuelve atención.

El código explica varias causas de ceros, sin demostrar el estado remoto actual:
el selector arranca en **Entradas trazables**, mientras los fixtures son **SIMULADO**;
las fechas antiguas no son recibidos hoy; los mensajes históricos sin inclusión de
atención no son pendientes; una respuesta de IA no crea la transición de resolución.
La carga general anterior tampoco garantiza estos tres casos ni su evento de resolución.
No se ejecutó su reset ni se eliminaron otros ejemplos para obtener 3/1/2/1.

## Carga preparada; no ejecutada remotamente

`scripts/demo-message-stages.js` solo **genera SQL**. No importa clientes de BD,
archivos `.env`, IA ni proveedores. Usa el proveedor de demo existente
`checkin_demo_mock`, identificador `staynex_message_stages_v1`, UUID deterministas
por hotel/caso/entidad y destinatarios `synthetic-only:…` no utilizables como WhatsApp.
No crea hotel, usuario, tickets, colas de envío, automatizaciones ni facturas.
Lucía usa `staynex_attention_transition_v1`, con el operador autorizado indicado y
un UUID de operación estable: el evento auditable corresponde a un mensaje SIMULADO.

Preparación futura, con UUID verificados del hotel y de un operador de la demo:

```powershell
$env:SEND_AUTOMATIONS = 'false'
node scripts/demo-message-stages.js HOTEL_UUID OPERADOR_UUID YYYY-MM-DD load |
  Out-File -Encoding utf8 .npm-cache/demo-message-stages/load.sql
node scripts/demo-message-stages.js HOTEL_UUID OPERADOR_UUID YYYY-MM-DD remove |
  Out-File -Encoding utf8 .npm-cache/demo-message-stages/remove.sql
```

Estos comandos no conectan ni cargan nada. Antes de una futura ejecución autorizada:

1. Confirmar el destino **Hotel Demo Checkin**, slug `hotel-demo-checkin`, zona válida
   y operador activo. Mantener los workers/consumidores externos detenidos o simulados.
   `SEND_AUTOMATIONS=false` por sí solo **no** acredita aislamiento de todos los canales.
2. Confirmar en la sesión SQL ese aislamiento con
   `SET staynex.demo_isolated='on'; SET staynex.send_automations='false';`.
   Son reconocimientos explícitos, no sustitutos del aislamiento operativo.
3. Revisar y ejecutar el SQL generado en esa misma sesión. La transacción bloquea
   las tablas que modifica y **rechaza todo trigger de usuario habilitado** en ellas,
   sin deshabilitar ninguno. Un trigger existente exige revisar sus efectos antes
   de decidir otro procedimiento; no se presupone seguro por su nombre.
4. Seleccionar **SIMULADO** en Dashboard. Los ejemplos suman 3/1/2/1 si se cargan hoy;
   otros mensajes válidos del mismo origen también cuentan. No hay fallback de demo.

Repetir la carga no duplica ni vuelve a resolver. Otro día, identidades ocupadas o
contenido incompatible provocan rechazo en vez de sobrescritura. La retirada es
atómica e idempotente; comprueba propiedad y rechaza actividad posterior y referencias
dependientes para evitar cascadas que borren historia. Para cambiar la referencia,
retirar la carga anterior solo si sigue siendo exclusivamente desechable y cargar
de nuevo. No actualizar timestamps para aparentar mensajes nuevos.

## Validación local

- `node scripts/test-demo-message-stages-postgres.cjs`: **15 comprobaciones PASS**,
  PostgreSQL **17.10**, imagen oficial ya disponible, Docker local mediante named pipe.
  Cada ejecución crea un contenedor nuevo sin red, sin puertos y con datos en tmpfs;
  lo elimina incluso al fallar. SQL real del repositorio y RPC real desde disco.
- Demuestra 3/1/2/1, nombres/etapas/fechas, enlaces e identidad al leer atención de Inbox,
  evento único, idempotencia, retirada, filtro de origen, ausencia de cambios en otro
  hotel, rechazo de ejecución desde navegador, medianoche, reservas ambiguas/ajenas,
  once urgencias con paginación prioritaria y resolución de Carlos → 3/2/1/0.
  También comprueba rechazo de triggers, dependencias posteriores y contrato desactivado.
- `test:message-attention`, `test:inbox`, `test:checkin-demo`,
  `test-auth-hotel-context.js`, `check:syntax`: **PASS** con aislamiento y proveedores simulados.
- `npm run ci:dashboard` ejecuta `dashboard:build` con entorno saneado: **PASS**.
  Advertencias de caché de webpack en Windows; no impidieron compilación ni las 64 páginas.
- `git diff --check`: **PASS**.

Se corrigió el fallback de reservas de Inbox: cuando faltan únicamente `room_number`
o `source`, repite la selección básica **con el mismo hotel y destinatarios**. Conserva
los nombres de reserva y la habitación del huésped. Prueba específica incluida.
Una aserción antigua de `test-reception-message-dashboard.js`, importada por Checkin,
esperaba que el menú compacto fuera `inert` en escritorio. Se actualizó al contrato
ya aprobado (solo móvil cerrado es inerte); no se cambió AppShell ni se omitió la prueba.

## Evidencia visual y límites

Montaje local existente: `http://127.0.0.1:3321/dashboard`, con proveedor simulado
en loopback 3322 y acceso externo bloqueado. Componentes productivos copiados desde
esta rama; fixture y montaje permanecen ignorados por Git.
La muestra usa la respuesta exportada del PostgreSQL desechable y sus mensajes,
reservas y estados, no números introducidos en las tarjetas. Es una **captura de BD
estática** para renderizado; no representa una conexión visual a Supabase ni prueba
Realtime. La auditoría SQL separada sí ejecutó carga, transiciones y consultas reales.

Comprobado en navegador: tres filas, orden, colores, selector SIMULADO, filtro de la
tarjeta urgente y enlaces a las tres conversaciones; Carlos/Ana pendientes y Lucía
resuelta. No se pulsaron enviar, traducir ni acciones de IA. El proveedor simulado
registró **0 peticiones de envío y 0 llamadas al proveedor**, con los tres mensajes
sintéticos cargados; evidencia en `provider-evidence.json`. Los contadores de
conversaciones/no leídos de Inbox mantienen su propio contrato: no equivalen a los
indicadores canónicos de atención **por mensaje** del Dashboard.

Capturas reales y logs en `.npm-cache/demo-message-stages/`, fuera de Git:
`evidence/dashboard-full.jpg` (vista superior), `evidence/dashboard-compact.jpg`,
`evidence/dashboard-messages.jpg` (las tres filas completas),
`evidence/inbox-carlos.jpg`, `evidence/inbox-ana.jpg`, `evidence/inbox-lucia.jpg`.
El inventario remoto permanece intacto y fuera del commit.

## Publicación pendiente

No se ha publicado ni cargado la demo remota. Orden futuro:

1. Verificar dependencias reales: contrato de atención activo, `reservations` y
   columnas de su esquema base, además del contrato ya requerido por Inbox
   (por ejemplo `guests.preferred_language`). La prueba SQL no certifica todas las
   migraciones históricas ni un arranque completo de Inbox sobre el esquema base.
   No dar por aplicadas migraciones por existir en Git.
2. Aplicar **solo** `supabase/sql/extend_attention_dashboard_messages.sql` con un
   propietario autorizado con las mismas capacidades de lectura/BYPASSRLS que v1.
   No volver a ejecutar la creación histórica de atención.
3. Publicar código del dashboard y comprobar la RPC v2 con contexto autorizado.
   Si falta v2 se muestra seguimiento no disponible; no se inventan totales.
   La versión anterior del dashboard continúa usando v1 durante la transición.
4. Cargar los ejemplos solo tras autorización y aislamiento operativo verificado;
   seleccionar SIMULADO, contrastar contribución y abrir las tres conversaciones.

Volver al código anterior es compatible con v1, que permanece intacta. No hace falta
borrar mensajes ni desactivar RLS. Cualquier retirada de demo debe pasar sus guardas.

## Cierre de preparación de PR: integración HTTP y PostgreSQL

Sobre `5ee20c071661be6395886ca16882f12857e34338`, se añadió una comprobación integrada
que no reutiliza la captura estática. Comando reproducible (Node 24.19.0, dependencias
de raíz/dashboard instaladas y la imagen oficial local `postgres:17.10`):

```powershell
node --experimental-vm-modules --require ./scripts/ci/isolate.cjs scripts/test-demo-message-stages-postgres.cjs --integrated
```

Resultado: **15 comprobaciones SQL + 7 comprobaciones HTTP PASS**. El host HTTP de
pruebas carga directamente desde disco los módulos reales de `/api/executive-dashboard`,
`/api/inbox` y `/api/inbox/attention`, incluyendo `current-hotel`, invitaciones,
permisos, carga de fuentes, presentación de traducciones, copilot local y DTO.
No modifica ni sustituye los handlers. Solo sustituye dos fronteras: la verificación
del token de Supabase Auth (identidades sintéticas) y el transporte de consultas
Supabase/PostgREST por un adaptador que ejecuta SELECT y RPC reales mediante psql.
Las asignaciones hoteleras se leen de PostgreSQL, no se simulan en el contexto.

Se sirven peticiones HTTP de loopback con sesiones válidas/ausentes/inválidas,
selección hotelera manipulada, lectura cruzada denegada, tres conversaciones y sus
estados, filtro SIMULADO/urgente y consulta trazable sin sustitución de ejemplos.
Una inserción nueva incrementa recibidos a 4; resolver ese nuevo mensaje mediante
POST autorizado cambia los indicadores a **4/2/2/1**. Las lecturas reflejan cambios
de BD en la misma ejecución, no respuestas estáticas. Se retiran solo esos registros
adicionales de prueba antes de continuar las 15 comprobaciones de demo.

**Fallo encontrado y corregido:** sobre el esquema base, `/api/inbox` respondía 500
al faltar `guests.preferred_language`. El lector ahora elimina únicamente las columnas
opcionales ausentes en reintentos acotados; conserva hotel/IDs de huéspedes y deja
el idioma desconocido como null. También contempla ausencia independiente de
`name/full_name`. La prueba integrada reproduce esta combinación realmente en PG;
`test:inbox` añade regresión para que el check crítico cubra el fallback.
La dependencia anterior de `guests.preferred_language` deja de bloquear esta lectura;
no se modifica el idioma de envío ni el traductor.

La prueba integrada es de handlers HTTP, autorización de aplicación y BD real. No
certifica Supabase Auth real, PostgREST, middleware/runtime de Next desplegado,
Realtime, proveedores ni el esquema remoto completo. Las fuentes opcionales ausentes
producen cobertura incompleta donde corresponde; no se crean fixtures para aparentar
actividad de IA. Logs y resultados están en `.npm-cache/demo-message-stages/integrated/`.

**CI:** los tres jobs existentes siguen siendo Critical tests and syntax, Dashboard
build y PostgreSQL knowledge isolation. Ni las 15 comprobaciones de esta demo ni las
7 integradas están incorporadas al workflow: se ejecutan **localmente** con el comando
anterior. El job de Knowledge no valida `staynex_attention_dashboard_v2`.
Ver el procedimiento remoto en [demo-message-stages-publication.md](demo-message-stages-publication.md).

## Cierre de aislamiento por identidad de los ejemplos

Revisión sobre `6619e62e36f2dc25eb47f581cdfaa7ee2c40cb06`, sin SQL/carga remota.
La precaución anterior tenía causas reales, pero era más amplia de lo necesario:

| Recorrido | Estado anterior | Tratamiento local |
|---|---|---|
| `message.service.js` → traducción → Twilio manual | El teléfono sintético ya era inválido; no era una política de procedencia | Rechazo 409 `demo_external_blocked` después de autorizar la conversación y antes de insertar/ traducir/enviar, incluso si cambian el teléfono. Borrador conservado; sin falsa aceptación |
| Inbox → `/api/translate` → `messages.controller.js` → OpenAI | Autorizaba hotel/mensaje, pero podía traducir ejemplos externamente | Identidad de mensaje/conversación verificada después de autorización, rechazo antes de caché/proveedor |
| Inbound → `guest.service.js` → `staynex.service.js` | Abrir el chat no genera IA; un inbound es otro recorrido | Bloqueo del huésped persistido antes de actualizar idioma/habitación, traducción o IA. También token de reserva y contexto preparado/reintentado. Impide alcanzar experiencias/email posteriores de ese procesamiento |
| Scheduler legacy → generación OpenAI | Desactivado por defecto, pero si se habilitaba seleccionaba estas reservas | Excluye las identidades antes de cargar contexto; generación y creación directa también rechazan |
| Decisiones → `queue-writer.js` → `message-queue.service.js` | Flags/live gates protegían configuración, no procedencia | No crea filas para estas identidades. Filas encoladas/reintentadas se cancelan antes del proveedor. Gate de reserva leída en envío también bloquea |
| Reconciliación, precheckout, postestancia, inteligencia PMS | Podían consumir reservas sintéticas y crear derivados; folio podía consultar un conector | Excluye los ejemplos antes de folio, alertas, snapshots o reconciliación. Consulta directa de folio devuelve no disponible `demo_external_blocked` |
| `platform-sheets-sync.service.js` → Google Sheets | Exportaba reservas y contaba conversaciones sintéticas | Excluye identidades/derivados referenciados antes de construir las filas exportadas; conserva registros ordinarios |

La procedencia operacional no se deduce de `metadata.demo`, `pms_provider`, un nombre
ni SIMULADO. Se reutiliza la identidad determinista ya emitida por el generador:
SHA-256 de namespace/hotel/caso/entidad, materializado en las claves primarias. El
generador y los consumidores usan ahora la misma función server-only. El UUID de
hotel se normaliza a minúsculas. Cada guarda es exclusivamente denegatoria: no
concede permisos ni sustituye los filtros hoteleros. Se evalúa sobre filas/decisiones
del servidor; quitar metadata o poner un teléfono válido no habilita operaciones.
No se añaden tablas, columnas, fechas de corte ni nuevos flags del navegador.

Dashboard, Inbox, autoría, texto original, RPC de indicadores, etapas y transición
de atención permanecen intactos. Resolver/reabrir atención deja auditoría real: la
retirada sigue rechazando actividad humana posterior, en lugar de borrarla.

### Comprobaciones de este cierre

- `test:demo-external-isolation`: **10 PASS**. Cuerpos productivos con BD sintética
  en memoria y proveedores espía. Cero llamadas externas de los ejemplos; los controles
  ordinarios llegan a WhatsApp, traducción, generación IA, PMS folio y exportación
  simulados. Incluye huéspedes/conversaciones sin metadata, teléfono válido editado,
  hotel cruzado, retries, decisión en modo live y workers en ventanas elegibles.
- `npm run ci:critical`: **PASS**, incluyendo ese nuevo test en el job existente.
- PostgreSQL 17.10 desechable: **15 SQL + 7 HTTP PASS**, con RPC real, autorización,
  indicadores, etapas, carga idempotente, atención y retirada. Sin conexión remota.
- `npm run ci:dashboard`: **PASS** después de apartar exclusivamente la caché `.next`
  anterior que produjo EINVAL/readlink en OneDrive. Caché preservada fuera de Git;
  no se cambió configuración ni se evitó el build.
- Automation runtime foundation, phase2a1, phase2a2, phase2b1, Checkin demo y Twilio
  inbound dedupe: **PASS** con simulaciones. No se enviaron mensajes reales.
- Comprobación adicional `test:guest-ai-tenant-isolation`: **FAIL previo, no corregido
  ni debilitado**. Su aserción de texto exige `withHotel(supabase.from('ai_logs'))` en
  `dashboard/app/api/executive-dashboard/route.js`; ese módulo ya usa carga delegada
  y no se modificó en este cierre. La misma aserción no coincide con el archivo del
  SHA base. No equivale a demostrar un fallo funcional de aislamiento, ni se declara
  cerrado este test ajeno. Los tests ejecutables de autorización/tenant del CI pasan.
- `git diff --check`: **PASS**. Inventario local intacto y sin seguimiento.

Las diez comprobaciones de proveedores están en Critical tests and syntax. Las
quince SQL y siete HTTP de demo siguen siendo locales; Knowledge valida su propio
contrato. Ninguna sustituye la verificación de versiones, esquema y consumidores
externos en el destino. La prueba visual histórica sigue siendo una captura estática,
no evidencia visual del bloqueo nuevo.

### Condiciones remotas pendientes

No se requiere detener globalmente las funciones cubiertas: actualizar todas sus
instancias (backend, dashboard, cron/workers) antes de cargar los ejemplos y mantener
las guardas mientras existan. Falta confirmar proyecto/hotel, SQL v2 activo, SHA y
retirada de versiones anteriores, y que no existan webhooks/CDC/ETL ajenos al código
que actúen sobre las tablas de la carga. Estos consumidores no se pueden certificar
desde Git; si hay alguno, identificarlo y excluir los ejemplos allí o utilizar un
entorno dedicado. El SQL de carga ya rechaza triggers habilitados sin desactivarlos.
No se ha verificado ni alterado su configuración remotamente en este pase.
