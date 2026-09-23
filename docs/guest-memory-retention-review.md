# Guest Memory: contención y retención de derivados — 23/09/2026

## Estado y alcance

**Corrección local; Guest Memory completo sigue abierto.** Se conservan las guardas OFF y se corrige la limpieza del significado de memorias ya sujetas a la regla existente, sus referencias en logs, la paginación y la comunicación de errores. No se han publicado estos cambios ni ejecutado limpieza, SQL, migraciones, proveedores o cambios de configuración remotos. No se ha programado ninguna tarea.

Base real, contrastada mediante fetch de `origin/main`: `1ac823e2d220a36a9bd196fd9f44d5e3135fc3ee` (el SHA comunicado omitía una `f`). Rama aislada: `codex/guest-memory-retention`. Se preservan el informe local de Salud `40a3696`, el checkout de organizaciones `cc1be8a`, su trabajo pendiente, el informe original no versionado y los inventarios privados. No se incorporan commits de PR #11. Fuente del diagnóstico: apartado A del informe local `docs/daniel-audit-status-2026-09-22.md`; no se reabre el resto de la auditoría.

## Qué contiene OFF y qué no

| Recorrido / función | Comportamiento comprobado |
| --- | --- |
| `shared/guest-memory/feature-flag.js`, `isGuestMemoryEnabled` | Solo la cadena exacta `true` habilita memoria. Ausente/false/otras variantes: OFF. No se cambia este contrato. |
| `src/services/guest-memory.service.js`: `getGuestMemory`, `upsertGuestMemory`, `detectGuestMemoryFromMessage`, `upsertDetectedGuestMemories`, `formatGuestMemoryForPrompt` | OFF evita extracción, lectura, escritura y formato de recuerdos; devuelve vacío o `feature_disabled` antes de acceder a Supabase. Incluye candidatos procedentes de experiencias. |
| `dashboard/app/api/guest-memory/route.js` y `[guestId]/route.js` | Los handlers reales GET/PATCH/DELETE y detalle, con contexto autorizado sintético, devuelven desactivado sin tocar la base. La autenticación/permiso sigue siendo un requisito previo. |
| `src/services/staynex.service.js`, preparación de `conversationContext`, candidatos y `memoryKeysUsed` | Vacía `guestMemory`, omite extracción/persistencia y no declara claves usadas mientras OFF. Los llamadores siguen usando los helpers centrales. |
| `src/prompts/staynex.prompt.js`, `buildStaynexUserPrompt`; `openai-concierge.service.js`, `enhanceConciergeIntelligence`; `automation.service.js` | Se elimina el bloque específico de memoria. Prueba runtime del prompt y captura de petición con SDK OpenAI simulado; ningún proveedor real. |
| Inbox/Recepción/Copilot, API ejecutiva | Se mantienen guardas existentes. El Dashboard ejecutivo ya no consulta memoria: se ejecutan su handler y sus cargadores reales con una trampa de acceso a `guest_memory`. |
| `guest-memory-ai.service.js`, `generateGuestProfile` | OFF omite `guest_memory`, pero sigue leyendo reservas, conversaciones, tickets, upsells, conversiones y logs para construir etiquetas, puntuaciones e insights. Probado con transporte sintético. |
| `guest-intelligence.service.js`, `persistGuestIntelligenceProfile` | **Independiente de OFF.** Perfil, afinidades, señales y sentimiento siguen persistiendo; `detected_from` puede copiar el mensaje. Se ha probado esa independencia, no se ha desactivado silenciosamente. `staynex.service.js` lo llama después de construir el contexto. |
| `conversation-context.service.js`, `upsertConversationAiState` | Conserva `last_ai_response`, `ai_summary`, `ai_reasoning` y estado operativo/metadatos, sin depender de OFF. Evidencia de código. |
| `ai-log.service.js`, registro de interacción | Guarda cuerpos, respuesta, claves de memoria, resumen/razonamiento, motivos de escalación y datos operativos. Las nuevas guardas OFF no borran retrospectivamente los logs anteriores. |
| `openai-concierge.service.js`, `buildPromptPayload` | OFF vacía `guest_memory`, **pero todavía se pueden enviar** teléfono/habitación, mensaje actual y recientes, reserva, contexto PMS, `guest_intelligence` y tickets, bajo las guardas propias del proveedor. La captura simulada confirma esa distinción. |
| Debug y otros proveedores | `AI_CONCIERGE_DEBUG=true` registra el payload de Concierge. OpenAI principal, traducción, PMS y mensajería tienen finalidades/guardas independientes. No se afirma que OFF bloquee sus datos, ni se ensayan llamadas reales. Las copias externas y la retención de logs del proveedor no se resuelven con esta limpieza. |

Los perfiles/resúmenes históricos pueden conservar información originada en recuerdos o mensajes anteriores. OFF no es un filtro semántico de todo texto histórico ni garantiza que ningún dato del huésped llegue a un proveedor. No se añade un bloqueo de categorías sensibles para ON: A2 requiere una decisión separada antes de cualquier reactivación, que sigue sin autorizarse.

## Configuración desplegada: lectura acotada

El 23/09 se consultó la consola de la réplica activa de Railway, entorno production, sin modificar nada. Despliegue `e9f8b697-36a5-46a4-8704-7af180ee5eec`, una réplica visible, instancia `5155da64-6b86-43d0-903b-274e9743c14c`. Se leyó `/proc/.../environ` del comando `src/server.js`, proyectando **solo** los dos flags y `RAILWAY_GIT_COMMIT_SHA`:

- `GUEST_MEMORY_ENABLED`: ausente, por tanto OFF con el contrato publicado.
- `SEND_AUTOMATIONS`: `false`.
- SHA: `1ac823e2d220a36a9bd196fd9f44d5e3135fc3ee`.

No se imprimieron secretos. Esto acredita esa réplica/proceso en ese momento, no cron externos ni otros entornos. El intento de lectura de `/api/guest-memory` del Dashboard público fue bloqueado por el navegador (`ERR_BLOCKED_BY_CLIENT`); no se acredita aquí su flag efectivo ni todas las instancias Vercel. No se ha revisado el catálogo remoto, permisos/RLS ni scheduler. No se deduce su ausencia por no haberlos consultado.

## Defecto reproducido y corrección

Se ejecutó el blob del job de la base exacta sobre una fixture sintética: después de limpiar, `memory_value='[anonymized]'` pero seguían `memory_key='dietary_gluten_allergy'`, `ai_logs.memory_keys_used` y `ai_summary`. La nueva regresión ejecuta el job modificado y comprueba el estado final, no solo su código fuente.

`src/jobs/cleanupExpiredGuestData.js`, `cleanupExpiredGuestData` / `anonymizeHotel`:

- Mantiene los días configurados por hotel y los defaults existentes: checkout 30 días; cuerpos de mensajes 90 días **y** huésped elegible por checkout. No introduce una política nueva por fecha de creación de la memoria.
- Antes de la limpieza por huésped recorre **todas** sus estancias. Una estancia con checkout en el umbral o posterior, o sin checkout conocido, protege sus datos globales. Una reserva antigua individual continúa bajo su regla previa, aunque el huésped tenga otra estancia.
- Recorre hoteles, reservas, memorias, logs, huéspedes, solicitudes, conversaciones y mensajes con cursor por ID hasta página vacía. `--limit` pasa a ser **tamaño de página**, no límite total. Soporta un tope de servidor menor que el solicitado.
- En `guest_memory` elegible sustituye tipo y clave semántica por `anonymized` / `anonymized:<id>` (única y estable), borra valor, confianza, referencia al mensaje/reserva y metadatos de origen, desactiva el registro. Conserva ID y asociación hotel/huésped para integridad y repetición segura; no es anonimización irreversible de toda la identidad.
- En **los mismos logs elegibles por hotel/guest_id** limpia, además de los cuerpos ya previstos, `memory_keys_used`, `memory_used`, `ai_summary`, `ai_reasoning` y `human_reason`: copias textuales que podían conservar el significado eliminado. Mantiene IDs, enlaces operativos, métricas y resultados de tickets/envíos.
- Mantiene la limpieza preexistente del teléfono/habitación de huésped, datos personales de reservas antiguas, cuerpos/traducción/metadatos de mensajes antiguos y datos personales de solicitudes de experiencia ya completadas/canceladas/rechazadas. No borra filas, conversaciones, reservas, tickets ni solicitudes pendientes; mensajes recientes siguen protegidos. La sustitución de metadatos de mensajes/solicitudes ya formaba parte de esa regla y debe revisarse en el preview antes de autorizar una ejecución.
- Cambia solo filas cuyo contenido necesita actualización. La marca de retención versión 2 conserva su fecha en repeticiones. Cada escritura confirma su ID y ámbito antes de contabilizarla. Interrumpir puede dejar progreso parcial: repetir continúa de manera idempotente, sin restaurar datos borrados.
- Ya no trata tablas/columnas ausentes como éxito. Devuelve `complete=false`, `status=partial`, etapa/código sin contenido privado; continúa con otros hoteles. El CLI devuelve código 1 si el resultado es parcial. Fallos de auditoría y marcador también impiden declarar éxito.
- `last_data_retention_cleanup_at` se escribe solo tras completar datos y auditoría. El audit log registra `data_complete` (o `partial`), que **no** acredita el marcador posterior ni una limpieza global de privacidad. Resultado final y salida del proceso son la evidencia de finalización del ámbito. Si el proceso muere entre pasos, no debe inferirse éxito de la ausencia de un error persistido.
- Dry-run calcula filas que realmente cambiarían, por tabla y hotel, sin actualizar datos, auditoría ni marcadores. Un fallo en dry-run también es parcial. `policyPending` acompaña siempre el resultado para evitar presentarlo como borrado integral de derivados.

No hay una transacción global ni bloqueo de todos los escritores. Se revalida la elegibilidad justo antes de cada huésped, pero una nueva reserva/escritura concurrente posterior puede cambiarla. **Antes de una ejecución real es indispensable una ventana estable para las escrituras afectadas** o un contrato transaccional adicional aprobado. No se promete snapshot consistente de un sistema que está cambiando. No se ha detenido ningún proceso en esta entrega.

## Fuentes que requieren decisión, no borrado automático nuevo

| Fuente conservada | Decisión concreta pendiente |
| --- | --- |
| `guest_intelligence_profiles`, `guest_interest_affinities`, `guest_behavior_signals`, `guest_sentiment_history` | Separar perfil reutilizable/afinidades, textos `detected_from` y señales operativas. Definir qué expira con el huésped, qué sigue una conversación/estancia y qué debe dejar de generarse con OFF. No existe una regla aprobada aplicable a todos estos campos. |
| `guest_revenue_predictions`, `revenue_ai_events`; `guest_ai_profiles/tags/insights/actions` | Distinguir perfil, predicción y texto personal de métricas/resultados de acciones. No inferir que todos los registros deban borrarse a los 30 días. |
| `conversation_ai_state` | Resumen/razonamiento/respuesta mezclados con takeover, escalación y estado operativo. Definir cuándo expira el texto sin perder controles o estado de una conversación activa. |
| Campos adicionales de identidad en `guests` | El nombre de la fixture de auditoría no está en el esquema base versionado consultado. No se añade un campo ni se supone que exista remotamente: inventariar columnas reales y acordar su alcance antes de incluirlas. |
| Logs sin `guest_id`, derivados enlazados por conversación, otras columnas y copias externas | No reciben de forma implícita la regla por huésped. Revisar enlace fiable, finalidad y retención; no eliminar por coincidencia textual o por nombres. |

Se conservan conscientemente las fuentes operativas todavía necesarias y las fuentes sin regla aprobada; por eso siguen existiendo posibles copias de información. No se declara «todo anonimizado». El monitor heredado `messageRetentionHealthCheck` sigue teniendo el límite/interpretación de ceros descritos en A7 y **no sirve como certificado** de que este trabajo se ejecutó completamente. No se amplía esta corrección a Salud, programación de alertas o una política global.

## Pruebas locales y límites

Node 24.19.0; variables saneadas; `SEND_AUTOMATIONS=false`, Guest Memory OFF, proveedores simulados, dotenv excluido y tráfico no local bloqueado con `scripts/ci/isolate.cjs`. El SDK usado para capturar Concierge es una clase sintética. El contenedor PostgreSQL 17.10 usa `--network none`, tmpfs, sin puertos publicados ni volúmenes; se retira al terminar.

| Comprobación | Resultado |
| --- | --- |
| Reproducción contra el job de main | Defecto confirmado: valor sustituido, clave y referencias conservadas. |
| `test:guest-memory-pilot-off` | PASS; servicios, extracción, escritura, prompts, UI y rutas existentes. Se reemplaza una expectativa estática obsoleta de API ejecutiva por ejecución del handler/cargadores, y se actualiza el literal del contador de Copilot a su guarda estricta actual. No se elimina una protección para hacer pasar el test. |
| `test:guest-memory-off-boundaries` | PASS, 4 escenarios: handlers, consultas ejecutivas, petición simulada al proveedor y persistencia independiente de perfiles. |
| `test:guest-memory-retention` | PASS, 8 escenarios: 507 memorias con tope servidor 31, dry-run exacto, aislamiento, límites de fecha/estancia desconocida, otras tablas con más de un lote, repetición, fallo intermedio/recuperación, errores de esquema/audit/marcador y salida CLI. |
| `test:guest-memory-retention-postgres` | PASS, 5 escenarios con job real y tablas tipadas/clave única: preview, trigger que interrumpe tras un lote, recuperación/referencias/aislamiento, repetición y columna ausente. Usa adaptador SQL de pruebas, **no** PostgREST remoto/RLS; no certifica el catálogo de producción. |
| `test:guest-intelligence` | PASS, 13 casos existentes. |
| Comprobaciones del runner `critical` | Todas ejecutadas y PASS, incluida Salud, envío manual, exclusión, Inbox, contexto/aislamiento hotelario, guardas humanas, traducción, demo, automatizaciones y perímetro HTTP. El runner se detuvo inicialmente por CRLF en los cargadores heredados de Inbox/HTTP; se repusieron en la copia aislada los mismos bytes LF de Git, sin cambiar contenido ni expectativas. La segunda pasada llegó hasta HTTP, y su repetición aislada final pasó. No se presenta como un run remoto verde. |
| Sintaxis / build / diff | PASS: 317 archivos JS/CJS/MJS, `dashboard:build` (Next 15.5.18, 64 páginas), `git diff --check`. Aviso no bloqueante de caché de webpack; sin error de compilación. |
| `test:guest-ai-tenant-isolation` | Sigue fallando en la expectativa estática heredada de `withHotel(supabase.from('ai_logs'))` de la API ejecutiva, ya documentada en el apartado A. El test y el código de ese recorrido son idénticos a main; las aserciones de aislamiento anteriores pasan. No se debilita ni modifica esa suite ajena. |

Los tests nuevos quedan incorporados al runner **local/futuro** de CI: OFF y retención en `critical`; PostgreSQL de retención en `postgres`, adicionalmente a Knowledge y exclusión. No se ha subido la rama ni ejecutado CI remoto. El test legado `test:guest-memory` exige credenciales y escribe; no se conecta a producción para ejecutarlo.

## Preparación de la siguiente fase (no ejecutada)

1. Revisar/publicar el diff local por separado, conservando OFF y `SEND_AUTOMATIONS=false`. Confirmar los flags en todos los procesos de backend, Dashboard, workers y cron; no basta una variable de proyecto o un despliegue exitoso.
2. Con autorización futura, contrastar destino efectivo y catálogo **en lectura**: columnas/tipos/nullabilidad, restricciones, RLS/grants y visibilidad completa del rol del job para las seis fuentes modificables, conversaciones, hoteles y audit log. No usar un rol con RLS que oculte filas y confundirlas con ausencia. Verificar que no existen triggers de envío sobre estas actualizaciones. Ningún SQL/migración nuevo es necesario según el esquema versionado.
3. Revisar la política ya configurada por hotel y acordar expresamente los límites anteriores. Preparar respaldo privado, control de acceso al respaldo y plan de revisión; no meterlos en Git. Los inventarios actuales no se modifican.
4. En ventana estable y con alcance de hotel explícito, ejecutar **primero** `npm run jobs:cleanup -- --dry-run --hotel-id=<hotel autorizado> --limit=100`. Confirmar `complete=true`, fechas de corte, protegidos, recuentos reales por tabla, referencias y campos incluidos/excluidos. Revisar de forma privada los IDs elegibles con lectura restringida; no exportar cuerpos sensibles. Un dry-run incompleto no autoriza ninguna ejecución.
5. Comparar de nuevo el conjunto/criterios si ha habido cambios desde el preview. Solo tras autorización específica ejecutar sin `--dry-run`, manteniendo bloqueadas las escrituras que puedan cambiar elegibilidad/contenido. `--limit` no restringe el total: procesa todo el ámbito elegible.
6. Verificar resultado final completo, salida 0, auditoría del ámbito y marcador, no solo «job started» o `data_complete`. Revisar ausencia de etiquetas/campos previstos y conservación de operativos/protegidos con identidades sintéticas autorizadas; no usar la demo. Si falla, conservar evidencia de etapa/recuentos, resolver causa y repetir ese ámbito. No rehidratar datos sensibles desde un respaldo como recuperación automática.
7. Solo en una fase autorizada aparte definir scheduler, supervisión de retrasos/errores y monitor fiable. No activar limpieza periódica, ON ni envíos por esta entrega.

**Cierre que puede atribuirse:** A1 reforzado con pruebas de límites y lectura del backend actual; parte concreta de A5 (etiquetas/referencias bajo regla existente) y parte de A7 (lotes, protección de estancias y fallos del job) corregidas localmente. **Pendientes:** publicación/verificación del job, Vercel y otros procesos, catálogo/visibilidad/permisos, decisiones de A2/A3/A4/A5/A9, scheduling/alertas A6 y monitor de A7. Guest Memory no queda cerrado en producción.
