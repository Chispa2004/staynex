# Preparación de despliegue: traducción, Knowledge y envío manual

Base comprobada: `codex/reception-message-dashboard`, `1dce130e059fc65e609f14961e53dca8e6d812c4`, árbol inicialmente limpio. Se conservan los commits anteriores y su CI real. Este pase prepara SQL y pruebas locales; no crea commit, push, merge, despliegue, SQL remoto ni cambios de datos reales. SEND_AUTOMATIONS=false.

## Contraste del inventario recibido: preparación cerrada

Archivo leído íntegramente en la raíz del proyecto: `staynex-inventario-remoto (1).json`, 136329 bytes, JSON válido con una fila y 19 secciones. SHA-256: `f92bda9820b7cc54b61a9f4910f7891da12dcba7bdb9578ecec3b32b331e3429`. Es evidencia local aportada por el usuario; no se ejecutó SQL remoto. El archivo queda sin seguimiento y sin staging, excluido de cualquier commit de este trabajo.

El inventario declara PostgreSQL 17.6, inspection_role=postgres, transaction_read_only=on. Todas las secciones de catálogo figuran consultadas: 21 columnas/defaults, 8 constraints, 15 índices, 14 triggers, 64 ACL de tabla, 48 permisos efectivos de tabla y 252 de columna. Ambas tablas existen, son ordinarias, propiedad de postgres y tienen RLS habilitado, sin FORCE. Los recuentos anteriores de filas sin propietario/huérfanas son cero según el usuario; este archivo es solo metadatos y no repite esos recuentos.

**Veredicto: catálogo compatible con el código actual y ambos SQL preparados; ningún bloqueo de esquema identificado en estas dos tablas.** No hace falta cambiar runtime, SQL ni repetir las pruebas ya aprobadas. Se cierra el bloqueo de inventario ausente. Los privilegios excesivos siguen presentes hasta aplicar el SQL; compatibilidad no significa protección ya aplicada ni validación funcional de producción.

Resultados del contraste:

- Messages: las 12 columnas de la lectura ampliada de Inbox existen, incluidas todas las de traducción y metadata JSONB NOT NULL DEFAULT '{}'::jsonb. id es UUID NOT NULL DEFAULT gen_random_uuid(); created_at es NOT NULL DEFAULT now(). El INSERT inicial suministra el resto de obligatorias. La columna adicional attention_inclusion_version permite NULL, default 1 y CHECK (=1): compatible con los mensajes staff del flujo manual.
- PRIMARY KEY(id) validada y no diferible, índice primario válido/preparado con unicidad inmediata. El otro índice único (id,hotel_id,conversation_id) no impone una colisión adicional entre UUID distintos. FK hotel_id, conversación y FK compuesta validadas; sender_type admite staff. No se requieren modificaciones de columnas, PK, índices o constraints.
- Los 14 triggers (12 messages, 2 Knowledge) son internos RI_FKey, habilitados y AFTER. No hay triggers de aplicación ni BEFORE que sustituyan UUID/metadata. Las acciones SET NULL/CASCADE sobre tablas dependientes corresponden a DELETE; el flujo manual inserta y actualiza metadata. No se simula aquí un DELETE real ni se amplía el alcance a esas tablas.
- Knowledge: hotel_id UUID NOT NULL con FK validada y columnas de Knowledge/onboarding disponibles. No tiene políticas. La restricción conserva esos constraints.
- anon/authenticated/service_role tienen los ocho privilegios de tabla, incluido MAINTAIN, sin grant option. No hay grants independientes de columna ni membresías heredadas/SET ROLE para estos roles. Los permisos efectivos de columna proceden de los grants de tabla. PUBLIC no aparece en las ACL; no hay destinatarios adicionales aparte de postgres y los tres roles API. Ambos SQL admiten esta configuración y retiran los permisos previstos.
- Messages tiene exactamente la política esperada: SELECT PERMISSIVE a authenticated, staynex_can_read_hotel(hotel_id), sin WITH CHECK. service_role tiene BYPASSRLS; anon/authenticated no. Todos tienen USAGE public. Se preserva SELECT authenticated y el CRUD autorizado del servidor.
- supabase_realtime incluye messages con todas sus columnas, incluidas id/hotel_id/metadata, sin rowfilter; replica identity FULL. INSERT/UPDATE/DELETE/TRUNCATE de publicación habilitados. Los SQL no cambian esta configuración. Knowledge no pertenece a ninguna publicación del inventario.

## Funciones desplegadas frente a las pruebas locales

Se compararon los cuerpos íntegros de public.staynex_can_read_hotel(uuid), public.staynex_is_platform_operator() y public.staynex_rls_auth_email() contra ambas versiones del repositorio (rls_phase_1_safe_tenant_protection.sql y rls_phase_2_write_protection.sql). Coinciden exactamente tras normalizar CRLF/LF y quitar espacio exterior; no se normaliza ni altera la lógica. También coinciden LANGUAGE sql, STABLE, SECURITY DEFINER y search_path=public, auth. Propietario remoto postgres; authenticated tiene EXECUTE en las tres.

Son los mismos helpers de lectura utilizados en las pruebas PostgreSQL locales: asignación activa por usuario/email y acceso global intencionado de platform_admin/support. En esas pruebas auth.uid/auth.jwt y las asignaciones son sintéticas. La coincidencia no acredita el contenido remoto de hotel_users, la autenticación JWT real, la configuración de PostgREST ni la entrega de eventos Realtime.

Evidencia del contraste: `.npm-cache/isolation-privileges/inventory-contrast.json`, siete comprobaciones PASS, exit 0. El comparador solo lee archivos; no ejecuta las definiciones del inventario ni utiliza credenciales. Hashes SHA-256 de SQL contrastado: protect_hotel_knowledge_backend_only.sql = `4f57c8676b1356637d45b4497a3ffad637966644e27eca7e973de292b88f42f0`; restrict_messages_api_privileges.sql = `af84d89620825afa75f86ba67b7fc6d296f7238352299ba715c7c177820c1ea7`.

## Compatibilidad de almacenamiento y recuperación

`src/services/message.service.js:createManualMessageSender` valida conversación y huésped por hotel. Inserta el UUID del intento como `messages.id` antes del proveedor y escribe explícitamente hotel_id, conversation_id, sender_type='staff', content y metadata.manual_send. La PK global e inmediata debe producir 23505 ante el mismo intento; el servicio recupera el registro filtrado por hotel/conversación. Necesita SELECT/INSERT/UPDATE; otros consumidores autorizados, incluida la eliminación controlada de datos de demo, usan DELETE.

El INSERT manual no depende de defaults de id/metadata porque los suministra. El inventario confirma defaults compatibles para otros escritores y para created_at. No hay columnas obligatorias omitidas sin default ni triggers/índices que contradigan este contrato. Queda pendiente comprobar la operación a través de la aplicación desplegada, no obtener más metadatos de estas tablas.

`dashboard/lib/inbox.js:getMessagesForConversations` selecciona id, conversation_id, hotel_id, sender_type, content, created_at, original_language, translated_language, translated_text, translation_provider, translation_confidence y metadata, filtrando hotel y conversaciones. Todas existen en el inventario: el riesgo del fallback básico sin metadata por columnas ausentes queda descartado para esta instantánea. La lectura y recuperación mediante PostgREST desplegado se comprobarán tras el despliegue. No se modifica runtime ni se requiere migración de columnas.

En PostgreSQL local se prueban UUID explícito, 23505, JSONB íntegro y reapertura en otra conexión con el contrato real manualDelivery/normalizeManualDelivery para accepted, failed y unknown. Un mensaje histórico sin manual_send conserva su contenido. No equivale a probar PostgREST o WhatsApp.

## SQL incremental exacto

1. `supabase/sql/protect_hotel_knowledge_backend_only.sql`: mantiene acceso exclusivo por servidores autorizados, habilita RLS y revoca grants directos de PUBLIC/anon/authenticated. Conserva CRUD de service_role. No cambia nulabilidad, FK, datos o propiedad. Aborta ante políticas o grants browser de columna no revisados. Añade MAINTAIN, rutas SET ROLE con NOINHERIT y comprobación individual de los cuatro permisos CRUD. Si se ejecutó una versión anterior, aplicar la versión revisada completa tras el preflight: es transaccional y repetible en el estado admitido. No basta editar el archivo.
2. `supabase/sql/restrict_messages_api_privileges.sql`: incremento exclusivo de messages. Conserva SELECT authenticated bajo la única política esperada staynex_tenant_read_messages, sin recrearla; exige RLS activo y prerrequisitos de lectura. Retira grants de PUBLIC/anon; escrituras, TRUNCATE/REFERENCES/TRIGGER/MAINTAIN y delegación del navegador; limpia grants independientes de columna. Service_role conserva CRUD sin administración de tabla ni delegación innecesaria. No cambia publicación, replica identity, triggers, funciones, índices, constraints o datos.

Ambos tienen lock_timeout de 5 segundos. No usan CASCADE, cambios globales de roles/default privileges ni DISABLE RLS. Los permisos heredados inesperados provocan rollback; no se revocan en otros roles/proyectos. El guard de messages reconoce la forma de la política; el cuerpo de sus funciones se contrastó separadamente con este inventario. No se modifican las funciones. Si el catálogo cambia antes de aplicar, revisar las diferencias y no forzar los guards.

Las listas de privilegios separadas por comas significan «cualquiera»; se usan para detectar prohibidos. Los cuatro permisos CRUD necesarios se comprueban por separado. Referencias PostgreSQL 17: [funciones de permisos](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE), [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

## Consumidores conservados

- `dashboard/lib/knowledge.js`: contexto autorizado mediante getCurrentHotelForRequest, permisos knowledge_base/knowledge_base_manage, categorías protegidas y filtros hoteleros también en fallback; creación con hotel autorizado. No necesita grants browser.
- `dashboard/lib/onboarding.js:loadKnowledgeEntries`: lectura del servidor filtrada por hotel, también en fallback. `dashboard/app/api/onboarding/knowledge-starter/route.js`: exige knowledge_base_manage y respeta categorías protegidas antes de escribir.
- `src/services/knowledge.service.js`: filtros hoteleros también en compatibilidad legacy. Los consumidores de supabase.service, readiness y demo-data conservan el acceso del servidor. No se ejecutan generadores de demo ni automatizaciones.
- `dashboard/lib/platform.js:getPlatformOverview`: lectura agregada intencionada entre hoteles, precedida por getPlatformContext en `dashboard/app/api/platform/hotels/route.js`; no es un fallback del huésped. RLS no limita service_role: la autorización de aplicación sigue siendo obligatoria.
- Inbox y TicketDetail se suscriben a postgres_changes de messages. Se conservan SELECT authenticated, política, publicación y replica identity. No se prueba la entrega real de eventos Supabase Realtime ni JWT desplegados.
- Traducción: autorización/caché hotelera y tratamiento histórico intactos. Inbox muestra original sin procedencia verificada y traduce solo a petición mediante el flujo autorizado. Sin limpieza, backfill o regeneración histórica.

## Validación local

Se amplía la suite existente `scripts/test-knowledge-isolation-postgres.cjs`, ejecutada por `npm run ci:postgres`. Sin workflow/dependencias nuevos. PostgreSQL oficial local 17.10 (remoto comunicado: 17.6), endpoint `npipe:////./pipe/dockerDesktopLinuxEngine`, imagen local existente, contenedor nuevo UUID sin red/puertos ni volúmenes ajenos, tmpfs y eliminación en finally.

**17 grupos PASS, exit 0:** once anteriores conservados; MAINTAIN/SET ROLE en Knowledge; revocaciones messages preservando política/Realtime; aislamiento A/B, sin asignación, inactivo y soporte; almacenamiento/recuperación del contrato manual; rollback por herencia/columna/SET y rechazo de políticas inesperadas; preflight READ ONLY y conservación de NOT NULL/FK validada. Se prueba también repetición del SQL y que service_role elude RLS: los filtros de aplicación siguen siendo esenciales.

El fixture carga supabase/schema.sql, helpers de rls_phase_1_safe_tenant_protection.sql y la política de add_messages_tenant_isolation_p0_1_stage_b_contract.sql. Comprueba que los tres helpers de lectura coinciden con Phase 2. Solo auth.uid/auth.jwt y las asignaciones/filas son sintéticos. USING(true) aparece únicamente en casos adversos que deben rechazarse. No reproduce todas las migraciones históricas ni el catálogo remoto.

**PASS:** test:manual-send, test:translation-knowledge-isolation y test:inbox, con proveedor simulado, variables permitidas, SEND_AUTOMATIONS=false, USE_MOCK_AI=true y bloqueo de .env/red externa. No cambia dashboard; no se repite el build aprobado para el SHA base. git diff --check: PASS.

Evidencia: `.npm-cache/ci/postgres/pg-*.log`, `postgres-results.json`, `postgres-resource.json`; `.npm-cache/isolation-privileges/test-*.log`. Solo fixtures sintéticos. El PASS de GitHub anterior corresponde al SHA base, no a estos cambios sin commit.

## Orden de despliegue y verificación (no ejecutado)

1. Inventario contrastado y compatible. Conservar este archivo fuera de commits y confirmar al aplicar que se trata del mismo proyecto demo y no hubo cambios de catálogo posteriores. No ejecutar Stage B, multilanguage, backfill o cambios de PK: no hacen falta según esta evidencia.
2. Guardar SHA activos de backend/dashboard y revisar/autorizar los archivos exactos. Para publicar los cambios locales pendientes, crear el commit acotado y pasar sus checks siguiendo el proceso del repositorio, sin incluir el inventario; ese paso no se realiza aquí. Mantener SEND_AUTOMATIONS=false.
3. Desplegar primero backend corregido y reiniciar todas sus instancias para retirar el Map antiguo de traducciones; después dashboard y recarga de sesiones. Una mezcla de versiones no es la validación final.
4. Con los consumidores autorizados disponibles, aplicar protect_hotel_knowledge_backend_only.sql y después restrict_messages_api_privileges.sql. Son transacciones independientes: un aborto del segundo no revierte el primero. No se requiere SQL de columnas si el inventario confirma el contrato actual.
5. Repetir preflight READ ONLY: Knowledge sin permisos browser ni rutas SET ROLE; messages authenticated SELECT=true, demás permisos browser=false; service_role CRUD=true; RLS/políticas, NOT NULL/FK, identidad/publicación intactos. Revisar herencia, columnas y MAINTAIN. Los SQL no modifican las filas cuyo recuento anterior fue cero.
6. Con autorización separada para datos sintéticos, comprobar sesiones A/B, Knowledge/onboarding/Platform; históricos muestran original, traducción explícita legítima y denegación A→B; estados manuales recuperados y eventos Realtime autorizados. Usar proveedor simulado/destino de pruebas aprobado, nunca huéspedes reales. Sin callbacks nuevos no se certifica entrega asíncrona.

## Recuperación ante incompatibilidad

Si falla un guard, revierte su transacción; ejecutar ROLLBACK si el cliente deja la sesión abortada y revisar solo el catálogo causante. No quitar guards ni alterar roles globales para forzar éxito.

Si falla el servicio después del COMMIT, mantener automatizaciones desactivadas, detener temporalmente la función afectada y corregir el consumidor o el privilegio mínimo del servidor. Conservar RLS y SELECT de messages; no restaurar ALL/PUBLIC, políticas permisivas ni acceso browser a Knowledge. Las ACL capturadas permiten preparar una recuperación concreta: no se entrega un rollback genérico que reabra el aislamiento. No volver a un backend con caché compartida. Coordinar cualquier rollback de UI preservando incertidumbre de envío y traducciones históricas, evitando nuevos envíos hasta revisar el estado durable.

**Preparación cerrada: catálogo compatible, funciones coincidentes y SQL definitivo sin cambios adicionales. Pendientes la aplicación autorizada de SQL, despliegue coordinado y verificación funcional con sesiones/servicios reales del entorno. Ningún SQL remoto ejecutado en este pase.**

## Rectificación de la entrega SQL y revalidación desde disco

La respuesta del asistente transcribió incorrectamente `p.privilegio` en el último guard CRUD de messages. El archivo local siempre contenía `p.privilege`: sus hashes coinciden con los del contraste anterior. El PASS comunicado correspondía al SQL del archivo, no al bloque reproducido en el chat. Fue un error de entrega, no de PostgreSQL ni de propagación de errores del ensayo. Se corrige la respuesta; no se altera el SQL correcto ni se debilitan comprobaciones.

Se repitió `npm run ci:postgres` con ambos SQL completos leídos de disco mediante fs.readFileSync y enviados a psql con ON_ERROR_STOP=1: 17 grupos PASS, exit 0. Las transacciones válidas completaron COMMIT y los cambios se comprobaron en conexiones posteriores. Los escenarios adversos mantuvieron denegaciones/rollback por políticas, herencia, columnas y SET ROLE, incluido MAINTAIN; se preservaron CRUD autorizado, lectura A/B, constraints, UUID/metadata y configuración de Realtime. Contenedor nuevo PostgreSQL 17.10 local sin red, eliminado al terminar. Inventario y contraste preservados, sin consultas remotas ni nuevos envíos.

`.npm-cache/isolation-privileges/sql-revalidation.json` relaciona los hashes de ambos archivos con los logs cuyo texto SQL coincide íntegramente y devuelve EXIT 0. Los hashes definitivos siguen siendo los indicados en la sección de contraste; no fue necesario modificar los archivos SQL.
