# Message Attention — validación PostgreSQL, 2026-09-08

> Informe histórico del diseño con trigger, conservado como evidencia del defecto original. No describe el SQL final vigente. El diseño de inclusión se sustituyó y se validó de nuevo; véase message-attention-decoupled-validation.md.

## Resultado

SQL ejecutado en PostgreSQL real y garantías transaccionales comprobadas localmente. **BLOQUEADO PARA ROLLOUT por el fallo de persistencia inbound descrito abajo.** No se ha autorizado ni ejecutado schema remoto, publicación o cambios de producción.

## Entorno y alcance

- Docker Server 29.7.2 Linux mediante `npipe:////./pipe/dockerDesktopLinuxEngine`, sin contexto remoto ni URLs heredadas.
- Imagen oficial ya local `postgres:17.10-alpine3.24`, digest `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`. Sin descarga. El repositorio no fija una versión PostgreSQL de destino.
- Contenedor exclusivo `staynex-attention-pg-validation-20260908`, etiqueta `staynex.disposable=message-attention-validation-20260908`, sin red, puertos ni volúmenes persistentes. PGDATA en tmpfs.
- Bases nuevas `staynex_attention_disposable*`, exclusivamente sintéticas. Los intentos anteriores se conservaron hasta retirar el contenedor; no se reutilizaron datos ajenos ni se hicieron resets globales.
- Dependencias ejecutadas desde `supabase/schema.sql`, `create_hotels_and_hotel_users.sql`, `create_user_roles_and_hotel_assignments.sql`, `add_platform_role_to_hotel_users.sql`, `add_multilanguage_translation_layer.sql`, `create_enterprise_audit_logs.sql`, `create_conversation_ai_state.sql` y `twilio_inbound_messagesid_dedupe.sql`.
- Representación de Supabase: roles locales NOLOGIN anon/authenticated/service_role (este último BYPASSRLS), publicación vacía supabase_realtime y permisos backend sobre tablas base. No se ejecutan GoTrue, PostgREST, Realtime ni JWT reales. Propietario de las funciones privilegiadas: postgres.
- El adaptador de transporte del test traduce las operaciones del cliente a psql; las RPCs, triggers, claims y datos se ejecutan en PostgreSQL. No reimplementa su lógica.

## SQL y defecto corregido

Se ejecutan los archivos reales con ON_ERROR_STOP: preflight, create, verify y disable_message_attention.sql. El preflight original falló por exigir `guests.name`, ausente en schema/migraciones. Corrección mínima: nombre opcional mediante to_jsonb y fallback «Huésped», sin inventar columnas. Se actualizaron las huellas de verificación y se repitió toda la ejecución SQL corregida.

Preflight, migración y verificación pasan. Reaplicar preflight/migración falla explícitamente por objetos existentes. Un objeto incompatible también se rechaza sin sustituirlo. No hay backfill del histórico.

## Transacciones y concurrencia reales

Los logs de cada sesión incluyen SQL, resultado y SQLSTATE. Las pruebas concurrentes usan procesos psql distintos; A retiene una transacción abierta y se observa a B en pg_stat_activity esperando un bloqueo.

| Caso | Resultado observado |
| --- | --- |
| Entrada guest / adjunto sin texto | Mensaje, pendiente inicial y auditoría coherentes |
| Staff, IA, sistema, preview, traducción | Sin seguimiento de huésped |
| Resolver / reabrir | Versión incremental, actor y fecha iguales a auditoría; contadores coherentes |
| Lote inválido / hotel mezclado | 42501, ninguna transición parcial |
| Fallo de auditoría | P0001, rollback de todo el lote y de la inserción inbound |
| Dos operadores cerrando | Un cierre; segundo 40001 |
| Cierre / reapertura simultáneos con versión obsoleta | 40001 sin sobrescritura |
| Retry idéntico simultáneo y posterior | Misma fecha/versión; una auditoría por operación |
| Retry viejo tras reapertura / identidad con contenido distinto | 40001 |
| Lotes superpuestos en orden inverso | Segundo lote completo rechazado; mensaje exclusivo sigue pendiente |
| Entrada nueva durante cierre | Fuera del lote; permanece pendiente |
| Duplicado / ON CONFLICT UPDATE | No reinicia un resuelto |
| Desactivación | Estados/auditoría conservados; RPC 55000; nueva entrada sin seguimiento |

RLS activo sin políticas de navegador; anon/authenticated no pueden leer ni ejecutar RPC; service_role no tiene acceso directo a message_attention. Solo las tres RPCs previstas son ejecutables por backend. Helpers privados, search_path fijo pg_catalog, propietario postgres. Pruebas del handler productivo con SQL real rechazan sesión ausente, roles no gestores, support, IDs de otro hotel y campos de actor/hotel/fecha inyectados. El contexto autenticado se suministra de forma controlada: no es una prueba de JWT/Supabase.

El Dashboard se comprobó con agregaciones SQL, muestra de ocho, cursor sin duplicados, nombre opcional y urgencia compartida entre contador/lista. Cambiar atención conserva mensajes, tickets, conversaciones, hoteles y conversation_ai_state. No se conectó ningún proveedor. La suite de mocks conserva los escenarios de DST y contexto; no se presenta como prueba de reloj de PostgreSQL en fechas simuladas.

## Bloqueo inbound publicado

Se usaron `createIncomingWhatsAppHandler`, `createMessage`, claim/attach/complete/fail del código actual; estas piezas no tienen cambios en el diff. Se sustituyeron resolución del hotel/preparación contextual y proveedores por dependencias controladas. `createMessage` escribió mediante SQL real, con su formato completo, adjunto vacío y fallback por columna de traducción ausente.

Al inyectar un fallo de auditoría en PostgreSQL:

1. El trigger falla P0001 y revierte messages + message_attention.
2. El handler conserva el claim como failed, failure_code=P0001, failed_at registrado y message_id=NULL.
3. Tras retirar el fallo, el mismo webhook obtiene 200 y outcome failed_consumed. No vuelve a preparar ni persistir el mensaje; no se llama a procesamiento/proveedores.

Queda una señal técnica durable (SID/hotel/fecha/error), pero no el contenido del mensaje ni una recuperación automática en ese flujo. No se ha acreditado una vía operativa para recuperar esa entrada sin depender de datos externos. **No es suficiente para autorizar el rollout del trigger.** Resolverlo exige una decisión y validación acotadas sobre recuperación inbound, fuera del alcance autorizado. No se ignoran errores ni se cambia at-most-once.

## UI

Ocultado únicamente el UUID bajo cada extracto de confirmación. IDs, versiones, claves React y alcance congelado permanecen intactos. El montaje visual conserva datos sintéticos en memoria y no se presenta como evidencia PostgreSQL.

## Reproducibilidad y evidencia

Ejecutor: `node scripts/test-message-attention-postgres.cjs all`, con el contenedor exclusivo previamente creado y sin NODE_OPTIONS heredado. El ejecutor comprueba etiqueta, red y mounts antes de tocarlo; crea una base nueva por ejecución. No descarga imágenes ni crea recursos de otros proyectos. Bloquea .env y conexiones externas antes de cargar módulos productivos. Guest Memory OFF; SEND_AUTOMATIONS=false.

Evidencia local: `.npm-cache/message-attention-postgres/`: resource.json, results.json, inbound-blocker.json y logs SQL por sesión. Los fallos iniciales del ejecutor (booleanos psql, roles compartidos dentro del contenedor, tamaño insuficiente del fixture de paginación y validación de nombre RPC v1) están conservados; se corrigió el ejecutor y se repitió la suite completa, sin debilitar aserciones.

## Activación y recuperación propuestas

1. Mantener detenido el rollout hasta definir y comprobar la recuperación/señal operativa del fallo inbound.
2. Tras esa aprobación, validar compatibilidad de versión/schema real con preflight de solo lectura en otro pase autorizado.
3. Aplicar migración: su commit activa inmediatamente el trigger, incluso con la interfaz antigua; por eso el bloqueo inbound es previo a este paso.
4. Verificar schema, permisos y recepción de mensajes; solo después publicar la funcionalidad.
5. Ante fallo, disable_message_attention.sql conserva evidencia y bloquea el contrato. Entradas durante la desactivación quedan sin seguimiento; no hay backfill automático.

No se ha certificado producción ni piloto, rendimiento con volumen real, RLS global de Supabase, JWT, proveedor Twilio ni recuperación externa del SID fallido.

## Cierre de recursos y checks

Contenedor 12c0af8cdaf24d778eab0ed2940e7cf1948538d8959525aca9b328cf3cbb4d2f retirado tras comprobar ID y etiqueta. Cero contenedores restantes con la etiqueta de esta validación; tmpfs y todas las bases de pruebas retirados. La imagen preexistente se conserva. Recibo en cleanup.json.

PASS: test:message-attention, test:auth-hotel-context, test:permissions, test:inbox, test:checkin-demo, test:twilio-inbound-dedupe, test:pilot-human-safety, test:post-login-routing, test:pilot-onboarding, test:pilot-failure-rehearsal, check:syntax, sintaxis del nuevo ejecutor y dashboard:build. git diff --check sin errores. Todos ejecutados de forma aislada; el build no contiene el montaje visual.
