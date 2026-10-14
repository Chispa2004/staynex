# D11: recuperación completa de una solicitud fallida

Trabajo local desde `a6594c5afb4390781ea7f112fef7564af9544c9e`, rama `codex/guest-service-quality-evaluation`, checkout limpio al comenzar. El commit que contiene este informe fija esta fase. La evaluación de naturalidad con IA real está aplazada por decisión expresa del usuario: no se han buscado ni configurado credenciales, ni autorizado gasto.

## Causa y cambio

Antes, un segundo turno podía crear el ticket únicamente con «Sigue el mismo problema del aire acondicionado». La RPC toma los hechos del mensaje persistido, no de `p_request.details`; por ello no bastaba con recomponer un prompt. Faltaba también conservar y cargar una referencia verificable al intento original fallido.

`failed-request-context.js` conserva un marcador de fallo generado por el servidor en `messages.metadata.service_quality`: identificadores de mensajes, hotel, huésped, conversación, reserva, habitación y fase. No copia prioridades propuestas por el modelo ni duplica en el marcador la descripción del huésped. `getRecentMessages` carga solo `metadata->service_quality`, no el resto de metadatos.

La relación requiere una sola solicitud fallida conocida, una continuación explícita o aclaración compatible, ámbito/estancia/habitación idénticos y los mensajes originales disponibles. Compartir «aire acondicionado» no basta. Se bloquean múltiples candidatos, cambio de estancia/habitación, retirada, intervención de personal, orden temporal incompatible, historial incompleto o corrección no interpretable con seguridad. No se eligen candidatos por el más reciente. La revisión pide confirmar incidencia y habitación sin confirmar registro o cancelación.

Los hechos se releen por identificador y ámbito antes de escribir. La prioridad se vuelve a calcular con las reglas operativas existentes sobre la incidencia y sus aclaraciones. Una corrección explícita acotada como «Corrijo: no pierde agua; solo no enfría el aire acondicionado» prevalece para el cálculo de un ticket nuevo; otras negaciones/correcciones inciertas van a revisión. En un ticket ya persistido se conserva la prioridad vigente y no se restaura una prioridad antigua por el reintento. No se implementa cancelación ni ejecución de múltiples solicitudes.

## Persistencia atómica e idempotencia

La nueva envoltura `recover_guest_operational_request_v1` ejecuta dentro de una única transacción las RPC existentes para el mensaje original y las continuaciones. Los recibos existentes siguen siendo la identidad de cada operación. El original se reproduce primero: si ya había sido guardado, se recupera su recibo en lugar de crear otro ticket. Las continuaciones exigen ese ticket exacto. Un fallo en cualquier recibo revierte **toda** la recuperación; no queda una descripción original con una prioridad calculada para una corrección aún no incorporada.

Las RPC conservan sus bloqueos de hotel/conversación, comprobación de ámbito, reserva y control humano. El primer evento no se une a otro ticket solo por tener la misma clave temática. El contrato de recuperación valida todos los mensajes y su orden, unicidad y último identificador, y comprueba estancia/habitación antes de añadir detalles a un ticket ya existente.

Después del commit, el consumidor relee el ticket por id/hotel/huésped/conversación, verifica habitación/reserva, los mensajes completos y el último evento. Solo entonces confirma. Un fallo de relectura queda no confirmado, aunque el commit haya ocurrido; el reintento sigue los mismos recibos. No hay fallback a escrituras parciales cuando falta la nueva RPC.

## D11 antes y después

Mensajes sin modificar:
1. «El aire acondicionado pierde agua.» — primer guardado falla.
2. «Sigue el mismo problema del aire acondicionado.»

| Evidencia | Antes (a6594c5) | Después |
|---|---|---|
| Descripción | Solo el segundo mensaje | Mensaje original + seguimiento íntegro |
| Prioridad | normal | high, regla `ongoing_water_damage` aplicada a los hechos completos |
| Ticket | Uno, pero genérico | Uno, con la fuga conservada |
| Habitación | F-617 en la prueba anterior | QA-617, valor autorizado tanto al inicio como al final de la nueva prueba |
| Respuesta recuperada | «Ahora sí, hemos registrado tu petición sobre la incidencia del aire acondicionado para la habitación F-617.» | «Siento las molestias. Ahora sí, hemos registrado tu aviso para la habitación QA-617. Evita pisar la zona mojada.» |

La habitación de la nueva fixture es distinta de la antigua; no es una reasignación real ni un cambio durante la recuperación. Los identificadores son sintéticos. La respuesta no afirma aviso enviado, personal actuando ni plazo.

## Pruebas ejecutadas

- **15 grupos PASS** en PostgreSQL local desechable: instalación repetida y permisos del wrapper; recuperación D11 completa; dos fallos; escritura seguida de relectura fallida; fallo real del segundo recibo mediante trigger con rollback total; cinco recuperaciones concurrentes; ambigüedad entre solicitudes; nueva incidencia; corrección posterior; desistimiento; cambio de habitación/estancia y aislamiento hotel/huésped/conversación; prioridad vigente del personal; control humano; cantidades/objeto/habitación; Inbox sin efectos. Se comprueban datos SQL y recibos, no solo frases.
- Cinco recuperaciones concurrentes: **un ticket, dos recibos de fuente, una sola incorporación del seguimiento**. Evidencia y eventos conservados, incluidas lecturas y resultados de los cinco consumidores.
- Regresión pura de relación y respuesta: PASS; incluye fuente antigua/incompleta, intervención de personal, mensaje posterior conocido, aclaración útil y catálogo sin RPC que no deriva en escrituras parciales.
- Regresiones existentes afectadas: operaciones, atención, recibos, precisión, seguimientos, turnos, salida final y calidad PASS. Los replays históricos del test de recibos no son llamadas nuevas.
- Los cuatro turnos del arnés anterior de doble fallo/relectura se comprueban con SDK sustituido por un doble; no se ejecuta la matriz amplia ni la reserva R01–R03.
- Sintaxis: **457 archivos PASS**. Build aislado del Dashboard: **PASS**. `git diff --check`: **PASS**.
- Incorporadas al CI las comprobaciones de relación en `critical` y el ensayo nuevo en el job PostgreSQL. No se ha ejecutado GitHub CI ni se ha publicado.
- Fallo estático heredado `test:guest-ai-tenant-isolation`: conserva la expectativa antigua sobre `withHotel(supabase.from('ai_logs'))`. Su reproducción en la base anterior sigue documentada; no se modifica, debilita ni declara aprobado.

[Evidencia SQL completa](evidence/service-failed-request-recovery/postgres.json.gz), [comprobaciones](evidence/service-failed-request-recovery/postgres-checks.txt) y [D11/concurrencia](evidence/service-failed-request-recovery/d11-before-after.json.gz). Transportes externos bloqueados. **0 llamadas externas, 0 tokens reales y 0 USD**. Las cuatro generaciones controladas del arnés no son llamadas al proveedor.

## Migración propuesta, no aplicada remotamente

Archivo: `supabase/sql/recover_failed_operational_request.sql`.
SHA-256 canónico LF: `36a73e3c8759c7c51ccdf2bec9e39c02753a3452bcf734e203c6cfca9c5faa47`.

Solo crea/reemplaza la función `public.recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb)`, SECURITY INVOKER, y limita su ejecución a `service_role` (revoca PUBLIC/anon/authenticated). No añade tablas, columnas, índices ni triggers persistentes. No hace backfills ni modifica filas al aplicarse. Los triggers de fallo existen únicamente dentro del clúster desechable del test. Recarga de esquema PostgREST incluida para una futura aplicación autorizada.

Orden futuro: comprobar el catálogo y la presencia del contrato existente; aplicar después de `add_operational_request_receipts.sql` y `guard_operational_request_clarification.sql`; verificar RPC/permisos; publicar consumidor compatible. Nada de esto se ejecuta en esta fase. Los consumidores actuales mantienen su RPC sin cambios. Si se despliega el consumidor nuevo sin esta dependencia, la recuperación permanece no confirmada: nunca se reemplaza por una secuencia no atómica.

Recuperación de despliegue futuro: detener el uso del consumidor nuevo si no se acredita el contrato; conservar mensajes, recibos y tickets. No borrar ni reencolar registros para compensar un resultado incierto. La función aditiva puede permanecer con el código anterior, pero este perdería la corrección D11; volver a él no equivale a resolver el defecto. No eliminar el wrapper mientras tenga consumidores activos ni restaurar una copia de datos sobre operaciones posteriores.

## Límites de esta fase

La recuperación automática exige el marcador nuevo y que el historial cargado incluya las fuentes. El lector conserva su ventana existente de ocho mensajes; si queda fuera una fuente necesaria, se pide revisión. No hay búsqueda ilimitada ni reconstrucción por coincidencia temática. No se ha probado producción/PostgREST remoto, durabilidad ante caída física del host ni clasificación abierta de todas las formulaciones lingüísticas. Correcciones no reconocidas, solicitudes múltiples y cancelación efectiva siguen fuera del automatismo.

Los hechos pueden cambiar después de una relectura: el acuse describe el estado comprobado, no garantiza entrega ni notificación. Las decisiones del personal no se sustituyen por una prioridad histórica. No se afirma mejora de naturalidad ni que la publicación esté lista por estos tests.

Producción, demo, Ubikos, inventarios, permisos desplegados, Guest Memory OFF y SEND_AUTOMATIONS=false permanecen intactos. Sin push, PR, despliegue, SQL remoto ni envíos. No se solicita clave ni presupuesto: evaluación real aplazada por decisión expresa del usuario.
