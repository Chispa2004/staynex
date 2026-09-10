# Revisión acotada: traducción y hotel_knowledge (2026-09-08)

Seguimiento actualizado de permisos PostgreSQL 17 y despliegue: [preparación de despliegue](inbox-privileges-deployment.md). Inventario remoto aportado compatible; los tres helpers desplegados coinciden con los probados localmente. Las correcciones y el tratamiento histórico se conservan. Aplicación de SQL y verificación funcional desplegada pendientes.

Rama: `codex/reception-message-dashboard`. HEAD inicial y final: `be806cb9934ccf1ac27963eecc3630c46e4d39d1`. Árbol inicialmente limpio. Leídos README y docs/09-testing.md; no se encontraron AGENTS.md en el repositorio ni sus directorios ascendentes. No se hizo commit, push, despliegue, acceso Supabase remoto ni cambios en .env. El trabajo previo se conserva.

## Veredicto y alcance de la evidencia

| Superficie | Resultado local | Entorno desplegado |
| --- | --- | --- |
| Traducción de mensajes | Corregida la lectura prematura y el contexto opcional del backend; ruta pública ya rechazaba mensajes de otra conversación/hotel | Pendiente de publicar y comprobar con sesión autorizada y mensajes sintéticos |
| hotel_knowledge | Corregidos fallback entre hoteles, permisos del starter y defensas de escritura; CRUD principal ya estaba filtrado | RLS/grants/nulabilidad reales pendientes de inspección; migración preparada, NO aplicada |

Las hipótesis antiguas no se asumieron ciertas. Las pruebas guardadas en `.npm-cache/translation-knowledge-isolation/before.log` distinguen los controles que ya pasaban de los defectos reproducidos. El código probado se conserva en una copia aislada con manifiesto de 558 archivos.

## Traducción: trazado y hallazgos

1. `dashboard/components/InboxClient.js:1187`: requestMessageTranslation llama `/api/translate` con getAuthHeaders, messageId, texto e idiomas. Puede omitir hotelId y así funciona el cliente real.
2. `dashboard/lib/current-hotel.js:254`: obtiene usuario mediante auth.getUser y asignación autorizada; `dashboard/lib/supabase.js:3` usa cliente administrativo service_role. Los tests de contexto existentes acreditan que un tenant ordinario no puede cambiar de hotel arbitrariamente.
3. `dashboard/app/api/translate/route.js:26`: exige hotel y permiso inbox. Ya validaba la conversación contra hotel.id e ignoraba body.hotelId. Por ello NO se reprodujo una fuga pública A→B a través del dashboard. Se añadió hotel_id también a la primera selección de identidad del mensaje, que antes consultaba metadatos por ID sin ámbito.
4. `src/routes/messages.routes.js:11` protege `/messages/translate` con requireInternalApiToken (`src/middleware/security.middleware.js:34`). No es un endpoint anónimo. La prueba sin token/con token falso devuelve 401/403 sin entrar en traducción.
5. Defecto reproducido en el controlador anterior: seleccionaba content/metadata por ID antes de validar conversación/hotel y solo rechazaba otro hotel cuando hotelId estaba presente. La llamada interna sin hotelId llegaba al traductor. Ahora `src/controllers/messages.controller.js:22` consulta identidad filtrada por hotel, valida conversación y solo después selecciona contenido/cache, manteniendo filtros en el fallback de columnas legacy. Contexto ausente se rechaza con 400 antes de consultar. Petición A→B con contexto A devuelve 404 y cero lecturas de contenido B/cero llamadas al traductor.
6. El texto de un mensaje identificado procede del registro autorizado; el navegador no sustituye el contenido que se cachea para ese ID. Cache updates también filtran hotel y conversación. Traducción legítima, hit de cache, fallback legacy y borrador sin messageId siguen funcionando. `src/services/translation.service.js:97` recibe texto solo después de estos controles; proveedor sustituido por función controlada en las pruebas, cero llamadas reales a IA.

## hotel_knowledge: lecturas, permisos, propietarios y base

- CRUD del dashboard ya usa hotel del servidor: `dashboard/lib/knowledge.js:73` contexto/permisos; lectura :94, creación :129, actualización :159 y borrado :202. El payload no puede reasignar hotel. Owner/admin/manager manejan entradas; receptionist maneja operativas y no categorías protegidas; housekeeping/maintenance/analyst carecen de permisos. Probadas las siete funciones de rol en lectura/alta/actualización/borrado, IDs B frente a A y payload manipulado. Se corrigió el acceso a propiedades de `null` en isProtectedKnowledgeEntry: impedía la creación legítima de recepción y errores de objetivos ausentes; no se amplían permisos.
- `dashboard/app/api/onboarding/knowledge-starter/route.js:16` antes permitía escribir conocimiento a roles sin knowledge_base_manage. Reproducido housekeeping→200/escrituras. Ahora 403 antes de consultar/escribir. Sus actualizaciones incorporan también hotel_id. Los dos upserts de demos (`src/services/demo-data.service.js:770` y :2348) preservan el filtro de hotel desde la selección hasta la actualización.
- `src/services/knowledge.service.js:132` ya filtra lecturas y fallback de columnas por hotel_id. `searchKnowledge` antes buscaba en getDefaultHotel cuando no encontraba datos propios: reproducida respuesta con hotel_id B para una consulta de otro hotel sin entradas. Se elimina ese fallback, incluso si un llamador antiguo pasa allowDemoFallback:true. No existía contrato de registros globales que autorizase esa lectura. Crear/editar/borrar desde el servicio exige hotel explícito; `getHotelKnowledge` en supabase.service también devuelve vacío sin contexto.
- Consumidores de service_role revisados: knowledge.service; supabase.service:getHotelKnowledge; staynex.service:findKnowledgeAnswerWithMetadata/getKnowledgeForHotel; automation.service:getKnowledgeForHotel; golive-readiness.service (consulta filtrada); dashboard/lib/onboarding (lectura y fallback filtrados); onboarding/knowledge-starter; demo-data (lecturas/upserts/borrados conocidos); dashboard/lib/knowledge.
- Excepción intencionada: `dashboard/lib/platform.js:371` agrega varios hoteles para la consola interna; `getPlatformContext:85` exige platform_console, y las rutas de plataforma lo llaman antes de obtener el overview. No se confunde esta superficie administrativa con un workspace de hotel ni se modifica en este pase. No se encontraron lecturas de NULL como conocimiento global de huéspedes.
- `supabase/schema.sql:69` define hotel_id UUID NOT NULL/FK. `add_hotel_id_to_knowledge.sql` podía añadirlo nullable a tablas antiguas y asignar automáticamente NULL al hotel demo. Se retiró esa asignación arbitraria para ejecuciones futuras; no se reparan ni reasignan registros existentes. Una instalación antigua puede seguir siendo nullable: el archivo por sí solo no acredita el estado desplegado.
- No se encontró hotel_knowledge en las tablas protegidas por rls_phase_1/phase_2 ni otras políticas/grants dedicados. PostgreSQL nuevo creado desde schema.sql confirmó RLS=false. Esto NO demuestra los grants o RLS actuales de Supabase producción.

## Protección de base preparada, no aplicada a producción

`preflight_hotel_knowledge_isolation.sql`: SOLO LECTURA, tipos/nulabilidad, estado RLS, grants por rol, cantidad de filas sin dueño/huérfanas y guardas de propietario/roles. No muestra textos ni PII.

`protect_hotel_knowledge_backend_only.sql`: repite guardas, habilita RLS sin policies de navegador, revoca permisos directos PUBLIC/anon/authenticated y mantiene CRUD de service_role. Este diseño conserva el acceso a través de las rutas de servidor autorizadas existentes, incluyendo recepción. Service_role elude RLS: los filtros/roles del código siguen siendo imprescindibles. Se rechazan policies o grants de columnas inesperados antes de DDL para revisarlos; no se sobrescriben silenciosamente. No introduce NOT NULL, backfill, borrado o cambio de propietarios.

Validada desde cero en PostgreSQL 17.10 oficial local, contenedor exclusivo sin red/puertos, PGDATA tmpfs. Dos bases sintéticas: schema canónico y tabla legacy originalmente sin hotel_id. Ocho pruebas PASS: nulabilidad/RLS del schema; preflight y migración; CRUD backend filtrado; cuatro operaciones bloqueadas para cada rol browser; RLS conserva aislamiento aunque se reintroduzca un grant; service_role puede eludir RLS; policies existentes rechazadas; fila legacy NULL intacta aun existiendo hotel demo. Los grants permisivos iniciales del ensayo fueron representados expresamente; no se atribuyen a producción. Contenedor eliminado, recibo y logs preservados fuera de Git.

## Pruebas de código

- `npm run test:translation-knowledge-isolation`: PASS, 18 escenarios con cuerpos productivos y dependencias controladas.
- `npm run test:auth-hotel-context`: PASS.
- `npm run test:permissions`: PASS.
- `npm run test:inbox`: PASS.
- `npm run test:messages-tenant-isolation`: PASS.
- `npm run test:checkin-demo`: PASS.
- `npm run test:http-security`: PASS.
- `npm run check:syntax`: PASS; complementario, no evidencia suficiente por sí mismo.
- `scripts/test-knowledge-isolation-postgres.cjs`: ocho comprobaciones PASS en PostgreSQL real.

`npm run dashboard:build`: PASS (60 s). `git diff --check`: PASS. Pruebas/build en copia sin .env ni credenciales heredadas; SEND_AUTOMATIONS=false, mock AI y bloqueo de red externa. No se ejecutaron scripts antiguos que cargan dotenv y crean/siembran hoteles remotos (`test-knowledge-hotel.js`, `test-knowledge.js`, `test-language.js`). Se actualizó la expectativa del primero: ahora exige ausencia de fallback entre hoteles; la regresión equivalente sí se ejecutó aislada.

## Archivos modificados

dashboard/app/api/translate/route.js; src/controllers/messages.controller.js; dashboard/lib/knowledge.js; dashboard/app/api/onboarding/knowledge-starter/route.js; src/services/knowledge.service.js; src/services/supabase.service.js; src/services/demo-data.service.js; supabase/sql/add_hotel_id_to_knowledge.sql; supabase/sql/preflight_hotel_knowledge_isolation.sql; supabase/sql/protect_hotel_knowledge_backend_only.sql; scripts/test-translation-knowledge-isolation.js; scripts/test-knowledge-isolation-postgres.cjs; scripts/test-knowledge-hotel.js; package.json; este informe.

## Pendiente del entorno desplegado

Inspeccionar con autorización el catálogo real mediante el preflight, identificar cualquier NULL y su intención funcional sin asignarlo, y revisar policies/grants inesperados. La migración preparada necesita evaluación/autorización separada antes de aplicarse. Después de publicar las correcciones, repetir A/B con usuarios y mensajes sintéticos en el entorno autorizado, incluyendo hotelId omitido/manipulado y control de ausencia de invocación del proveedor. La evidencia local no reproduce GoTrue/PostgREST ni acredita cambios desplegados.

## Seguimiento del diff y preparación de demo — 2026-09-09

Esta sección actualiza el veredicto anterior sin sustituir su evidencia histórica. Misma rama `codex/reception-message-dashboard` y mismo HEAD `be806cb9934ccf1ac27963eecc3630c46e4d39d1`. Se preservaron todos los cambios pendientes; no se hizo commit, push, despliegue ni cambio de datos o SQL remoto. README e instrucciones revisados; no hay AGENTS.md aplicable. Todas las ejecuciones de aplicación usaron SEND_AUTOMATIONS=false y datos sintéticos; no se cambiaron archivos .env.

### Resultado de la revisión

| Superficie | Código local actual | Demo desplegada |
| --- | --- | --- |
| Traducción | Correcciones previas confirmadas y caché compartida corregida | Pendiente de publicar, verificar configuración y revisar traducciones históricas |
| hotel_knowledge | Filtros/fallbacks confirmados; starter ahora respeta también entradas protegidas | Catálogo efectivo desconocido; SQL incremental preparado y probado localmente |

**Código listo para commit: sí. No equivale a protección verificada de la demo.** El SQL no debe aplicarse sin identificar el proyecto y revisar el preflight. Si aparecen políticas, permisos heredados, columnas o roles incompatibles, requiere una adaptación explícita antes de aplicar.

### Autorización y caché de traducción

- La cadena de confianza es `InboxClient.js:1187` → `dashboard/app/api/translate/route.js:26` → `getCurrentHotelForRequest` (`dashboard/lib/current-hotel.js:254`) → `getInternalApiHeaders` (`dashboard/lib/internal-api.js:1`) → middleware `requireInternalApiToken` (`src/middleware/security.middleware.js:43`) → controlador. El servidor obtiene la identidad mediante auth.getUser y asignaciones activas; un usuario de un hotel no obtiene acceso a otro mediante body, cabecera, query o cookie. La ruta ignora body.hotelId y transmite hotel.id del contexto autorizado.
- El backend autentica al servidor llamante mediante token interno, no vuelve a validar el JWT del usuario. Exigir hotelId en el controlador NO es la autorización: la autorización depende de esta cadena y de mantener el token interno exclusivamente en servidores. Un poseedor legítimo de esa credencial tiene capacidad de servicio entre hoteles. Verificar en el despliegue que ambos servidores comparten el token interno correcto, que no es público y que ninguna ruta alternativa omite el middleware.
- `src/controllers/messages.controller.js:22` valida identidad de mensaje y pertenencia de conversación antes de seleccionar content/metadata, y conserva hotel/conversación en lectura normal, fallback de columnas y escritura de caché. No hay fallback que retire hotel_id si falta la columna: falla cerrado.
- Nuevo fallo reproducido: `src/services/translation.service.js` compartía un Map sin hotel y normalizaba puntuación, acentos y mayúsculas al crear la clave. La caché podía reutilizar una traducción entre hoteles o textos distintos. La clave actual (`:21`) contiene hotel autorizado, texto exacto procesado, idiomas y finalidad. Sin hotel no consulta ni escribe el Map. Inbox, traducción de entrada y traducción de salida reciben su hotel existente mediante el controlador, `staynex.service.js:367` y `message.service.js:51`; no se cambian selección de hotel, idiomas, IA gates ni envíos.
- La caché persistida que responde `/messages/translate` solo se reutiliza si lleva procedencia `cache_scope=hotel-v1` y el mismo hotel_id (`messages.controller.js:174`). Las nuevas escrituras incorporan ambos campos (:85). Entradas antiguas o marcadas con otro hotel se recalculan al solicitar traducción, sin migración ni barrido automático. Las pruebas no hicieron llamadas reales al proveedor.
- **Límite histórico:** Inbox también presenta traducciones persistidas directamente al cargar mensajes (`InboxClient.js:217,1934`). Este pase no borra ni transforma esos registros; el marcador del endpoint no sanea retroactivamente lo ya almacenado. Antes de aceptar la demo, usar mensajes sintéticos cuya procedencia se conozca y determinar si hace falta invalidar traducciones derivadas anteriores. Cualquier invalidación requiere autorización separada, ámbito explícito y conservación del mensaje original; nunca asumir que todas están contaminadas. La caché en memoria desaparece al reiniciar todas las instancias del backend actualizado.

### Knowledge y compatibilidad con acceso exclusivo de servidor

| Consumidor | Autorización/ámbito | Efecto del SQL propuesto |
| --- | --- | --- |
| KnowledgeBaseEditor → /api/knowledge y /api/knowledge/[id] | `dashboard/lib/knowledge.js:73`: sesión, permiso knowledge_base/knowledge_base_manage; hotel.id forzado en CRUD; restricciones de recepción | Conserva operaciones mediante cliente servidor service_role |
| Onboarding y resumen usado por AppShell | `dashboard/lib/onboarding.js:131`: hotel autorizado; `loadKnowledgeEntries:55` filtra hotel incluso en legacy; devuelve resumen de su hotel | No necesita permisos SQL del navegador |
| knowledge-starter | Permiso knowledge_base_manage antes de consultar, y ahora control de entradas protegidas antes de escribir cualquier elemento del lote | Reception puede inicializar entradas operativas; no sobrescribe entradas administrativas; manager conserva su permiso |
| Backend knowledge/supabase, IA y readiness | Servicios internos reciben hotel resuelto; lecturas normales/legacy filtradas; escrituras requieren hotel; eliminado fallback al hotel demo | service_role conserva CRUD; los filtros siguen siendo imprescindibles |
| Generación/limpieza de demo | Rutas de servidor con controles de demo/plataforma y token interno; selección/upserts/borrado de knowledge por hotel | No depende de acceso directo del navegador |
| Consola interna de plataforma | `getPlatformContext:85` exige platform_console antes de `getPlatformOverview:371`; agregación entre hoteles intencionada | Se conserva acceso administrativo de servidor |

No se encontró consumidor de navegador que consulte hotel_knowledge directamente: KnowledgeBaseEditor, StepKnowledgeBase y AppShell llaman APIs del servidor. `dashboard/lib/supabase.js:8` y `src/services/supabase.service.js:65` usan SUPABASE_SERVICE_ROLE_KEY. Los servicios de bajo nivel no autorizan usuarios por sí solos; dependen de los puntos de entrada anteriores. No se atribuye aislamiento RLS a service_role.

La prueba adicional del starter reprodujo receptionist → 200 al sobrescribir una entrada cuya categoría era security. Ahora importa las comprobaciones existentes del editor y rechaza el lote con 403 antes de toda escritura (`dashboard/app/api/onboarding/knowledge-starter/route.js:41`); manager y recepción con entradas operativas siguen funcionando. El starter consulta el registro completo del hotel para inspeccionar también scopes de protección si existen. Ningún contenido de otro hotel llega al resultado.

### Preflight y evidencia remota

**No se ejecutó ninguna consulta remota.** La configuración local de backend y dashboard coincide en `vblxmnqbatqrynfaasmf.supabase.co` (referencia `vblxmnqbatqrynfaasmf`). Esto identifica el proyecto configurado localmente, no demuestra la configuración de Vercel/Railway en la demo. No se imprimieron claves ni contenidos de conocimiento.

En los archivos de entorno habituales y el entorno del proceso se encontró la URL y una clave service_role, pero no conexión PostgreSQL/credenciales SQL ni token de gestión de Supabase. No hay vínculo local de Supabase CLI, herramientas Supabase de consulta disponibles ni token en sus ubicaciones habituales. Una clave REST service_role no permite ejecutar este inventario SQL por sí sola. No se intentaron RPCs, cambios de esquema ni reutilizar una sesión de aplicación que pudiera generar escrituras.

Falta: (1) confirmar desde la configuración del despliegue cuál es el proyecto de la demo; (2) acceso al SQL Editor de ese proyecto o una conexión PostgreSQL autorizada con lectura completa de las dos tablas para contar NULL/huérfanos. No compartir credenciales en el chat.

Consulta manual revisada: **ejecutar íntegro `supabase/sql/preflight_hotel_knowledge_isolation.sql` en ese proyecto**, desde BEGIN TRANSACTION READ ONLY hasta ROLLBACK, y conservar todos los conjuntos de resultados. Solo consulta catálogos/metadatos y dos recuentos; el bloque DO únicamente comprueba condiciones y puede lanzar error. No hay DDL, grants ni operaciones sobre filas.

Ahora informa de: transacción read_only, versión/rol/propietario; RLS y FORCE RLS; tipos y nulabilidad; restricciones y FK con convalidated; políticas USING/WITH CHECK; grants efectivos de tabla y columna, roles BYPASSRLS/superuser/membresía service_role; ACL explícitas; NULL y referencias huérfanas. Las políticas o grants existentes ya no impiden obtener el inventario. Si la visibilidad de filas está filtrada por RLS, rechaza los recuentos en vez de presentar un cero engañoso. No emite un PASS automático. Si falla un requisito o hay error de permisos, ejecutar ROLLBACK si la sesión permanece abierta y entregar el error/metadatos, sin intentar ampliar acceso.

RLS, políticas, grants, nulabilidad, FK, recuentos y diferencias **remotos permanecen desconocidos**. No se reutilizan resultados de PostgreSQL local como evidencia Supabase.

### SQL incremental, orden y recuperación

1. Confirmar proyecto y configuración del despliegue; mantener SEND_AUTOMATIONS=false. Obtener/guardar el preflight completo y comprobar que las APIs de Knowledge/onboarding usan el cliente servidor del mismo proyecto, con schema USAGE y CRUD de service_role. Verificar requisitos de columnas y las guardas del archivo de protección.
2. Publicar, en un paso posteriormente autorizado, las correcciones de backend y dashboard. Reiniciar todas las instancias del backend para descartar el Map anterior. El cambio de caché no requiere columna nueva: usa metadata ya existente y mantiene el fallback legacy.
3. Aplicar, solo con autorización separada y preflight compatible, **`supabase/sql/protect_hotel_knowledge_backend_only.sql`**. Este es el cambio incremental para una base existente. No ejecutar de nuevo `add_hotel_id_to_knowledge.sql`: editarlo solo evita asignaciones arbitrarias en futuras instalaciones; no revierte asignaciones históricas. No preparar ni aplicar NOT NULL/backfill/reasignación sin conocer propietarios, nulabilidad y huérfanos reales.
4. Repetir preflight: RLS activado, sin políticas de acceso browser, sin grants efectivos de tabla/columna para anon/authenticated ni membresía service_role; service_role conserva CRUD y schema USAGE. Recuentos de NULL/huérfanos iguales a los previos. Si el catálogo no cumple, no declarar la demo protegida.
5. En una comprobación funcional posteriormente autorizada, usar sesiones A/B y datos sintéticos existentes/expresamente autorizados. A→mensaje B con hotel omitido/manipulado debe rechazarse antes de leer contenido/llamar al proveedor; A→A debe funcionar y reutilizar solo su caché nueva. Probar Knowledge A: lectura/alta/edición/borrado, objetivos B intactos y permisos por rol; starter prohibido para housekeeping y para recepción sobre entradas protegidas, permitido para operativas. Verificar acceso directo anon/authenticated con sus credenciales, no con service_role. No añadir fixtures ni disparar IA real en la verificación de solo lectura actual.

El archivo de protección mantiene todo dentro de una transacción. Si encuentra políticas o grants de columnas inesperados, aborta; si después de REVOKE quedan privilegios heredados, BYPASSRLS/membresía peligrosa o falta USAGE del backend, también aborta y revierte RLS/grants. La reversión por privilegios heredados fue comprobada en PostgreSQL real. No sobrescribe políticas existentes.

Recuperación: si el SQL falla antes de COMMIT, ROLLBACK deja intacto el estado anterior; revisar la causa antes de reintentar. Si falla el servicio después de aplicar/publicar, revisar primero rol efectivo y proyecto del cliente servidor, token interno y error concreto. Un operador autorizado puede restaurar configuración correcta del servidor o los permisos USAGE/CRUD de service_role según el inventario guardado, y volver a probar las APIs. No solucionar una incompatibilidad concediendo lectura pública, desactivando RLS o restaurando el fallback entre hoteles. Si aparece un consumidor directo no identificado, mantener la función afectada temporalmente fuera de la demo y adaptarla a la API autorizada; no exponer datos para recuperar una pantalla. No se puede ofrecer una reversión exacta de ACL remotas sin su inventario real; queda pendiente de ese preflight.

### Validación de este seguimiento y archivos

- `npm run test:translation-knowledge-isolation`: **22 PASS**, incluye cadena de contexto real con auth/asignaciones simuladas, rechazo A→B, control interno, caché por hotel/texto/finalidad, procedencia persistida, fallback legacy, CRUD por siete roles y starter protegido/legítimo. Evidencias negativas antes de corregir: before.log, chain-starter-before.log y cache-provenance-before.log.
- `npm run test:messages-tenant-isolation`, `npm run test:checkin-demo`, `npm run test:pilot-onboarding`, `npm run test:pilot-human-safety`: **PASS**. Se repitieron por los cambios de parámetros del traductor y la restricción de onboarding. Las suites de auth, permisos e Inbox anteriores se conservan; no se atribuye una nueva ejecución a ellas.
- `npm run dashboard:build`: **PASS**, 108 s, después del cambio de starter. El ajuste posterior del controlador backend se verificó de nuevo con la suite enfocada; no afecta al build de Next.
- `scripts/test-knowledge-isolation-postgres.cjs`: **11 PASS**. PostgreSQL oficial local 17.10; endpoint explícito `npipe:////./pipe/dockerDesktopLinuxEngine`; imagen ya disponible, sin descarga. Contenedor nuevo `staynex-translation-knowledge-20260909`, ID `37751d780e4bf56637c14be7cee0d41d677d4759ab08c53a6ed04d2101d51bbc`, sin red/puertos ni volúmenes persistentes, tmpfs. Eliminado tras validar su identidad. Se comprobaron SQL real, compatibilidad CRUD, denegación de roles browser, políticas/column grants, permisos heredados y rollback, read_only efectivo, rechazo de recuentos filtrados y conservación del NULL legacy. No es una réplica de GoTrue/PostgREST.
- `git diff --check`: **PASS**. Copia aislada sin .env/credenciales heredadas, red externa bloqueada y SEND_AUTOMATIONS=false. Evidencia adicional en `.npm-cache/translation-knowledge-followup/`: logs, postgres-results.json, manifiesto de código y cleanup.json. Se conserva la evidencia anterior en `.npm-cache/translation-knowledge-isolation/`.

Cambios de este seguimiento: `src/services/translation.service.js`, `src/controllers/messages.controller.js`, `src/services/message.service.js`, `src/services/staynex.service.js`, `dashboard/app/api/onboarding/knowledge-starter/route.js`, `scripts/test-translation-knowledge-isolation.js`, `scripts/test-knowledge-isolation-postgres.cjs`, los dos SQL preflight/protect y este informe. Los demás archivos del diff anterior permanecen preservados. Working tree con cambios locales; producción sin cambios.

## Cierre del tratamiento histórico de traducciones

Esta sección sustituye el pendiente histórico de las secciones anteriores. El alcance de este último pase es exclusivamente impedir la presentación/reutilización de traducciones guardadas sin procedencia verificable. No modifica el esquema ni datos almacenados, ni vuelve a auditar Knowledge o Supabase remoto.

### Origen, persistencia y riesgo demostrado

- Entrada: `staynex.service.js` llama a translateForStaff y entrega su resultado a createMessage en createOrReuseInboundGuestMessage. Salida de recepción: `message.service.js` llama a translateForGuest y también guarda el resultado mediante createMessage. Ambos utilizaban translateText y pudieron recibir un hit del antiguo Map compartido. `supabase.service.js:createMessage` persiste translated_text, idiomas, proveedor/confianza y metadata. Los campos translation_direction, provider y los timestamps no identifican si un resultado procedía de esa caché.
- Traducción solicitada en Inbox: `messages.controller.js` persiste la traducción tanto en las columnas directas como en metadata.translations[idioma]. Antes de la corrección, este consumidor utilizaba el mismo Map sin ámbito hotelero. Sus registros antiguos también pueden contener resultados reutilizados entre hoteles.
- Recuperación: `/api/inbox` obtiene hotel/sesión autorizados, llama a `getInboxConversations` y este a `getMessagesForConversations`. La consulta filtra hotel y conversaciones, con fallback de columnas igualmente filtrado. Antes de este cierre devolvía traducciones sin comprobar su procedencia. InboxClient elegía overrides, metadata, columnas directas y finalmente una traducción heurística local; además solicitaba traducciones automáticamente al abrir el chat.
- **Demostrado localmente:** caché compartida entre hoteles y comportamiento anterior que aceptaba cualquier traducción persistida de una fila propia. **No demostrado:** contaminación de ninguna fila real. No se consultó Supabase ni se revisaron contenidos reales. La propiedad correcta de la fila no demuestra la procedencia de sus campos derivados.

### Correcciones locales y tratamiento histórico

1. `dashboard/lib/inbox-message-presentation.js` centraliza la lectura verificable. Requiere el marcador ya generado por el flujo corregido, cache_scope=hotel-v1, hotel_id del marcador igual al hotel autorizado y al de la fila, idioma de destino coherente y texto no vacío. No usa fechas de corte ni trata provider/direction como prueba. Solo el endpoint autorizado de traducción escribe ese marcador en el código revisado; no se añaden atribuciones a registros antiguos.
2. `dashboard/lib/inbox.js` filtra las traducciones en la **respuesta**, antes de entregarlas al cliente. Excluye entradas de metadata sin procedencia válida y elimina de la respuesta las columnas derivadas no verificables. Si hay una entrada válida usa su texto, nunca un translated_text contradictorio. Conserva IDs, contenido original, autor, fecha, orden e información restante del historial. No ejecuta UPDATE/DELETE para este tratamiento.
3. InboxClient usa el mismo criterio, sin fallback a columnas directas o al texto traducido por heurísticas locales. Muestra el original cuando no hay una traducción verificable. Ofrece la acción existente «Mostrar traducción» para mensajes de idioma distinto o desconocido. Mantiene original/traducción y el control de ocultar/mostrar cuando existe una traducción válida; mensajes cuyo idioma conocido coincide con lectura conservan la presentación compacta.
4. Abrir chat, recibir/refrescar historial o cambiar idioma de lectura **no solicita traducciones automáticamente**. La traducción se inicia al pulsar la acción de un mensaje y sigue la ruta autorizada `/api/translate` → backend. No hay regeneración masiva. Se mantienen idiomas de envío, envíos, borradores y controles de atención humana.
5. El controlador identifica también la procedencia de su respuesta con cache_scope, hotelId y messageId. Inbox comprueba esos campos y el idioma esperado antes de aceptar un override. Un backend antiguo o una respuesta no verificable deja visible el original. El backend descarta además caches con idioma de destino inconsistente. En un esquema legacy sin columnas de traducción, una respuesta válida puede verse durante la sesión; tras recargar vuelve al original si no pudo persistirse. No se amplía ningún fallback de seguridad.

Una traducción legítima nueva que no tenga marcador (por ejemplo, la persistida directamente por entrada/salida) también se trata conservadoramente como no verificable para lectura en Inbox, hasta que se solicite mediante el flujo autorizado. No se inventa procedencia por ser reciente. Esto no cambia lo que se envió al huésped ni elimina registros históricos. El marcador acredita el flujo de aplicación bajo el modelo de servidor autorizado; no es una firma criptográfica contra escritores con acceso administrativo a la base.

### Validación de este cierre

- `npm run test:translation-knowledge-isolation`: **25 PASS**. Nuevos escenarios: proyección histórica sin mutaciones; marcador ausente, hotel ajeno e idioma incoherente; columnas directas contradictorias; loader productivo antes/después de traducción autorizada y reload; fallback legacy filtrado; ejecución de la acción real de Inbox con fetch controlado, rechazo de respuesta antigua y aceptación de respuesta corregida. La prueba confirma que el callback se invoca únicamente desde la acción onClick, sin efecto de traducción al cargar el chat.
- `npm run test:inbox`: **PASS**. Conserva las comprobaciones existentes de contexto, historial y ergonomía; solo se adapta su cargador a la nueva dependencia de presentación.
- `npm run dashboard:build`: **PASS**, 149 s. Advertencias no bloqueantes de caché de webpack en la copia aislada; compilación, validación y generación de páginas completadas. `git diff --check`: **PASS**. No se repitieron SQL ni las suites no afectadas de la revisión anterior.
- Ejecución aislada en `.npm-cache/translation-history/`, con SEND_AUTOMATIONS=false, proveedor simulado, red externa bloqueada y copia sin .env/credenciales heredadas. Se preservan logs y manifiesto. No hubo llamadas externas, borrado/regeneración masiva ni datos remotos modificados. Las pruebas ejercitan código y la acción del componente con dependencias controladas; no equivalen a una sesión real del entorno desplegado.

### Verificaciones y actuaciones remotas pendientes

El tratamiento histórico **no necesita migración, limpieza SQL ni backfill**. Para hacerlo efectivo hay que desplegar el dashboard y el backend de esta revisión; preferiblemente backend primero. La interfaz rechaza respuestas antiguas si existe una mezcla de versiones. Reiniciar todas las instancias elimina el Map antiguo, y recargar las sesiones de Inbox carga el nuevo criterio de presentación.

Siguen pendientes la confirmación del proyecto Supabase de la demo, el preflight READ ONLY, los grants/RLS reales de hotel_knowledge y, si el catálogo lo permite y se autoriza, `supabase/sql/protect_hotel_knowledge_backend_only.sql`, según el procedimiento anterior. Este cierre no ejecuta ninguno de esos pasos. Después del despliegue, verificar con sesiones y mensajes sintéticos autorizados: históricos muestran original, la traducción explícita legítima funciona y se conserva tras refrescar cuando hay metadata, A no traduce B y el historial no cambia. No hace falta invalidar datos históricos para que Inbox aplique este tratamiento.

### Lista revisada para el commit local

Se consolida el trabajo local de esta revisión de aislamiento y su cierre histórico, que comparte controlador, pruebas e informe. La comparación con los manifiestos previos no identifica cambios ajenos. Se excluyen .env, credenciales, montajes y evidencia temporal. La lista exacta prevista es:

```text
dashboard/app/api/onboarding/knowledge-starter/route.js
dashboard/app/api/translate/route.js
dashboard/components/InboxClient.js
dashboard/lib/inbox-message-presentation.js
dashboard/lib/inbox.js
dashboard/lib/knowledge.js
docs/translation-knowledge-isolation-review.md
package.json
scripts/test-inbox.js
scripts/test-knowledge-hotel.js
scripts/test-knowledge-isolation-postgres.cjs
scripts/test-translation-knowledge-isolation.js
src/controllers/messages.controller.js
src/services/demo-data.service.js
src/services/knowledge.service.js
src/services/message.service.js
src/services/staynex.service.js
src/services/supabase.service.js
src/services/translation.service.js
supabase/sql/add_hotel_id_to_knowledge.sql
supabase/sql/preflight_hotel_knowledge_isolation.sql
supabase/sql/protect_hotel_knowledge_backend_only.sql
```

Commit únicamente local, después de comprobar esta lista y las pruebas. Sin push, despliegue, aplicación de SQL ni cambios de producción.
