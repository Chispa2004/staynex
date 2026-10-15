# Alta asistida: revisión de compatibilidad y preparación de PR

Fecha: 2026-10-15. Fase de borrador; sin merge, SQL remoto ni despliegue Production.
Se conserva íntegro `docs/assisted-hotel-onboarding-review.md`.

## Candidato y alcance

Base y origin/main comprobados: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`.
Commits originales:

- `a854633fdee287e308a4798631b9dd17b359f0dd`: invitaciones explícitas.
- `4052918e9dfc913e05d9da12a040894a3387aeef`: configuración asistida/revisión.
- `d10a1ca300008ca434e5828cc8ade41cfbb40360`: recuperación/administración verificada.
- `270927149140d774cef8cab3d383720931cbeb88`: contrato PMS/laboratorio.

Esta fase añade ensayos de transición, preflight de lectura, ejecución del laboratorio en CI
Linux y este informe. No añade funciones ni altera la distribución. Sin mezclar organizaciones,
economía, calidad IA o foundation Ubikos. Inventarios, sesiones y capturas privadas quedan fuera
de Git; CI solo publica PNG sintéticos, nunca storageState ni tokens.

## Evidencia de hosting y destino (lectura actual)

| Superficie | Evidencia | Alcance y límite |
|---|---|---|
| Railway Production | Servicio `52dca011-d59b-4e3b-84ad-e45ee23e4fad`, deployment `407f5c24-c260-4c1d-add6-9d7df095073a`, réplica `8a806cf9-fe83-4706-a566-d64c24b6a186`, activo, SHA base | Consola del contenedor activo: `SUPABASE_URL` analizada a projectRef `vblxmnqbatqrynfaasmf`; `SEND_AUTOMATIONS=false`, `GUEST_MEMORY_ENABLED=false`. Solo se imprimieron identificador, SHA, entorno y esos flags. No consulta a DB. |
| Vercel Production | Deployment `7x7sWTVs12a9tyQLF2pQa4senG7C`, `staynex-nsr2rvwqm-staynex-s-projects.vercel.app`, alias público `staynex-chi.vercel.app`, Ready, SHA base | Metadatos actuales de Vercel coinciden con GitHub deployment `6948222506`. No se usó un Preview anterior como prueba. |
| Vercel servidor | Variable `SUPABASE_URL` declarada para Production y Preview; historial visible: alta 13 mayo | Guardada como **Secret, write-only**: no es posible leer su valor en esa pantalla. `NEXT_PUBLIC_SUPABASE_URL` es otra variable y no acredita el servidor. **Destino efectivo aún no acreditado**. |

El código del cliente de servidor (`dashboard/lib/supabase.js`) usa SUPABASE_URL y service role.
El cliente browser usa NEXT_PUBLIC_SUPABASE_URL; no se sustituye una comprobación por la otra.
El backend (`src/services/supabase.service.js`) usa SUPABASE_URL. No se leen claves ni cadenas
de conexión. No hay endpoint deployment-target en este main. No se integra organizaciones
para obtenerlo ni se publica un diagnóstico adicional en esta fase.

**Preflight remoto detenido por la condición de destino.** No se ha consultado el catálogo ni
los recuentos de accesos de producción. Falta evidencia del valor de SUPABASE_URL ligado al
deployment Production: metadatos inmutables accesibles de Vercel o diagnóstico autenticado del
proceso que devuelva exclusivamente projectRef y SHA. Una lectura local, un Preview o el valor
público del navegador no bastan. No se pide copiar una clave ni cambiar la variable.

## Efectos del push

Railway Settings muestra `main` como rama de Production, autodeploy activo, Wait for CI OFF,
una réplica, sin pre-deploy command ni cron configurado. Vercel Overview indica explícitamente
que Production se actualiza al hacer push a main. La rama candidata generará Preview y CI,
no un cambio de main. Vercel no tiene Deploy Hooks configurados.

`.github/workflows/ci.yml` solo ejecuta pruebas/build, permisos contents:read y sin secretos.
Instalación CI con --ignore-scripts. Los runners eliminan credenciales heredadas, bloquean .env
y red externa; PostgreSQL 17.10 local, network=none, tmpfs, sin puertos ni volúmenes persistentes.
`package.json` no tiene postinstall/prestart ni migración; dashboard build es next build y start
es next start. `src/server.js` valida entorno, registra rutas y escucha: no programa migraciones
ni jobs. Las nuevas rutas escriben solo bajo peticiones explícitas autorizadas. El laboratorio
no forma parte de las rutas del Dashboard publicado.

Preview: tratar como potencialmente compartido con Production (SUPABASE_URL tiene ámbito
Production/Preview). Solo metadatos; no abrir recorridos funcionales, aceptar enlaces ni usar RPC.
El estado Ready no acredita el funcionamiento de invitaciones ni de las migraciones.

## Tres migraciones exactas y efectos

SHA-256 sobre bytes de `git show HEAD:ruta` (LF; no hash de copia CRLF):

| Orden y ruta | SHA-256 |
|---|---|
| 1. `supabase/sql/add_hotel_access_invitations.sql` | `847c76923da372186d1c74e4b863eda267c8a2d5f4cd8bfcce5d4fcd1b83f3c3` |
| 2. `supabase/sql/add_hotel_information_review.sql` | `a6f96329a08070c1a75a8e2d6b30353e59a33c7d2e8e0d771dcd2347e4dbae14` |
| 3. `supabase/sql/add_pms_connection_evidence.sql` | `7dd8dfb69cffb2f740d5d1bfdce8ac4bfd507347969fc69b391c17aa0ef017f2` |

1. Tabla hotel_access_invitations: PK uuid, FKs a hotel_users/hotels, CHECK rol admin/receptionist,
   hash único hex64, índice assignment. RLS sin políticas de cliente. Revoca derechos de tabla
   a PUBLIC/anon/authenticated/service_role y devuelve solo SELECT a service_role. RPC
   manage_hotel_invitation_v1(uuid,uuid,uuid,text), accept_hotel_invitation_v1(uuid,text,boolean),
   hotel_identity_evidence_v1(uuid), SECURITY DEFINER con search_path pg_catalog,public;
   EXECUTE solo service_role, owner el rol que aplique SQL. Actor verificado/no bloqueado;
   administración interna, hotel disponible, destinatario/rol/asignación exactos. Locks hotel →
   asignación → invitación. No modifica usuarios existentes ni acepta invitaciones históricas.
   Defaults id/created_at solo nuevas filas; expiración de 7 días ya incluida en el candidato.
2. Tabla hotel_information_reviews por hotel, hash/revisor/fecha; FK hoteles, RLS sin acceso
   directo de clientes ni service_role. RPC hotel_information_review_v1(uuid,uuid,text),
   SECURITY DEFINER/search_path fijo, EXECUTE solo service_role. Lectura scoped; confirmar
   exige actor autorizado verificado y hash actual. Cambiar contenido invalida revisión. Sin
   backfill ni contenido generado. Requiere hotel_knowledge y local_knowledge_items.
3. Añade config_revision bigint NOT NULL DEFAULT 1, evidence jsonb NOT NULL DEFAULT '{}',
   last_success_evidence jsonb nullable a hotel_pms_connections. Existentes quedan revisión 1,
   sin evidencia acreditada; no convierte connected histórico en conexión verificada.
   Añade a reservations cuatro campos nullable de vínculo (FK pms_connection_id, revisión,
   propiedad, entorno); históricos no se rellenan. Funciones/trigger
   guard_pms_connection_revision_v1 y guard_apaleo_reservation_binding_v1; trigger antes de
   cambios de configuración/reserva. RPC record_pms_evidence_v1(uuid,bigint,text,timestamptz,text,text)
   SECURITY DEFINER/search_path fijo, EXECUTE solo service_role. CAS de revisión/fecha;
   bloquea destinos distintos con histórico y escrituras Apaleo sin vínculo. No cambia RLS ni
   ACL de tablas existentes. Las funciones trigger no otorgan acceso de escritura por sí mismas.

Las tres usan BEGIN/COMMIT y NOTIFY pgrst; no son un único bloque atómico. Dependencias previas:
alta atómica y onboarding actuales, hoteles/asignaciones/Knowledge/PMS/reservas, roles Supabase,
Auth id/email/email_confirmed_at/banned_until, funciones PostgreSQL sha256/gen_random_uuid.
Verificar propietario, BYPASSRLS de service_role y ACL reales; no ampliar permisos generales.
IF NOT EXISTS **no acredita compatibilidad** de un objeto previo diferente: comparar definiciones
antes de aplicar; detener ante conflicto. Repetición ensayada sobre catálogo sintético compatible.

## Preflight preparado

`scripts/preflight-assisted-hotel-onboarding-readonly.sql`: BEGIN READ ONLY, statement 15 s,
lock 2 s, idle transaction 30 s, ROLLBACK final. Solo SELECT de catálogo, privilegios, RLS,
triggers, funciones/dependencias y agregados de asignaciones/conexiones. Sin emails, huéspedes,
tokens, UUID de personas ni RPC de negocio. Probado en PostgreSQL desechable; pendiente remoto.
No se afirma que el fixture reducido sea copia acreditada del catálogo actual.
Tras acreditar ambos destinos: ejecutar una vez, conservar resultado privado, reproducir en el
contenedor cualquier diferencia relevante, y repetir solo pruebas afectadas. PL/pgSQL puede
tener dependencias no enumeradas en pg_depend: contrastar también los cuerpos de las funciones.

## Auth del proyecto previsto (configuración, no prueba de entrega)

Lectura en consola Supabase del proyecto vblxmnqbatqrynfaasmf: signup ON, Email ON,
Confirm email ON; anonymous sign-ins OFF y manual linking OFF. Site URL actual
`http://localhost:3000`; lista de Redirect URLs vacía. SMTP propio OFF; consola advierte que
el servicio incorporado tiene límites y no está destinado a apps Production.

Cambios propuestos **no aplicados**: Site URL `https://staynex-chi.vercel.app`; permitir exactamente
`https://staynex-chi.vercel.app/invite` para emailRedirectTo del alta de cuenta. No autorizar
wildcard de todos los Previews. Un futuro ensayo en dominio aislado requiere su URL /invite
exacta, validada separadamente. Mantener Confirm email ON. Revisar/autorización separada para
SMTP propio y remitente verificado antes de invitar clientes; no se ha probado entrega, cuota
ni recepción. No se han creado cuentas ni enviado correos.

Recorrido: fragmento token retirado del URL y guardado en sessionStorage; no se envía en GET,
referer ni analítica añadida. POST autenticado explícito para inspeccionar y aceptar; inspección
no consume. El token se almacena solo como SHA-256 en DB. Enlace nuevo revoca anterior;
expirado/revocado/otro destinatario no concede. Respuesta perdida: volver a comprobar recupera
aceptación ya persistida, sin duplicar ni reactivar acceso disabled. Cambiar cuenta conserva
invitación. Tras verificar en otra pestaña/dispositivo hay que volver al enlace original e iniciar
sesión: sessionStorage no viaja entre dispositivos. No se acredita recuperación remota de
contraseña ni entrega real por los ensayos Auth simulados.

## Matriz local y convivencia

| Caso | Resultado |
|---|---|
| Actual / esquema actual | UPDATE legacy por correo y reserva Apaleo sin vínculo reproducidos en PG sintético. |
| Actual / esquema nuevo | Lectura/tablas preservadas. El UPDATE antiguo todavía concede sin token; NO es seguro mantener ese consumidor. Escritor Apaleo antiguo es rechazado por trigger. |
| Nuevo / esquema nuevo | Invitación verificada, 6 aceptaciones concurrentes, recuperación, revisión y vínculo PMS cubiertos por suites PG/API. |
| Nuevo / esquema ausente/parcial | Invitación sin RPC responde 503, no autoasigna; ausencia de evidencia no acredita PMS; revisión ausente no puede confirmarse. No es configuración publicable. |
| Repetir migraciones | Conserva hotel, asignación pendiente y reserva histórica; no fabrica evidencias. |

La incompatibilidad antigua es un resultado esperado del ensayo, **no un PASS de convivencia**.
Rutas a retirar/controlar: `/api/auth/resolve-invitations`, resolutor current-hotel en modo
escritura y cualquier caller antiguo de attachUserToHotelInvitation. El código actual también
admite selección por correo de activos sin UUID; el nuevo exige identidad ligada. Antes de
publicar se necesitan los recuentos del preflight y tratamiento explícito de esos accesos:
sin promoverlos ni asociarlos automáticamente. Si existen, preparar resolución controlada
antes del corte; no afirmar conservación de acceso efectivo sin esa comprobación.

## Transición y recuperación propuestas, no ejecutadas

1. Cerrar prueba de destino Dashboard, preflight/catálogo, legacy sin UUID y Auth/SMTP.
   Confirmar SHA, SQL/hashes, CI y ventanas. Sin autorización actual de merge/migración.
2. Inventariar todos los consumidores activos y URLs antiguas, incluidos Previews, alias,
   scripts, sincronizaciones/webhooks Apaleo/reintentos. Bloquear acceso a versiones antiguas
   que autoasignan por correo; controlar altas/aceptaciones mientras conviven. Desactivar solo
   el botón nuevo no basta. Proponer regla temporal o ventana de mantenimiento específica
   para autorización posterior, sin cambiarla ahora.
3. Drenar/pausar escritores Apaleo, incluyendo webhooks/reintentos, antes de migración 3.
   Retener eventos pendientes; no descartar ni recrear reservas. SEND_AUTOMATIONS=false no
   evita importaciones ni prueba que no haya solicitudes en curso.
4. Aplicar 1, 2, 3 con los controles anteriores, verificar firmas/ACL/RLS/columnas y recarga
   PostgREST sin invocar RPC de negocio. Solo después desplegar ambos consumidores nuevos.
   No confiar en orden automático: Railway Wait for CI está OFF y Vercel es independiente.
5. Acreditar SHA en todas las réplicas/alias, cerrar acceso a deployments antiguos, mantener
   importaciones detenidas hasta validar propiedad/entorno y contrato completo. Desbloquear
   invitaciones únicamente cuando todas las rutas alcanzables usen aceptación explícita.
6. Ensayo controlado posterior con autorización: hotel técnico nuevo, correo de prueba propio,
   enlace emitido en Platform, recepción real de verificación, cuenta verificada/aceptación,
   refresh y reintento, datos/Knowledge, revisión y finalización hacia Salud del mismo hotel.
   Comprobar PMS/WhatsApp pendientes, live/IA/envíos OFF. Prueba negativa con segunda cuenta
   controlada, token sustituido y acceso revocado. No usar hotel operativo ni correo cliente.
7. Recuperación: ante fallo conservar contratos y datos, mantener rutas/escritores afectados
   bloqueados y corregir hacia delante. No borrar tabla de invitaciones ni hashes/aceptaciones;
   no resetear estados ni reenviar correos automáticamente. Volver al código antiguo reabre
   autoasignación y rompe importaciones: no es recuperación segura sin evaluar cada ruta.
   Migración parcial: conservar partes aplicadas, bloquear dependientes, completar solo tras
   comparar el catálogo. No ejecutar down migration destructiva como rutina.

## Qué queda preparado y qué no

Staynex podrá crear hotel básico y generar/reemplazar/revocar enlace privado desde Platform.
No se afirma envío de correo al generar el enlace. El responsable podrá crear cuenta o usar
la existente, verificar correo, aceptar, completar datos e información y llegar a Salud.
PMS y WhatsApp seguirán pendientes con su responsable/siguiente paso: finalizar el formulario
no conecta servicios. Staynex valida por separado cuenta/propiedad/entorno, lectura PMS,
cobertura de sincronización, canal WhatsApp, controles humanos y autorización live.

PMS implementado: destinos Apaleo limitados, aislamiento hotel/propiedad/revisión, invalidación
de evidencia al cambiar configuración, rechazo de respuesta obsoleta, estados independientes.
Cobertura actual se registra unknown: no acredita importación completa. No hay conexión real
Ubikos ni contrato oficial inventado. Importación global atómica/checkpoint y efectos derivados
siguen pendientes (una carrera de giro de configuración puede dejar escritura derivada de
huésped antes del rechazo de reserva); no habilitar piloto PMS por este borrador.

## Validación de esta fase y dictamen

Local: 10 grupos invitaciones/revisión y 6 PMS PostgreSQL PASS; transición y preflight local
PASS con incompatibilidad antigua explícita. CI Linux y PR: se completarán para el SHA final.
El informe anterior mantiene los fallos estáticos/CRLF heredados, sin expectativas debilitadas.

**Preparado con condiciones concretas para revisión; todavía no para ejecutar migración ni
publicación.** Pendientes: destino efectivo Dashboard; catálogo/legacy; retornos Auth/SMTP y
entrega real; control de versiones antiguas y escritores PMS; resultado CI final. Producción,
demo, datos, flags, asignaciones e invitaciones remotas permanecen intactos.
