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

El generador admite ese hotel en el proyecto actual; **no exige otro esquema/proyecto
por diseño, pero el aislamiento de dicho proyecto no está demostrado**. No se deduce
del nombre, `Modo demo`, `hotel_live_mode` ni `SEND_AUTOMATIONS=false`.
El inventario local anterior solo cubre messages/hotel_knowledge: no mostraba triggers
de usuario en messages, pero no cubre las otras seis tablas que modifica la carga ni
acredita el estado actual de los consumidores externos.

La carga SQL no invoca rutas inbound, IA ni proveedores y no crea colas. Rechaza
triggers de usuario habilitados en las siete tablas. Eso no evita que un consumidor
externo lea posteriormente las reservas: por ejemplo, `scheduler.service.js` contiene
selección de reservas activas sin exclusión por marcador de fixture (su scheduler
legacy está desactivado por defecto, pero esa opción no acredita todos los procesos).

**Antes de cargar, y durante toda la vida de los ejemplos**, confirmar workers,
schedulers, reconciliadores, tareas programadas, webhooks de BD/CDC, consumidores de
publicaciones e integraciones detenidos o simulados, y proveedores externos inaccesibles.
No reactivar consumidores reales hasta retirar los ejemplos. Si esto no puede
garantizarse sin afectar la operación compartida, usar un proyecto/entorno dedicado
con datos exclusivamente sintéticos y URL propia; no conectar el Preview ni la URL
de producción a otro proyecto como parte de esta PR. Esa preparación requiere una
autorización separada. **La carga en el destino actual queda pendiente de esta evidencia.**

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
4. Integrar/publicar el código solo cuando se autorice posteriormente. El frontend viejo
   sigue usando v1 durante la transición. Si el nuevo código llega antes del SQL,
   mostrará seguimiento no disponible, sin inventar números. Confirmar el SHA activo
   en Vercel y la carga de la URL exacta del usuario.
5. Solo tras confirmar el aislamiento anterior, preparar y ejecutar la carga identificada.
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
garantías de red. No ejecutarlos hasta cumplir las condiciones de aislamiento.
La transacción valida hotel/operador/fecha, bloquea las tablas modificadas, rechaza
triggers habilitados y colisiones y crea solo entidades de los tres casos. Una segunda
carga no modifica registros preexistentes ni duplica entidades/eventos. No hay envíos,
facturas, acciones de mantenimiento ni reservas de traslado.

Para retirar, usar `remove.sql` generado con **los mismos UUID y fecha original**, en
la misma clase de sesión aislada y con los dos SET anteriores. Solo elimina las
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
   208, Ana llegada mañana, Lucía salida ayer. No enviar, traducir ni pulsar acciones de IA.
5. Verificar que no aparecieron llamadas a proveedores, jobs ni efectos externos.
   La evidencia local no sustituye esta comprobación del entorno objetivo.

Ante incompatibilidad del despliegue, conservar v1 y volver al código previo solo
mediante una acción autorizada. No borrar mensajes ni desactivar RLS como recuperación.
