> Estado vigente del candidato integrado: [revision del 16 de octubre de 2026](assisted-onboarding-integrated-candidate.md). Este informe conserva las evidencias y conclusiones historicas de su SHA.

# Alta asistida: revisión de compatibilidad y preparación de PR

**Estado vigente:** ver «Continuación 2026-10-15» al final. La PR sigue en b6a224f; esta continuación añade únicamente documentación, preflight y ensayos locales no subidos.

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
| 3. `supabase/sql/add_pms_connection_evidence.sql` | `2687195c4e63fcc881f4db8900c645061afd236eebf616f3e1f4f0aff1bb360f` |

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

Corrección de compatibilidad en esta fase: la comparación del trigger Apaleo pasa de `<>` a
`IS DISTINCT FROM`. Con NULL, la primera no devolvía temprano y rechazaba reservas históricas
sin proveedor, ajenas a Apaleo. La regresión PostgreSQL añade inserción y actualización de esas
filas: **7 grupos PMS PASS** en el candidato final. Cambia solo esta huella SQL; el informe
anterior conserva la huella del candidato original, que ya no es la que debe aplicarse.

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
PASS con incompatibilidad antigua explícita. PR **#55**, borrador, sin auto-merge:
https://github.com/Chispa2004/staynex/pull/55

CI completo del candidato ejecutable `316302f987df3017c9089fa3e96e051bd3c4fe8c`:
https://github.com/Chispa2004/staynex/actions/runs/38718826310 (pull_request, cuatro jobs PASS).
También PASS el run push https://github.com/Chispa2004/staynex/actions/runs/38718741132.
Logs comprobados, sin jobs omitidos/cancelados:

- Critical tests and syntax: 44 tareas, incluida sintaxis, contrato PMS, 44 comprobaciones
  webhook/tenant, validación/navegación/finalización, permisos/contexto, aislamiento y HTTP
  Security. Este último **PASS en Linux/LF**; se conserva el fallo CRLF local del informe previo.
- PostgreSQL knowledge and automation dispatch: 12 suites realmente ejecutadas. Nuevas:
  transición/preflight, 6 grupos PMS y 10 grupos invitaciones/revisión (6 aceptaciones
  concurrentes y respuesta perdida). También 20 grupos archivado/restauración y 8 alta atómica,
  además de las regresiones existentes. Docker sin red; no base remota.
- Assisted onboarding browser and PostgreSQL: build del laboratorio, cuenta existente y nueva,
  identidad equivocada/no verificada, aceptación mediante Enter, respuesta perdida/recuperación,
  persistencia/recarga, revisión de información, finalización mediante Enter y Salud del hotel
  correcto con AI/live OFF. Chromium, 1366/390, claro/oscuro, Escape móvil, sin desbordamiento.
  Auth/correo simulados; handlers y SQL reales. No es prueba con lector de pantalla ni de Auth remoto.
- Dashboard build: build PASS; temas 14, densidad 10, accesibilidad 17, Inbox 12, Tickets
  pendientes 8, carga/demo 9, atención 4, Platform 4 y navegación Azul noche 12 pruebas PASS.

Capturas del job inspeccionadas (invitación, PMS escritorio/móvil); artefacto
`assisted-onboarding-synthetic-screenshots`, solo PNG. Logs/copia privada local en .npm-cache,
fuera de Git. Preview del candidato: `GHYaSqSNdSnv28AJ4CgJ3U4gsTcK`, GitHub deployment
7089827300, `https://staynex-97u66zk22-staynex-s-projects.vercel.app`, SUCCESS para ese SHA.
Solo metadatos, ninguna prueba funcional remota.

La revisión final detectó además un defecto del runner aislado: un hijo terminado por señal
devuelve status=null y se convertía en salida 0. Se corrige a fallo (status ?? 1), con regresión
que termina exclusivamente un proceso sintético mediante SIGTERM. No cambia producto ni SQL.
El SHA/ejecución final se identifican en la cabecera y checks de la PR, que se revisan nuevamente
antes de entregar; los enlaces anteriores fijan la evidencia anterior al ajuste CI y a la
corrección NULL del trigger (6 grupos PMS entonces; 7 en el candidato final).
El informe anterior mantiene los demás fallos estáticos heredados, sin expectativas debilitadas.

**Preparado con condiciones concretas para revisión; todavía no para ejecutar migración ni
publicación.** Pendientes: destino efectivo Dashboard; catálogo/legacy; retornos Auth/SMTP y
entrega real; control de versiones antiguas y escritores PMS. Producción,
demo, datos, flags, asignaciones e invitaciones remotas permanecen intactos.

## Continuación 2026-10-15: condiciones de preparación (solo local y lectura)

Esta sección actualiza el dictamen anterior. No se modifica el informe original
`assisted-hotel-onboarding-review.md`. No se ha hecho push, editado la PR, cambiado Auth,
publicado un diagnóstico, aplicado SQL remoto ni ejecutado invitaciones reales en esta fase.

### Estado comprobado

- Rama limpia al comenzar: codex/assisted-hotel-onboarding, HEAD y PR
  `b6a224fbb46764a71c3ad407da4c6b0fe9d8d981`. PR #55 OPEN/draft, autoMergeRequest=null.
- Fetch de main: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`, sin avance.
- CI del SHA publicado: https://github.com/Chispa2004/staynex/actions/runs/38721060620 y
  https://github.com/Chispa2004/staynex/actions/runs/38721053823, cuatro jobs aprobados en
  la fase anterior. No se confunde ese CI con las nuevas pruebas locales no subidas.
- Vercel Production sigue Ready en deployment `7x7sWTVs12a9tyQLF2pQa4senG7C`, SHA main;
  alias público `staynex-chi.vercel.app`, alias git-main y URL inmutable
  `staynex-nsr2rvwqm-staynex-s-projects.vercel.app`. Preview #55 sigue siendo otro entorno.
- Railway continúa en deployment `407f5c24-c260-4c1d-add6-9d7df095073a`, una réplica
  `8a806cf9-fe83-4706-a566-d64c24b6a186`. Coinciden exactamente con la consola que acreditó
  projectRef `vblxmnqbatqrynfaasmf`, SHA base y los flags OFF. Se reutiliza esa evidencia
  del mismo proceso/versionado, no una variable de otro deployment. No se copió ninguna clave.

### Destino Vercel: conclusión acotada y comprobación mínima propuesta

| Cliente/recorrido | Origen y precedencia comprobados en código | Qué acredita y qué no |
|---|---|---|
| `dashboard/lib/supabase.js:getSupabaseAdmin` | SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY obligatorios, sin fallback a NEXT_PUBLIC; cliente nuevo por llamada, sesión persistente/refresh desactivados | Cliente de servidor de contexto, altas y aceptación; el valor efectivo no está acreditado |
| `dashboard/lib/supabase-browser.js:getSupabaseBrowser` | NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, singleton, sesión local y detectSessionInUrl | Login/signup/Realtime del navegador; valor incorporado al build, no prueba del cliente de servidor |
| `dashboard/next.config.mjs` | dotenv ../.env sin override; luego .env.local con override=true; NEXT_PUBLIC_SUPABASE_URL ||= SUPABASE_URL | Un .env.local presente podría sustituir el entorno durante carga de configuración. No convierte el fallback público en igualdad demostrada del runtime |
| `src/services/supabase.service.js:getSupabase` | SUPABASE_URL/service-role, singleton backend | Railway acreditado; no demuestra lo que usa Vercel |
| Altas/invitaciones | `getPlatformContext` → `getCurrentHotelForRequest` → getSupabaseAdmin; `/api/access-invitations` usa directamente getSupabaseAdmin y auth.getUser; RPC recibe ese mismo cliente | No hay un cliente Supabase alternativo de autenticación/aceptación con otra URL en estas rutas |
| PMS desde Dashboard | `proxyBackendPmsAction` envía la operación a backend; el backend usa su propio cliente | Dos procesos, no un único destino deducible desde el navegador |

La precedencia estándar de Next parte de process.env y después .env.production.local,
.env.local, .env.production y .env; el override explícito del proyecto puede cambiar esa
precedencia al evaluar next.config. No hay bloque nextConfig.env que inserte SUPABASE_URL
como constante pública. NEXT_PUBLIC se congela al compilar; las rutas dinámicas de servidor
leen su entorno de ejecución. El árbol Git de main solo contiene archivos .env de ejemplo:
esto no prueba qué configuración incorporó Vercel al deployment. No se leyeron .env privados.
Referencia oficial: https://nextjs.org/docs/app/guides/environment-variables

Búsqueda cerrada: metadatos de deployment/recursos, logs runtime disponibles (sin registros
útiles en el rango consultable de una hora; rangos superiores requieren otro plan), y panel
Build Logs (157 líneas, salida de compilación/serverless visible, sin evidencia del destino).
La copia completa de logs mediante portapapeles no proporcionó un contenido utilizable y no
se toma como lectura íntegra. No se provocó una petición para generar errores/logs, ni se
consultó Source buscando variables sensibles. SUPABASE_URL permanece write-only según la
lectura previa de la misma configuración. No hay diagnóstico existente en main que devuelva
el destino del cliente. Esta búsqueda no demuestra que nunca existan otros registros; demuestra
que no se obtuvo evidencia suficiente mediante las superficies autorizadas disponibles.

**Destino del servidor Dashboard NO acreditado. Preflight remoto NO ejecutado.** Tampoco se
consultaron recuentos o filas remotas para inferirlo. No se usó Preview, nombre del proyecto,
valor del navegador ni archivo local como sustituto.

Comprobación mínima para autorización separada: un parche exclusivamente diagnóstico sobre
main que registre una vez, en los logs privados de Vercel, el projectRef obtenido del
`supabaseUrl` del cliente realmente creado por getSupabaseAdmin, VERCEL_GIT_COMMIT_SHA y
VERCEL_ENV. Solo esos tres valores; sin URL completa, claves, JWT, usuario, petición o datos.
No requiere variable nueva, migración ni endpoint público; sí revisión, pruebas y despliegue
Production de ese parche. Obtener la evidencia al construir el cliente durante una lectura
existente ya comprobada sin efectos, por ejemplo GET /api/current-hotel. La salida debe salir
del runtime, no del build. No se implementó ni publicó aquí. Acreditaría el deployment nuevo
que sustituya al actual, no retroactivamente el inmutable anterior. Si Vercel proporciona al
propietario evidencia inmutable equivalente del runtime actual, se puede usar sin desplegar.
No se propone cambiar/revelar el secreto ni utilizar un error como canal de extracción.

### Preflight exacto preparado, sin ejecución remota

Se revisó todo `scripts/preflight-assisted-hotel-onboarding-readonly.sql`. Mantiene BEGIN
READ ONLY, límites statement=15s/lock=2s/idle=30s y ROLLBACK. Solo catálogo, funciones de
introspección PostgreSQL sin efectos y recuentos por categorías. No invoca RPC de negocio,
no usa DDL/DML/DO, no devuelve huéspedes, teléfonos, tokens ni directorios de correos.

Ajuste local: añade has_table_privilege, has_column_privilege, has_function_privilege,
has_schema_privilege y pg_has_role (USAGE/SET), para no confundir ACL directas con permisos
efectivos o capacidades heredadas. Regresión local: rol sintético con SELECT y pertenencia
NOINHERIT/SET; la consulta informa `anon|synthetic_reader|f|t` y deja el permiso intacto.
No se cambian las tres migraciones ni sus hashes.

Clasificación que deberá completar el resultado remoto, todavía desconocida:

| Grupo | Esperado, no afirmado remoto | Decisión ante diferencia |
|---|---|---|
| hotels, hotel_users, Auth, onboarding, Knowledge, PMS/reservations y contexto derivado | Columnas/constraints previas que usan los tres SQL; alta atómica existente | Detener, reproducir definición relevante en PG local; no añadir campos/permisos por conveniencia |
| Tablas invitaciones/revisión, RPC nuevas, columnas/evidencia y triggers PMS | Ausentes para creación, o presentes con definición compatible | IF NOT EXISTS no valida una definición distinta; comparar firmas, propietarios, RLS y ACL |
| Asignaciones active/invited/disabled; identidad ausente/no verificada/bloqueada | Categorías agregadas, sin promoción ni vinculación automática | Los active sin UUID pueden perder acceso en el modelo nuevo: resolver individualmente con identidad acreditada antes del corte, con autorización aparte |
| Service role y roles cliente | RPC privadas, dueño autorizado, search_path fijo, SELECT privado requiere BYPASSRLS real | No ampliar grants generales para forzar compatibilidad; documentar la discrepancia exacta |

### Auth: tabla de ajustes propuestos y recuperación

Lectura actual del proyecto previsto: signup ON, Email ON, Confirm email ON, anonymous OFF,
manual linking OFF. Site URL http://localhost:3000, Redirect URLs vacías, Custom SMTP OFF.
Plantilla Confirm sign up: enlace estándar `{{ .ConfirmationURL }}`; no callback personalizado.
No se modificó ningún control. La plantilla Invite user de Supabase NO es el mecanismo de
asignación de esta PR: Staynex genera un enlace privado y signup genera el correo de verificación.

| Ajuste | Actual | Propuesto exacto | Motivo / prueba posterior | Recuperación |
|---|---|---|---|---|
| Site URL | http://localhost:3000 | https://staynex-chi.vercel.app | Fallback público correcto; verificar retorno del correo y que no termina en localhost | Detener nuevas altas si falla; conservar sesiones/asignaciones. Restaurar valor previo solo como reversión de configuración, nunca presentarlo como retorno operativo válido |
| Redirect URLs | Ninguna | Añadir solo https://staynex-chi.vercel.app/invite | Es `window.location.origin + '/invite'` en AccessInvitationClient.authenticate; probar confirmación y vuelta al enlace original | Retirar únicamente esta entrada si se revierte el ensayo; no ampliar a wildcard ni Preview |
| Confirm email / Email / signup | ON/ON/ON | Mantener ON/ON/ON | Cuenta no verificada no acepta; confirmada y destinataria sí | No desactivar verificación como recuperación; pausar emisión/aceptación afectada |
| Anonymous / manual linking | OFF/OFF | Mantener OFF/OFF | No son necesarios para este flujo | Sin cambio |
| Plantilla de confirmación | ConfirmationURL estándar | Conservar | Comprobar destino real del enlace recibido y verificación; no introducir /auth/callback inexistente | Si posteriormente se edita, conservar copia privada y restaurar esa plantilla; aquí no hay edición |
| Transporte para ensayo interno limitado | SMTP Supabase incorporado | Puede mantenerse para un correo propio que YA sea miembro del equipo, dentro de la cuota vigente | Entrega real en buzón, no solo 200 de signup; comprobar membresía previamente sin crear privilegios para obtener cuota | Ante falta de entrega detener y conservar operación, no bucle de signup/resend |
| Transporte para responsables clientes | Sin SMTP propio | Reutilizar cuenta Resend existente, si dominio/remitente y capacidad quedan acreditados; configurar SMTP en Supabase con autorización específica | Verificar aceptación SMTP, entrega y retorno, sin habilitar emails operativos del hotel | Detener nuevas invitaciones; corregir credencial/remitente o restaurar configuración anterior, sabiendo que el SMTP incorporado no cubre clientes |

La documentación oficial de Supabase indica que el SMTP incorporado solo envía a miembros
del equipo del proyecto, actualmente 2 mensajes/hora, sin SLA; son límites de documentación,
no medición de cuota disponible en esta sesión. Permite una prueba interna controlada; no
acredita aptitud para clientes. https://supabase.com/docs/guides/auth/auth-smtp

Correo existente: Railway declara EMAIL_PROVIDER=resend, RESEND_API_KEY y RESEND_FROM;
solo se reveló el selector no secreto EMAIL_PROVIDER. `provider-lead-email.service.js`
usa Resend API para correos operativos de proveedores; no configura Supabase Auth. No se
leyó/copió la clave, no se llamó a Resend ni se probó envío. Esa cuenta es candidata a reutilizar,
pero dominio verificado, remitente autorizado, alcance de clave y cuota siguen sin acreditar.
No hace falta contratar otro proveedor como conclusión de este hallazgo.

Si se elige Resend, configuración pública documentada: host smtp.resend.com, puerto 465,
usuario resend; contraseña es una clave autorizada para ese destino. Fuente oficial:
https://resend.com/changelog/smtp-service y https://supabase.com/partners/catalog/resend.
El propietario de la cuenta Resend debe confirmar dominio/remitente existente, nombre visible,
cuota disponible y autorización de uso para Auth. El administrador Supabase debe introducir
la credencial mediante su panel seguro (o integración autorizada), nunca en este informe/Git/chat.
No reutilizar automáticamente la clave de Railway; preferible credencial dedicada acotada,
cuya creación/transferencia también requerirá autorización. No se propone DNS nuevo sin antes
comprobar el dominio existente; no se genera gasto ni se cambia de plan.

Flujo real y límites:
- /invite#token=... guarda token en sessionStorage y retira fragmento. Abrir no llama a aceptar.
- Alta y login se realizan en AccessInvitationClient, no dependen de un callback inventado.
  Confirmar correo no acepta el hotel. El flujo pide volver al enlace e iniciar sesión;
  no se garantiza login automático desde el fragmento de confirmación (se limpia en /invite).
- Otra pestaña/dispositivo no comparte sessionStorage: volver al enlace original. Una recarga
  conserva el token pendiente; cambiar de cuenta limpia la vista, conserva ese token.
- Inspección POST accept=false; aceptación POST accept=true; RPC valida identidad verificada,
  email, hotel, rol/asignación exactos, expiración y revocación. El navegador no decide el rol.
- Aceptación persistida con respuesta perdida se recupera sin duplicar. Acceso disabled no se
  reactiva. Después de éxito se retira token local y se enlaza al hotel de la respuesta.
- Tests sintéticos ya acreditan estas ramas; recepción real y autenticación remota siguen
  pendientes. No se presenta el Auth simulado del laboratorio como evidencia del correo real.

### Plan de control específico: consumidores y alcance

Referencias en main f627f8b (los números de línea de archivos modificados pueden diferir):
`dashboard/lib/user-invitations.js:4,30,80`, `dashboard/lib/current-hotel.js:294`,
`dashboard/lib/platform.js:81`, `dashboard/lib/onboarding.js:getOnboardingContext`,
`dashboard/lib/knowledge.js:74`, `dashboard/lib/local-knowledge.js:95`,
`dashboard/lib/experiences.js:117`, `dashboard/lib/experience-bookings.js:59`.

El riesgo no se limita a POST /api/auth/resolve-invitations: el resolutor por defecto hace
UPDATE antes de evaluar varios permisos del endpoint. Incluso GET Salud/Knowledge puede
alcanzarlo. El nuevo helper desactiva el attach y limita asignaciones a user_id, pero una URL
antigua sigue ejecutando código anterior. Además el antiguo SELECT admite coincidencia de
correo incluso para active sin UUID. No se confunde bloquear escrituras con retirar ese acceso.

Se añade `scripts/fixtures/assisted-transition-route-scope.json`: 50 grupos de rutas/métodos
Vercel derivados conservadoramente del main exacto y sus wrappers, incluyendo HEAD de GET.
Es un inventario de ensayo, NO reglas instaladas ni sintaxis lista para pegar en un firewall.
Los dominios antiguos de otro SHA requieren su propio alcance o denegar toda su API tras el
corte. Las exclusiones readOnly solo acreditan ausencia del attach, no de cualquier otro efecto.

| Consumidor | Riesgo y momento de pausa | Control específico propuesto / afectación | Acreditación de drenaje y reapertura |
|---|---|---|---|
| LoginClient → POST /api/auth/resolve-invitations; POST /api/current-hotel | Autoaceptación por correo; cerrar antes de emitir nuevos tokens o migrar | Denegar esos métodos en todos los alias/deployments antiguos; afecta resolución tras login/cambio de hotel, no autenticación Supabase | Peticiones admitidas terminadas y sin retry pendiente; abrir solo código nuevo y contrato completo |
| Contexto por defecto y wrappers anteriores, incluidos GET Salud/Knowledge/Platform/Usuarios | Una lectura puede conceder antes de rechazar otra operación | Matriz exacta de 50 grupos; 503 y Retry-After en puerta controlada, no 200. Mantener páginas estáticas y GET readOnly de Dashboard/Inbox/reservas/tickets/current-hotel; algunas funciones quedarán temporalmente en mantenimiento | Medir operaciones admitidas completas por deployment, no solo fin de conexión HTTP. Mantener cierre hasta retiro de versiones antiguas |
| Antiguos Previews, URL inmutable y alias git-main | Eludir el alias público o el modelo nuevo mediante SELECT por email | Tras corte, bloquear API de todos los deployments antiguos por identidad/host del deployment; no confiar en un header SHA aportado por cliente | Verificar lista de deployments y acceso directo denegado; no reabrirlos. El sitio nuevo conserva sus rutas |
| Gestión de usuarios, altas e invitaciones | Cambios de rol/status durante la ventana | Pausar sus métodos mutantes y el endpoint nuevo /api/access-invitations hasta contrato listo; conservar peticiones/resultados, no recrear hotel | UUID y resultado persistido son la fuente para recuperar respuesta perdida; no repetir alta con idempotency key nueva |
| POST /api/pms-connections/sync y /test; escritura /api/pms-connections | Proxy e importación, cambio de revisión/configuración | Gate de esas operaciones en Vercel; la lectura PMS antigua también entra en matriz por contexto. No basta ocultar botones | Sin operaciones admitidas/async pendientes; reabrir nuevos consumidores solo con vínculo/evidencia y autorización PMS separada |
| Railway POST /integrations/apaleo/sync, /integrations/pms-connections/sync, /test, POST /integrations/pms-connections, PATCH/DELETE /integrations/pms-connections/:id | Bypass directo a backend, escritura no vinculada/evidencia vieja | Gate HTTP previo al handler en TODAS las réplicas/entradas, mantener GET /health. Ninguna modificación del flag del hotel o su conexión | Contar handler/promesas completas y comprobar retiro del proceso viejo; WAF Vercel no cubre este dominio |
| POST /integrations/apaleo/webhook | Petición en curso, reintentos y huéspedes derivados antes del rechazo de reserva | Cerrar admisión antes de migración 3; mantener eventos ya durables. Acreditar retención/reintento del emisor antes de devolver fallo temporal, nunca falso 200 | Inventario de eventos processing/failed sin contenido personal; no resetear estados para forzar replay. Contrato nuevo y replay autorizado por identidad de evento |
| POST /webhooks/pms/reservation-created antiguo | Puede escribir pms_provider=apaleo sin contrato | Bloquear temporalmente este ingreso completo (incluye otros proveedores), sin cambiar payload a mock; candidato rechaza Apaleo por esta vía | Sin peticiones admitidas; reapertura del handler nuevo después de versiones compatibles |
| CLI/jobs/reintentos externos | No pasan por WAF; consumidores aún no acreditados podrían escribir durante transición | Pausar únicamente ejecutores que importen o cambien conexión/reservas; confirmar con operador técnico la ausencia o listado de schedulers externos | Sin proceso viejo/retry ejecutable antes de migrar. No deducir ausencia por repositorio |

`src/server.js` monta /integrations y /webhooks/pms; no arranca un cron de importación.
Railway: main automático, Wait for CI OFF, una réplica, sin cron ni predeploy; /health es
healthcheck; restart On Failure, no teardown personalizado. No cambiar esos ajustes aquí.
`scripts/jobs-pms-intelligence.js` recalcula contexto y snapshots desde reservas; no es
importador Apaleo. No confundirlo con una sincronización, pero preservar sus snapshots como
histórico y coordinarlo si estuviera programado externamente. Otros jobs no se asumen activos. Incluir en el inventario de ejecutores manuales `scripts/test-apaleo-sync.js`, `scripts/test-apaleo-webhook.js` y cualquier caller directo de syncHotelReservations/syncReservationsFromApaleo; que se llamen tests no acredita aislamiento de una invocación externa.
El cliente Apaleo contiene reintentos en memoria; un timeout de la petición proxy no prueba
que terminó el trabajo backend. No hay contador de drenaje operativo acreditado actualmente.

**Implementación remota del gate y prueba de drenaje pendientes.** El ensayo local no demuestra
que el plan de Vercel permita todas las reglas ni que Railway tenga una puerta de rutas instalada.
No activar un CAPTCHA/DDoS general: rompería webhooks y no resuelve el contrato. Propuesta
concreta previa al corte: validar capacidad del WAF para la matriz/hosts sin coste; si no basta,
preparar una versión de mantenimiento mínima que cierre solo esas operaciones y exponga al
operador contadores de trabajos admitidos por réplica/deployment. Requiere revisión y despliegue
previo autorizado; no está implementada en la aplicación aquí. No usar una espera arbitraria
como evidencia de cero en curso. Si no puede acreditarse, NO aplicar migración 3 ni abrir nuevas
invitaciones. Un contador por proceso perdido tras reinicio tampoco acredita el resultado de
consultas ya enviadas: conciliar sus resultados/recibos o mantener bloqueado.

### Secuencia de publicación y recuperación revisada

1. Resolver destino Vercel mediante evidencia del runtime (parche diagnóstico separado si es
   necesario). Si requiere nuevo main, rebasar/revisar el candidato y repetir solo checks afectados.
2. Con ambos destinos acreditados, ejecutar el preflight revisado READ ONLY. Reproducir cualquier
   diferencia local. Clasificar accesos históricos sin UUID, disabled y pendientes; preservar
   todas las filas. No asignar por nombres/correos ni convertir invited a active como backfill.
3. Resolver Auth y preparar ensayo interno con un buzón controlado y permitido. Confirmar plan
   de correo para clientes separadamente. No es necesario activar PMS/WhatsApp para el ensayo.
4. Acreditar puertas de entrada, todos los hosts/réplicas y schedulers externos. Cerrar admisión
   de las operaciones identificadas y acreditar drenaje. Retener inciertos como inciertos,
   sin reencolar ni llamar de nuevo al proveedor por falta de respuesta.
5. Aplicar 1 → 2 → 3, verificando cada transacción antes de continuar. Las primeras dos son
   aditivas, pero no neutralizan escritores antiguos. La tercera exige controlar Apaleo antes.
   Verificar contratos/permisos/PostgREST, sin business RPC de prueba ni mensajes reales.
6. Solo entonces merge normal del SHA aprobado. Vercel y Railway se despliegan independientemente
   al cambiar main; no hay orden secuencial garantizado ni se presupone Wait for CI. Mantener
   gates mientras cualquier réplica/deployment nuevo no esté listo o exista trabajo viejo.
7. Acreditar SHA y contrato de todos los consumidores, retirar acceso API a deployments viejos,
   resolver operaciones en curso; abrir rutas nuevas de invitación/configuración. PMS permanece
   bloqueado hasta su validación y autorización independientes. Flags operativos continúan OFF.
8. Ensayo técnico de la sección siguiente. No abrir a clientes hasta recibir/verificar correo y
   validar permisos. Mantener nuevas funciones cerradas si falla una condición indispensable.

Fallo antes de migrar: no modificar datos; mantener puertas cerradas hasta aclarar.
Fallo entre migraciones: conservar partes aplicadas, no ejecutar down destructivo, resolver hacia
delante tras comparar catálogo. Fallo de un deployment: mantener cierres, sin rollback al attach
por correo ni al escritor Apaleo sin vínculo. Fallo de Auth/correo: detener nuevas emisiones,
conservar aceptación ya persistida; no borrar cuentas/asignaciones ni enviar correos en bucle.
Logs ausentes y timeouts no demuestran ausencia de efectos. Reabrir requiere contratos y versiones
acreditados, además del resultado de cualquier operación incierta relevante.

### Ensayo real posterior preparado, NO ejecutado

Identificador de plan: PR55-ALTA-ASISTIDA-QA. Nombre propuesto del único hotel nuevo:
`Staynex QA técnico alta asistida PR55`. Todavía no existe por esta fase: UUID se registrará
privadamente desde la respuesta del alta autorizada, nunca se inventará ni se pedirá introducirlo.
Usar ese mismo registro para todos los reintentos. Buzón: cuenta técnica bajo control de Staynex,
por confirmar con su propietario; si se mantiene SMTP incorporado debe ser YA miembro del equipo
Supabase. No elevar permisos para que el correo sea elegible. Segunda identidad técnica propia
para negativos, sin correo de cliente ni permiso sobre hoteles operativos.

1. Staynex autorizado crea una sola alta con idempotency key estable, datos ficticios y flags OFF.
   Guarda UUID, SHA, actor/fecha e identificador de operación en evidencia privada sin secretos.
2. Emite enlace de esa asignación admin. Entrega privada controlada; no pegar el token en informe,
   logs, tickets ni capturas. Abrir y recargar: ninguna aceptación/actividad operativa.
3. Cuenta nueva: signup y recepción real de verificación en buzón. Registrar por separado hora
   de solicitud, entrega observada, confirmación y retorno /invite. Un 200 o plantilla visible
   no prueba entrega. Cuenta existente: login sin reenviar signup ni crear cuenta duplicada.
4. Volver al enlace original si se verificó en otra pestaña; entrar con cuenta correcta. Otra
   cuenta y cuenta no verificada: denegación sin cambiar asignación. Comprobar invitación no acepta.
5. Aceptar explícitamente, confirmar mismo UUID/rol y recuperar una recarga/respuesta perdida
   desde el resultado persistido, sin nuevo enlace/cuenta/hotel por accidente.
6. Completar datos e información sintéticos y revisión. Registrar dependencias externas reales
   del ensayo sin inventar conexión. Finalizar por UI y llegar a Salud del UUID acreditado.
   PMS/WhatsApp pendientes, IA/envíos/automatizaciones OFF; no hacer sync/test del proveedor.
7. Manipular identificador usando únicamente un segundo hotel técnico autorizado o un UUID
   inexistente: denegación. No leer contenido de otro hotel real para fabricar evidencia.
8. Al terminar, revocar enlaces no aceptados desde Platform; para acceso YA aceptado usar
   deshabilitación de la asignación por UI/handler autorizado (`/api/settings/users` DELETE
   hace soft disable). Revocar un enlace no sustituye revocar acceso aceptado. Comprobar que
   la sesión existente y reintento ya no abren ese hotel. No borrar ledger, hotel, Auth user,
   reservas ni otras asignaciones. Anotar trazabilidad; archivado técnico sería autorización
   separada, no limpieza implícita. No reactivar disabled durante recuperación.

### Pruebas y diff de esta continuación

- `test-assisted-transition-drain.js`: 6 grupos PASS. Matcher local de la matriz (50 rutas
  Vercel/7 grupos backend), GET/HEAD, alias, reintentos, barrera de trabajo admitido, SQL real
  de autoasignación antiguo después de cerrar admisión, respuesta perdida, preservación y
  bloqueo de reapertura por instalación parcial/versiones mixtas/URL vieja. Es un modelo local
  de control, no prueba de configuración del WAF ni instrumentación remota.
- Primera ejecución del nuevo ensayo falló por identidad sintética duplicada en el control
  negativo (constraint hotel_id/user_id); corregido el fixture con una segunda identidad,
  sin cambiar expectativas ni código de producto. Repetición completa PASS.
- `test-assisted-onboarding-transition.js`: PASS con preflight ampliado, instalación ausente/
  parcial/repetida y detección de permiso SET ROLE sin modificarlo.
- `test-access-invitations-postgres.js`: 10 grupos PASS, seis aceptaciones concurrentes,
  revocación, perdido/reintento, expiración/sustitución, identidad y hotel; revisión de información.
- `test-pms-connection-contract-postgres.js`: 7 grupos PASS, revisión/configuración, respuesta
  antigua/error más reciente, vínculo hotel/propiedad, conexión deshabilitada e histórico NULL.
- Sintaxis del test nuevo y git diff --check PASS. No se repite build/navegador: no se modifica
  código de aplicación ni estilos; se conserva su evidencia CI b6a224f, sin atribuirla al diff local.
- Docker PostgreSQL 17.10, network=none, tmpfs y eliminación solo del contenedor sintético propio.
  No se ha usado producción para estas pruebas. Cero llamadas IA, proveedores o emails; cero gasto.

Diff local: este informe; preflight y su regresión; nuevo inventario de rutas y ensayo de drenaje.
No cambian los tres SQL de migración, Auth de aplicación, funciones de producto ni CI. No push,
commit nuevo, PR editada ni despliegue en esta fase. Los archivos nuevos deben revisarse antes de
incorporarlos al CI; el ensayo de drenaje aún no forma parte de la ejecución remota de #55.

### Propuesta cerrada de autorizaciones futuras y dictamen

No se solicita un permiso abierto para continuar. Orden propuesto, con puntos de parada:

A. Solo si no hay evidencia inmutable alternativa: revisar/publicar el parche diagnóstico mínimo
   de runtime antes descrito, sin exponer secretos ni tocar SQL/flags. Acreditar el deployment
   sustituto y conservar/retirar luego esa instrumentación según revisión.
B. El preflight de lectura ya está autorizado, pero solo puede ejecutarse cuando A acredite
   el destino. Compatibilidad del catálogo y conservación de accesos son condiciones, no una
   autorización tácita para corregir permisos o vincular usuarios.
C. Autorizar Site URL y la única Redirect URL exactas de la tabla; mantener verificación.
   Elegir ensayo interno con SMTP incorporado o autorizar configuración Resend separada con
   remitente/credencial acreditados. No contratación ni cambio de plan implícitos.
D. Autorizar la instalación/activación temporal de puertas por rutas/hosts y el drenaje medible;
   si hace falta versión de mantenimiento, revisarla y publicarla antes. Incluir consumidores
   directos Railway y schedulers identificados, sin tocar flags ni parar toda la aplicación por defecto.
E. Solo con A–D y preflight compatible: autorizar las tres migraciones exactas y sus hashes de
   la tabla anterior, merge normal del SHA entonces aprobado, despliegues automáticos y comprobación
   de todas las versiones. Cualquier SQL/hash nuevo exige revisión concreta, no permiso genérico.
F. Autorizar el único hotel/correo técnicos identificados y el ensayo real acotado, incluida
   entrega de verificación y soft disable final de sus accesos. No mensajes a huéspedes ni PMS.

**DICTAMEN: BLOQUEADO PARA MIGRACIÓN/PUBLICACIÓN** mientras no se acredite el destino efectivo
Dashboard. También quedan por acreditar catálogo/accesos históricos, puerta/drenaje real y
retorno/entrega Auth. La preparación local de esas comprobaciones está hecha; no se afirma
compatibilidad remota ni disponibilidad de controles aún no instalados. PR #55 permanece borrador,
sin auto-merge. Producción, demo, permisos, datos y flags se conservan intactos.
