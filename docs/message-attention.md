# Atención explícita por mensaje — contrato v1

Implementación local sobre codex/reception-message-dashboard (base 7fb48d7). SQL validado únicamente en PostgreSQL desechable local. No se ha aplicado SQL remoto ni publicado.

## Significado y almacenamiento

«Resuelto» es una confirmación de un trabajador autorizado de que los mensajes seleccionados están atendidos. No acredita entrega, satisfacción, solución física, cierre de tickets ni acción de IA.

Tabla aditiva public.message_attention: message_id (PK), hotel_id, conversation_id, status (pending/resolved), version, changed_at, changed_by, actor_kind y last_operation_id. La FK compuesta impide combinar identidad, hotel y conversación de distintos mensajes. No se modifican los estados existentes de conversación, lectura, tickets, envíos, IA o claims.

El estado efectivo se resuelve en SQL con staynex_attention_effective, usado por Inbox, transición y Dashboard: una transición existente prevalece; sin transición, marca válida 1 significa pendiente inicial (versión 1), y marca NULL significa «Sin seguimiento anterior» (versión 0). Un error de lectura o contrato deshabilitado se presenta como no disponible, sin acciones. Nunca se interpreta un error como ausencia de fila. No hay backfill.

El diseño anterior usaba un trigger AFTER INSERT: un fallo de auditoría podía revertir la entrada y consumir el claim. Ese diseño se ha sustituido antes de publicarse. El alta canónica createMessage permanece intacta. messages.attention_inclusion_version es smallint nullable con CHECK = 1: se añade SIN DEFAULT, y solo después se establece DEFAULT 1 para futuras inserciones. La marca se guarda en la propia fila; INSERT no consulta ni escribe atención, auditoría o tablas auxiliares. No hay trigger de este módulo ni captura de errores para ignorarlos.

La elegibilidad sigue siendo guest, incluidos adjuntos sin texto, excluyendo system_event, preview, draft, translation_only y automation_type. Otros tipos pueden llevar la marca por el DEFAULT, pero nunca son pendientes de huésped. La marca no procede de campos del webhook ni de created_at: una importación nueva con fecha antigua queda incluida, mientras un UPDATE de un histórico no cambia su NULL. createMessage (formato completo y fallback) no admite la marca como entrada del usuario. El dedupe Twilio no se modifica ni reinicia estados. La fecha mostrada para un pendiente inicial es la fecha persistida del mensaje; no es un cierre auditado ni una fecha de importación inventada.

## Transiciones y auditoría

El servidor verifica sesión, contexto hotelero y permisos existentes inbox_human_takeover para una asignación real y activa. Solo owner/admin/manager/receptionist; no support ni fallback. Los privilegios Platform no suministran por sí solos este permiso. La RPC vuelve a comprobar la asignación del actor.

La petición solo acepta conversationId, action, operationId y 1–50 mensajes con messageId, expectedStatus y expectedVersion. Rechaza campos de actor, hotel o fecha del navegador. Esos valores proceden del contexto autenticado y del reloj de PostgreSQL.

RPC backend-only, SECURITY DEFINER, search_path=pg_catalog y referencias calificadas:
- Bloquea la conversación (NO KEY UPDATE, compatible con nuevas entradas por FK) y los mensajes explícitos elegibles del hotel y conversación autorizados en orden estable, aunque todavía no exista una fila de atención. Los IDs ajenos no se bloquean; invalidan el lote completo.
- Valida todo el lote y las versiones antes de cambiar nada.
- Incrementa versión solo si cambia el estado; repetir el estado no cambia fecha.
- Primera resolución desde pendiente inicial: inserta versión 2, partiendo de la versión efectiva 1. Incorporación explícita del histórico: inserta versión 1 desde 0, sin alterar su marca NULL. Un no-op pendiente inicial puede auditarse sin crear transición y conserva reintentos seguros.
- Guarda estado y enterprise_audit_logs juntos. Un error de auditoría revierte la operación.
- Una identidad de operación tiene una sola entrada de auditoría. El retry exacto devuelve el resultado vigente sin tocar fechas. Si posteriormente se reabrió, devuelve conflicto.
- Audita IDs, estados, versiones, actor y fecha; no cuerpos, teléfonos ni textos.

Las filas de atención pueden desaparecer por la retención canónica de su mensaje (FK ON DELETE CASCADE), pero la evidencia de operación en enterprise_audit_logs no tiene FK al mensaje y se conserva. Resolver/reabrir no borra nada.

## Inbox

Selección manual por mensaje, límite de 50. El diálogo congela IDs/versiones y muestra número, huésped y extractos; los UUIDs no se presentan al operador, pero siguen en la solicitud. Los nuevos mensajes no se añaden al lote. Se confirma tras persistencia, sin actualización optimista. Error transitorio: conserva la misma operación para reintentar. Conflicto: bloquea la confirmación antigua, refresca y exige revisar.

La preferencia lateral anterior permanece intacta. La selección, confirmación y lecturas de atención se descartan al cambiar hotel/conversación/sesión; se ignoran respuestas de un contexto anterior. No se sustituye lectura, envío ni Human Takeover.

## Indicadores y origen

La RPC de lectura devuelve agregaciones autorizadas y páginas de ocho registros (cursor created_at + message_id). Los totales no dependen de la muestra ni del límite anterior de 1.000 filas. Usa índices nuevos limitados al seguimiento y al día de entradas, sin aumentar ese límite ni cargar el historial en JS. Si la consulta falla, se muestra —.

Todos los agregados requieren la misma relación válida messages/conversations/hotel que el listado. La FK compuesta canónica impide introducir relaciones cruzadas; no se desactivan constraints ni se reparan datos desde este módulo.

Selector de origen obligatorio y separado: entradas trazables (claim con identidad vinculada), simulados (metadatos explícitos) u origen no confirmado. Por defecto, trazables. Las otras dos categorías no se suman a ésta.

- Recibidos hoy: guest elegibles, únicos, del día local según hotels.timezone válida.
- Resueltos hoy: estado actual resolved y última transición vigente a resuelto dentro del día local. Recibidos ayer pueden contar; reabrirlos los excluye; retries no alteran fechas.
- Pendientes ahora: estado efectivo pending, incluidas marcas sin fila de transición y días anteriores. Históricos sin marca ni transición excluidos.
- Urgentes ahora: subconjunto pendiente con estado conversation_ai_state actual urgent, fecha válida >= created_at del mensaje y <= ahora. No usa resumed_at como cierre. La señal actual sustituta no urgente evita reactivar estados anteriores. Resolver retira solo el mensaje resuelto; reabrir reevalúa la señal vigente.

La tarjeta urgente filtra el propio bloque con el mismo criterio servidor y muestra «Solo urgentes». Cada fila abre su conversación. No utiliza el filtro distinto del Inbox. Las ventanas no implican recibidos = resueltos + pendientes. Los límites del día se calculan con zona IANA y contemplan DST.

## SQL y activación propuesta (no ejecutada fuera del contenedor de pruebas)

1. Validado el candidato de cierre en PostgreSQL 17.10 aislado con roles representados y sesiones independientes. Ver message-attention-release.md. La versión anterior nunca se aplicó fuera de bases desechables; no se prepara una actualización de una instalación productiva anterior.
2. Ejecutar preflight_message_attention.sql (solo lectura). Rechaza versión/dependencias/columnas/permisos incompatibles, falta de identidad/auditoría/índices/FK necesarios y colisiones de objetos nuevos. Devuelve dimensiones estimadas de las tablas para valorar el DDL. La migración repite las guardas críticas.
3. Aplicar create_message_attention.sql como administrador confiable en una transacción, después de aprobar el schema. Crea columna, tabla, índices y RPCs; no crea trigger. Ese commit activa DEFAULT 1 para nuevas entradas. El código anterior es compatible y no cambia su pipeline.
4. Ejecutar verify_message_attention.sql: RLS, ACL, FK y huellas de cuerpos de funciones. Las pruebas de transacciones y fallos inducidos se realizan exclusivamente en PostgreSQL desechable, nunca sobre producción.
5. Solo después de recibir evidencia manual del schema aplicado y verificado, continuar la publicación autorizada mediante PR y comprobaciones obligatorias. Si el código llega antes que el schema, muestra no disponible y no ofrece acciones.
6. No incluir el montaje .npm-cache ni sus fixtures o bypasses en artefactos publicables.

No hay grants a anon/authenticated/public ni escritura directa de service_role en la tabla nueva. Solo las tres RPCs previstas se conceden a service_role; las funciones auxiliares quedan privadas. No se modifican grants/constraints de otras funcionalidades. La auditoría existente se valida, no se crea como fallback.

## Recuperación sin pérdida de evidencia

disable_message_attention.sql elimina solo el DEFAULT de la columna de inclusión. La comprobación de contrato lo detecta y bloquea RPCs/acciones/métricas. Conserva marcas existentes, tabla y auditoría. Inbound continúa; nuevas entradas quedan con NULL. Reactivar con ALTER TABLE public.messages ALTER COLUMN attention_inclusion_version SET DEFAULT 1 y repetir verify. Esto no clasifica los mensajes del intervalo desactivado ni cambia el histórico. No DROP, reset ni actualización masiva de datos.

## Evidencia de pruebas y límites

test:message-attention usa código productivo de persistencia, validación, autorización, API y DTO con un doble controlado de RPC. Cubre el contrato de nuevos mensajes, histórico, selección explícita, reintentos, conflictos, auditoría obligatoria, permisos, origen, DST, paginación y ausencia de efectos externos.

La suite con mocks no demuestra locks, rollback o grants. La validación separada scripts/test-message-attention-postgres.cjs sí ejecuta los cuatro archivos SQL y usa sesiones PostgreSQL independientes. Véase message-attention-decoupled-validation.md para resultados de recepción desacoplada. No acredita Supabase real ni rendimiento de producción. Fallos generales de messages, red/DB o fases anteriores del inbound siguen siendo limitaciones separadas; no se ha creado recuperación general de claims.

La revisión visual usa componentes productivos en el montaje aislado existente y RPCs simuladas identificadas. El almacenamiento de esa revisión es memoria del fixture, no evidencia de durabilidad de PostgreSQL. El producto no usa ese fixture ni persistencia local como reemplazo del contrato.
