# Respuestas según el turno y el ticket — 8 octubre 2026

Base: `11770aaaff3a41fe6405ab41da8c31e1c2f1974c` (PR #44). Rama `codex/guest-service-context-quality`. Se conserva el informe local anterior `5e493975e401e930beb69843e97a20b0e3d891df`. Organizaciones y otros trabajos no se incorporan.

## Causa y corrección

El acuse posterior al guardado volvía a redactar la solicitud completa, sin distinguir consulta de recepción, aclaración o progreso. La instrucción de dar un acuse específico para toda solicitud abierta contradecía la de no repetirlo en seguimientos. El fallback describía el registro en tercera persona. Además, el contexto solo recuperaba cinco tickets abiertos del huésped y Copilot dependía de una relación parcial con el último mensaje.

`shared/guest-service/ticket-context.js` selecciona por hotel, huésped, conversación y relación con el mensaje; admite un seguimiento inequívoco, nunca el último ticket arbitrario. Distingue actos de conversación y estado persistido. Varios candidatos producen una pregunta de aclaración. Un primer registro tras recoger fechas sigue siendo un alta de solicitud, aunque la frase sea una aclaración gramatical.

Las instrucciones principales, Concierge, composición posterior a persistencia y borrador de recepción comparten este contexto. El compositor recibe evidencia y objetivo del turno, no una frase obligatoria que copiar. La salida final conserva el plan por estado cuando el modelo inventa actuaciones, repite un registro administrativo o no responde a la consulta de progreso. No se sustituye una palabra por un sinónimo ni se introduce variación aleatoria. Los filtros siguen siendo acotados; no prueban la veracidad de cualquier texto futuro.

La aclaración se escribe y se relee antes de afirmar que se incorporó. El identificador esperado del ticket llega a la RPC. Si se cerró entretanto, falla sin insertar otro. Una consulta de progreso solo lee: no abre tickets, no añade recibos ni reabre trabajo completado. Solicitud recibida, trabajo en curso y trabajo completado siguen siendo estados distintos; ninguno prueba un aviso, envío, entrega, factura emitida o reserva confirmada.

## Asistencia IA

1. El detalle autorizado de Inbox recupera tickets y recibos paginados, limitados al hotel/conversación/huésped. Un error de lectura bloquea el borrador y ofrece reintento dentro del panel.
2. La prioridad del ticket seleccionado es la oficial y se identifica como tal. La heurística solo se muestra como sugerencia cuando no hay ticket seleccionado. La alerta urgente de mensaje se presenta separada: una prioridad alta no la crea.
3. El panel muestra solicitud, habitación, estado, prioridad y enlace al ticket; recomienda revisar/asignar, comprobar el avance o revisar el resultado según el estado. No recomienda recrear una solicitud existente. Las relaciones ambiguas y estados desconocidos son explícitos.
4. Seleccionar, generar y copiar son operaciones de lectura. No envían, no modifican prioridades ni liberan el control humano. La marca de lectura de Inbox conserva su contrato existente; no se confunde con una escritura de tickets.

## SQL y orden de publicación

`supabase/sql/guard_operational_request_clarification.sql`, después de `add_operational_request_receipts.sql`, antes del consumidor nuevo. SHA-256 de los bytes revisados en Windows: `626ffa95427e80244feff771f1db33fb0c8f9a00c92c00648bcb5dff29e448ac` (Git normaliza finales de línea; verificar el hash del archivo que se aplique).

Solo reemplaza el cuerpo de `record_guest_operational_request_v1(uuid,uuid,uuid,jsonb)`, con `SECURITY INVOKER` y `search_path` conservados. No modifica tablas, columnas, índices, triggers, permisos, defaults, flags ni filas. Añade `expected_ticket_id` opcional, bloqueo y comprobación de estado/ámbito/reserva/clave, validación del replay y evidencia `target_ticket_enforced`. Los consumidores anteriores omiten el campo y mantienen su contrato. El nuevo consumidor falla de forma conservadora si no acredita la guarda.

El preflight de lectura del proyecto previsto confirmó que el cuerpo anterior coincide exactamente con la migración versionada y que solo `service_role` tiene EXECUTE entre los roles API comprobados; anon/authenticated no lo tienen. Guardar la definición anterior y el catálogo de permisos fuera de Git. Aplicar el archivo exacto en una transacción, comprobar cuerpo y permisos y recarga PostgREST, publicar código con CI aprobado y comprobar todas las versiones. No probar reclamaciones con mensajes reales. En recuperación se puede retirar el consumidor nuevo conservando esta guarda compatible; no borrar recibos ni reencolar una escritura incierta. Reintentar con el mismo mensaje conserva la deduplicación.

## Evaluación conservada

La revisión privada trazable contiene ID, contexto, salida original, salida final, etiquetas y huellas de las fuentes anteriores. No se sobrescriben las 126 generaciones originales. Las etiquetas pueden solaparse; **no se suman como respuestas únicas**. Una promesa del modelo antes del commit se clasifica como texto operativo no acreditado, no como prueba de que se ejecutó.

| Conjunto anterior | Operativo | Derivación innecesaria | Dato conocido | Tono/repetición/longitud | Satisfactoria | Insuficiente |
|---|---:|---:|---:|---:|---:|---:|
| 126 originales | 67 | 7 | 20 | 35 | 27 | 0 |
| 54 turnos finales correspondientes | 0 | 0 | 0 | 22 | 32 | 0 |

La eliminación de errores operativos anteriores ya correspondía a PR #43/#44; no se atribuye a este cambio. Los 54 finales son 36 turnos sintéticos y 18 de demo, no 126 respuestas enviadas.

Nueva evaluación: 34 contextos en dos hoteles sintéticos con políticas distintas, ES/EN, 68 generaciones principales/Concierge y cinco iteraciones completas de 25 acuses: **193 generaciones reales**, incluidas las desfavorables. Fixture versionado `scripts/fixtures/guest-service-quality/contextual-evaluation.json`. No son 193 conversaciones independientes: los finales comparan 34 contextos por dos rutas y comparten el acuse posterior al guardado cuando corresponde. Los casos de control humano son borradores/ensayos de la frontera final; el pipeline no autoriza su envío automático.

La revisión de los 68 finales actuales no observa errores operativos, derivaciones injustificadas ni preguntas de datos conocidos en este conjunto. Se mantienen 10 finales con limitación de estilo/utilidad: objeto perdido y factura del hotel 1 demasiado genéricos, consulta de promoción del hotel 1 extensa, objeto perdido del hotel 2 genérico y promoción del hotel 2 larga/repite URL. Los otros 58 se consideran satisfactorios para el caso. Esto no es una estimación estadística de producción ni una garantía universal.

Las generaciones originales nuevas todavía inventan actuaciones (p.ej. comprobación de disponibilidad o búsqueda en curso). Se conservan y se verifica que no lleguen a los finales ensayados. Las promociones conservan porcentaje, ambas ventanas de fechas, canal, no acumulabilidad y disponibilidad aunque el texto sea largo. El fallback de aclaración es seguro pero puede repetir «hemos añadido ese detalle»; la naturalidad no se declara terminada.

## Pruebas

- Suite de acuses: límites por hotel, persistencia antes de confirmar, replay de salidas reales, estado/idioma, promoción completa, progreso sin novedad, varios tickets y estancia ambigua; incluye las 193 generaciones retenidas / 68 rutas finales.
- PostgreSQL desechable: 11 grupos; concurrencia, retry/respuesta perdida, rollback, control humano, archivo, otros hoteles y aclaración al mismo ticket con cierre concurrente. Se bloquean proveedores.
- Inbox: 9 pruebas reales de navegador a 1366 y 390 px, claro/oscuro, selección/historial/scroll, copiar sin escritura operativa, lectura fallida y recuperación, contexto anterior bloqueado. ES/EN se cubren también en pruebas de servicio/traducción.
- Build de Dashboard y pruebas críticas/sintaxis. HTTP Security falla por su comparación literal de saltos de línea en el checkout Windows CRLF; con `dashboard/lib/demo.js` normalizado a LF sin cambio de blob pasa. No se cambia ni debilita su expectativa. CI Linux debe acreditar el resultado real.

## Demo y verificación pública

Antes: 78 mensajes, 13 tickets, 15 recibos, nueve conversaciones activas; históricos cerrados conservados. Se prepara respaldo recuperable de 33 relaciones y huellas de otros hoteles/configuración fuera de Git. El único cambio de datos autorizado son contenido y metadatos de generación de las 18 respuestas IA existentes. No cambia mensajes de huésped, fechas, etapas, relaciones, prioridades, estados ni control humano. Las respuestas se calculan secuencialmente con evidencia disponible en cada turno. El informe privado recoge las nueve conversaciones completas antes/después.

Publicación y actualización de demo pendientes de completar al preparar este commit. No se presenta el Preview como verificación funcional. Guest Memory OFF y SEND_AUTOMATIONS=false deben verificarse después; no se activan ni se envían mensajes a huéspedes. El cierre posterior documentará PR, SHA, CI, versiones e inspección pública, incluido tamaño real del viewport móvil o su limitación.
