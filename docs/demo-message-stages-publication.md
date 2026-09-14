# Activación futura de la demo de mensajes

Este documento prepara acciones posteriores. La PR no carga ejemplos, no ejecuta SQL
remoto, no cambia flags y no se integra automáticamente. El Preview autorizado sirve
para verificar el despliegue; no se usa para operar sobre datos.

## Destino e aislamiento: condición previa

Proyecto candidato según configuración **local**, no confirmado en las plataformas:
`vblxmnqbatqrynfaasmf`, host `vblxmnqbatqrynfaasmf.supabase.co`.
El `.env` raíz configura `SUPABASE_URL`; el archivo local del dashboard configura
`NEXT_PUBLIC_SUPABASE_URL` al mismo host. Eso no confirma el servidor de Vercel.
Comparar en los paneles del entorno que servirá la demo, sin copiar claves:

- Railway: `SUPABASE_URL`, usado por `src/services/supabase.service.js`.
- Vercel, servidor: `SUPABASE_URL`, usado por `dashboard/lib/supabase.js`.
- Vercel, navegador: `NEXT_PUBLIC_SUPABASE_URL`, usado por `supabase-browser.js`.

Estos clientes no sustituyen automáticamente `SUPABASE_URL` por su variante pública.
Confirmar las variables del entorno **Production** para la URL del usuario
`https://staynex-chi.vercel.app/dashboard`; el Preview tiene su propio entorno.
Confirmar el UUID del hotel cuyo nombre es **Hotel Demo Checkin** y slug
`hotel-demo-checkin`, su zona horaria y un operador activo owner/admin/manager/receptionist
sin plataforma support. No crear asignaciones ni hoteles para eludir una discrepancia.

El proyecto compartido es compatible **cuando todas las instancias consumidoras ejecuten
las guardas de identidad de esta PR**. No hace falta detener sus funciones para otros
huéspedes/hoteles. El nombre, `Modo demo`, `hotel_live_mode`, SIMULADO y
`SEND_AUTOMATIONS=false` no acreditan por sí solos el aislamiento.

La revisión confirmó rutas concretas: traducción de Inbox hacia OpenAI, generación
del scheduler legacy si se habilita, consulta PMS de folio y exportación a Sheets.
Los teléfonos `synthetic-only:` ya impedían el envío manual, pero no esos otros
recorridos. Se han añadido guardas comunes sobre los UUID reservados y deterministas
del generador (`shared/demo-message-stages/server-provenance.js`). Se verifican en
el servidor a partir del hotel autorizado y las identidades persistidas; quitar
metadata o cambiar el teléfono no levanta el bloqueo. Nunca conceden acceso.

Los ejemplos se excluyen de selección/creación/reconciliación de automatizaciones,
inteligencia PMS/postestancia y exportación Sheets. Un envío encolado que referencie
sus identidades se cancela antes de llamar al proveedor; además se comprueba la
reserva leída en el momento de envío. Manual y traducción devuelven un rechazo
explícito; no generan una aceptación ficticia. Inbound/IA se detienen antes de
traducciones, generación, reservas de experiencias o comunicaciones a proveedores.
Dashboard, Inbox y atención siguen leyendo los mismos originales y RPC.

Antes de cargar, comprobar SHA activo en Vercel, Railway **y cada cron/worker que
ejecute estos módulos**, y retirada de procesos antiguos. Mantener esa versión o
una posterior con las guardas durante toda la vida de los ejemplos. No cargar
mientras coexistan consumidores de la versión anterior. Se mantiene
`SEND_AUTOMATIONS=false`; no se pide cambiar configuración en este pase.

Único control de infraestructura adicional: confirmar que no hay consumidores
externos a este código (webhooks de BD, CDC, suscripciones propias o ETL) que actúen
sobre estas siete tablas sin excluir los ejemplos. Realtime de Inbox es lectura
autorizada y no se desactiva. La carga rechaza triggers de usuario habilitados en
las tablas afectadas, sin deshabilitarlos. El inventario anterior de dos tablas no
acredita las otras cinco ni consumidores externos. Si existe uno, identificarlo y
excluir allí estas identidades o usar un entorno dedicado; no parar globalmente el
servicio compartido ni suponer que un SET de SQL controla ese consumidor.

## SQL y orden de publicación

1. Confirmar en el destino anterior la instalación activa de Message Attention:
   `messages.attention_inclusion_version` con default 1, `message_attention`,
   `enterprise_audit_logs`, `conversation_ai_state`, `twilio_inbound_message_claims`,
   las funciones `staynex_attention_{require_contract,eligible,effective,origin}` y
   `staynex_attention_{dashboard,read,transition}_v1`, además de hotels/hotel_users/
   guests/conversations y el esquema base de reservations.
   Revisar los SQL históricos como contrato, **no volver a aplicarlos a ciegas**.
   Si falta atención, detener esta secuencia y preparar su instalación aparte.
2. Aplicar `supabase/sql/extend_attention_dashboard_messages.sql` antes del código.
   Crea/reemplaza únicamente `staynex_attention_dashboard_v2(uuid,text,boolean,timestamptz,uuid)`.
   Mantiene v1 intacta y reutiliza sus cálculos. Es SECURITY DEFINER con search_path
   pg_catalog; requiere propietario autorizado con lectura/BYPASSRLS como v1.
   Revoca EXECUTE a PUBLIC/anon/authenticated/service_role y lo concede solo a
   service_role. No altera políticas ni grants de tablas. La autorización del usuario
   permanece en las rutas mediante `getCurrentHotelForRequest` y permisos de rol.
3. Verificar definición, propietario y permisos efectivos de la nueva RPC (incluidos
   privilegios heredados). anon/authenticated no deben ejecutarla; service_role sí.
   Una llamada service_role no prueba aislamiento por RLS: verificar también las rutas.
4. Integrar/publicar backend, dashboard y workers solo cuando se autorice posteriormente. El frontend viejo
   sigue usando v1 durante la transición. Si el nuevo código llega antes del SQL,
   mostrará seguimiento no disponible, sin inventar números. Confirmar el SHA activo
   en Vercel/Railway y la carga de la URL exacta del usuario. No se necesita garantizar
   un orden entre ambos despliegues si todavía no hay ejemplos: esperar a que todos
   estén actualizados y las instancias antiguas retiradas antes de cargarlos.
5. Solo tras confirmar esas condiciones, preparar y ejecutar la carga identificada.
   Nunca ejecutar el reset general de Checkin para esta operación.

## Generación, aplicación autorizada y retirada

Obtener YYYY-MM-DD según la zona horaria verificada del hotel **el día de la demo**.
No usar una fecha inventada ni adaptar fechas de mensajes existentes.

```powershell
$env:SEND_AUTOMATIONS = 'false'
New-Item -ItemType Directory -Force .npm-cache/demo-message-stages | Out-Null
node scripts/demo-message-stages.js HOTEL_UUID OPERADOR_UUID YYYY-MM-DD load |
  Out-File -Encoding utf8 .npm-cache/demo-message-stages/load.sql
node scripts/demo-message-stages.js HOTEL_UUID OPERADOR_UUID YYYY-MM-DD remove |
  Out-File -Encoding utf8 .npm-cache/demo-message-stages/remove.sql
```

Los comandos solo escriben archivos; no conectan a Supabase. Sustituir los tres
parámetros por metadatos confirmados, revisar los archivos y conservarlos fuera de Git.
Para la futura aplicación, en **la misma sesión** SQL Editor del proyecto confirmado:

```sql
SET staynex.demo_isolated = 'on';
SET staynex.send_automations = 'false';
-- A continuación, pegar el contenido íntegro de load.sql (incluye BEGIN y COMMIT).
```

Estos SET son reconocimientos operativos, no switches reales de Railway/Vercel ni
garantías de red. Confirman la revisión de versiones y consumidores indicada arriba.
La transacción valida hotel/operador/fecha, bloquea las tablas modificadas, rechaza
triggers habilitados y colisiones y crea solo entidades de los tres casos. Una segunda
carga no modifica registros preexistentes ni duplica entidades/eventos. No hay envíos,
facturas, acciones de mantenimiento ni reservas de traslado.

Para retirar, usar `remove.sql` generado con **los mismos UUID y fecha original**, con
las guardas todavía desplegadas y los dos SET anteriores. Solo elimina las
identidades de `staynex_message_stages_v1` y su evento sintético. Rechaza cambios de
propiedad/contenido, nueva actividad humana y dependencias que pudieran provocar
cascadas. Si rechaza la retirada, conservar datos y revisar la dependencia concreta;
no ejecutar DELETE global, reset de hotel ni deshabilitar triggers. Un cambio de día
requiere retirada segura antes de otra carga; no se reescriben fechas.

## Comprobación en la URL del usuario

1. Abrir una pestaña nueva de `https://staynex-chi.vercel.app/dashboard`, entrar en
   Hotel Demo Checkin mediante el selector autorizado y confirmar hotel/zona/SHA.
2. En **Origen de los indicadores**, elegir **SIMULADO**. El valor enviado es
   `attentionOrigin=simulated` para listado e indicadores. El estado vive en el componente:
   al volver desde Inbox o recargar, elegirlo otra vez si vuelve a Entradas trazables.
3. Verificar la contribución **3/1/2/1**, sumada a cualquier otro mensaje legítimo de
   ese origen, y filas Carlos urgente, Ana pendiente y Lucía resuelta con sus etapas.
   La tarjeta urgente filtra esa misma consulta. No comparar ese KPI por mensaje con
   filtros heurísticos de conversaciones o no leídos de Inbox.
4. Abrir las tres filas: `/dashboard/inbox?conversationId=UUID_CORRESPONDIENTE` en el
   mismo hotel; contrastar huésped, original y estado de atención. Carlos habitación
   208, Ana llegada mañana, Lucía salida ayer. El selector no habilita envíos.
5. Tras autorización para la verificación remota: intentar responder o traducir un
   mensaje de estos ejemplos debe mostrar el rechazo explícito de demo y conservar
   el borrador, sin insertar un envío ni mostrar aceptación/entrega. La asistencia
   del panel es cálculo local. Resolver/reabrir atención sigue autorizado y debe
   reflejarse en Dashboard al consultar de nuevo SIMULADO. Esas transiciones dejan
   auditoría real y la retirada conservadora puede rechazarlas: no borrar ese
   historial automáticamente para conseguir una retirada exitosa.
6. Verificar que no aparecieron llamadas a proveedores, jobs nuevos ni efectos externos
   asociados a los UUID de los ejemplos. No probar estos bloqueos sobre huéspedes reales.
   La evidencia local no sustituye esta comprobación del entorno objetivo.

Ante incompatibilidad del despliegue, conservar v1 y volver al código previo solo
mediante una acción autorizada. Si se vuelve a código sin guardas, retirar antes los
ejemplos mediante su retirada verificada; si esta rechaza actividad posterior, detener
la reversión y resolver ese bloqueo. No borrar historia ni desactivar RLS.

## Evidencia local y CI

`npm run ci:critical` incluye ahora `test:demo-external-isolation`: diez comprobaciones
de cuerpos productivos con BD sintética y proveedores espía, sin SDK externo. Se
comprueban los tres ejemplos, metadatos ausentes, teléfono cambiado, hotel ajeno,
colas/reintentos, folio, workers y Sheets. Los controles ordinarios del mismo hotel
llegan a los espías WhatsApp, traducción, generación IA, folio y exportación; los
ejemplos no se envían a esos proveedores. `SEND_AUTOMATIONS` permanece false; el test
de generación sustituye OpenAI por una clase espía y sombrea solo su configuración
local para evitar que USE_MOCK_AI oculte una llamada potencial.

Las 15 comprobaciones PostgreSQL y las 7 HTTP contra PostgreSQL se repiten con
`node --experimental-vm-modules --require ./scripts/ci/isolate.cjs scripts/test-demo-message-stages-postgres.cjs --integrated`.
Siguen siendo locales: el job PostgreSQL knowledge isolation no certifica la RPC de
esta demo. El nuevo test de proveedores sí forma parte de Critical tests and syntax.
No se ha aplicado SQL/carga remota ni verificado funcionalmente producción.
