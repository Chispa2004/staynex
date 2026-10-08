# Atención, actuación y comunicación — 8 octubre 2026

Base comprobada: `c18cc713673fe194bce84e900b5a869770991afe`. Rama `codex/attention-lifecycle`. No incluye organizaciones. Inventarios recuperables, catálogo y capturas públicas se conservan fuera de Git.

## Reglas y causa

Un mensaje recibido, una conversación y un ticket son unidades distintas. Leer, generar/copiar un borrador o registrar una petición no resuelve atención. El estado de entrega del mensaje tampoco certifica la actuación. `completed` significa actuación hecha; no significa comunicación al huésped. La confirmación humana existente permite acreditar atención informativa o comunicación revisada, sin fabricar recibos de WhatsApp. En demo se identifica expresamente como simulación.

Antes, el cambio de ticket era una escritura directa seguida de una auditoría separada, sin revisión esperada ni identidad de operación. La atención podía resolverse por mensaje sin considerar el ticket ni sus demás mensajes. Ahora la RPC valida hotel, actor, categoría, estado y revisión; bloquea, escribe y audita en una transacción. Reintentar la misma operación devuelve el mismo resultado mientras siga vigente; una operación superada devuelve conflicto. La interfaz conserva el estado confirmado y bloquea doble envío mientras guarda. Realtime antiguo no revierte una revisión nueva.

La asociación procede exclusivamente de `operational_request_receipts` con hotel, conversación y mensaje exactos. Resolver exige ticket hecho y todos los mensajes aún pendientes de esa petición, sin incluir solicitudes independientes. Reabrir atención es explícito; un nuevo mensaje entrante comienza pendiente. Cambiar un ticket no envía nada ni libera control humano. Grupos de más de 50 mensajes o incompletos fallan visiblemente sin escritura: requieren revisión, no se fraccionan silenciosamente.

Los 36 mensajes pendientes de la demo tienen borradores/no enviados; cero resueltos era coherente con ausencia de confirmación de atención. No se cambian por inferencia. Urgencia del mensaje y prioridad efectiva del ticket siguen siendo independientes.

## Procedencia de la demo

Los dos tickets de fuga investigados pertenecen a ediciones acreditadas diferentes: `staynex_message_stages_v1` (conversación histórica) y `checkin_natural_service_v1` (caso activo). La proyección de lectura exige el hotel demo exacto, conversación/huésped coincidentes y todos los recibos vinculados a mensajes de fixtures conocidos. No modifica registros. Un hotel real conserva sus tickets abiertos aunque cierre una conversación.

Inventario previo: 38 conversaciones (18 activas, 20 cerradas), 114 mensajes, 20 tickets (18 pendientes, 2 hechos), 27 recibos. Proyección: 14 tickets actuales, 2 históricos, 4 de procedencia por revisar (2 pendientes y 2 hechos). El ámbito actual incluye los ambiguos: 18 tickets, 16 pendientes antes de la demostración. Selector actual/históricos/por revisar/todos y enlace explícito desde Dashboard; métricas y listados comparten la misma proyección. Ningún histórico se cierra para ocultarlo.

## Respuestas y evaluación

Se interpreta la petición humana del turno actual antes de repetir un acuse inicial. Se distinguen elección de una persona, aclaración, consulta de recepción, progreso y problema que continúa tras un ticket hecho. El fallback es contextual y la salida final mantiene los filtros. La petición humana no acredita contacto ni atención de una persona.

Ejemplo: «Hemos recibido su mensaje y tomamos nota… atención personalizada» pasa a «Claro. Siento que siga sin funcionar. Tenemos tu petición de hablar con una persona.» En consultas distintas permanecen respuestas distintas; no hay excepciones por huésped o conversación.

`scripts/fixtures/attention-lifecycle-evaluation.json` conserva 28 generaciones reales sintéticas, dos hoteles con horarios/precios diferentes, modelo `gpt-4.1-mini-2025-04-14`, salidas originales y resultado final. La credencial permaneció en el proceso desplegado; solo el proceso hijo de evaluación accedió a OpenAI, sin base de datos ni canales de mensajes. No hubo errores de proveedor; esto no acredita calidad.

Revisión semántica (categorías pueden solaparse): primera ronda, 16 salidas: 5 errores operativos, 7 problemas de tono, 6 satisfactorias. Segunda, 4: 2 promesas indebidas y 2 problemas de tono. Tercera, 4 seguras pero repetitivas. Última, 4 seguras con diferencia contextual ante instrucciones fallidas. No se observaron derivaciones innecesarias ni preguntas de datos conocidos en esta muestra. Las afirmaciones de entrega sin evidencia se rechazan; permanece una confirmación limitada de petición completada. La evaluación final de los 16 contextos usa las 4 últimas humanas y las 12 iniciales cuya política general no cambió. La muestra no garantiza toda respuesta futura ni todos los idiomas. El enlace de reseñas sintético conserva su identificación existente; no se convierte en enlace operativo.

## Pruebas

- 10 grupos nuevos PostgreSQL: repetición de migración, permisos/tenant/categoría, 8 solicitudes concurrentes, respuesta perdida, conflicto, información independiente, grupo completo, comunicación pendiente tras actuación, reapertura, rollback de auditoría y revocación. También escritura antigua de aclaración compatible y versión no reducible. PostgreSQL 17.10 desechable, sin red ni proveedores.
- Batería PostgreSQL existente completa aprobada: solicitudes operativas, métricas, ciclo de vida, carga demo, onboarding, Knowledge, exclusión de envíos y retención. Ninguna se ejecuta contra producción.
- Comportamiento nuevo: agrupación, respuestas tardías, procedencia y ámbito, fallback/salida final, las 28 generaciones conservadas, lectura de 501 recibos por la clave real `source_message_id`.
- Navegador sintético: 4 casos a 1366/390, claro/oscuro, teclado, pendiente/error/reintento, grupo de dos mensajes y solicitud independiente. Inbox: 10 pruebas de entrada, selección, borradores, recarga, fallos recuperables y contexto de solicitud.
- Build local aprobado. HTTP Security falló inicialmente por la aserción heredada LF sobre checkout CRLF; copia local normalizada pasa sin cambiar la prueba ni su contenido Git. El CI Linux debe acreditar su ejecución. Una aserción nueva sobre desayuno se corrigió para comprobar hechos sin exigir un orden de palabras; se conserva el texto real.

## Migración y transición

Archivo exacto: `supabase/sql/add_attention_ticket_lifecycle.sql`.
SHA-256 (bytes LF): `0350b0902831ede847a8be072550a8a611522c473f194052aa59910134b3afc2`.

Añade `tickets.status_version bigint NOT NULL DEFAULT 1`; todos los tickets existentes parten de 1 sin cambio de estado. Verifica una columna existente compatible sin sobrescribirla. Añade trigger `staynex_ticket_version` (incrementa toda actualización; rechaza cambios directos de estado/completed_at fuera del contrato), RPC `staynex_ticket_transition_v1`, RPC de lectura `staynex_attention_ticket_groups_v1`, índice único parcial `ticket_operation_identity` en auditoría y sustituye la función existente de atención conservando sus comprobaciones previas y añadiendo los grupos. No hay borrados, limpieza, backfill de estados, configuración ni envíos.

Nuevas RPC: `SECURITY DEFINER`, `search_path=pg_catalog`, referencias cualificadas, ejecución solo `service_role`. No amplía políticas RLS ni permisos de tablas. El actor viene de la sesión verificada del servidor y se revalida en SQL; soporte está excluido. Departamentos se limitan a sus categorías. Las nuevas auditorías son atómicas y registran `notification_confirmed=false`.

Preflight `supabase/sql/preflight_attention_ticket_lifecycle.sql`: transacción READ ONLY/ROLLBACK, ejecutada sobre `vblxmnqbatqrynfaasmf`; snapshot privado conservado. Contrato de atención remoto coincide con el versionado ignorando formato, funciones propietarias postgres, nuevas funciones/columna ausentes. Recibos tienen clave `(hotel_id, source_message_id)`, sin `id` ni `conversation_id`; implementación y ensayo usan esa definición comprobada.

Orden: CI/revisión → verificar huella y catálogo → aplicar únicamente esta transacción (lock_timeout 5 s; statement_timeout 30 s) → comprobar catálogo, ACL y disponibilidad PostgREST mediante lecturas → merge normal → comprobar SHA Vercel/Railway, CI main y retirada de versiones antiguas → demostración acotada. No usar Preview para mutar la base antes de la migración. La aplicación no aplica SQL al arrancar/compilar.

Convivencia: lecturas y aclaraciones siguen funcionando; el trigger impide que Dashboard antiguo actualice estados saltándose CAS. Puede haber indisponibilidad temporal de ese botón hasta desplegar la versión nueva; nunca éxito falso. No se pausan servicios ni se cambian flags. Los otros consumidores que actualizan descripción/contexto avanzan revisión sin cambiar estado.

Recuperación: antes de commit SQL, cualquier error revierte toda la migración. Después, conservar revisión, recibos y auditorías; mantener bloqueadas escrituras antiguas y corregir hacia delante. Volver al Dashboard antiguo deja sus cambios de estado rechazados, no es recuperación funcional segura. No eliminar columna/guardas ni reencolar o revertir atención por falta de respuesta. Una operación incierta se consulta o reintenta con su identidad, sin crear otra actuación.

## Publicación y evidencia pública

Pendiente de completar en esta misma publicación: PR/SHA, CI para el SHA final, aplicación exacta, versiones activas, los tres recorridos simulados y comparación final del inventario. No se acredita producción con pruebas locales. Cualquier escritura pública se limita a esos tres casos por los controles normales y queda inventariada con sus auditorías; los cambios de esquema no son cambios de los estados de otros hoteles.
