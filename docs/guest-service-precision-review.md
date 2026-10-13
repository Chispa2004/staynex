# Precisión de acuses, llegada nocturna y recuperación D11

Fecha: 2026-10-13. Rama `codex/guest-service-quality-evaluation`; base comprobada y limpia al comenzar `01d8f15ad8265ff2f59e3b644d82ed846666f27d`. El commit que contiene este informe fija el candidato local. Sin publicación ni comparación nueva con proveedor real.

## Resultado y causa

- **Cantidad**: el fallback compartido usaba una etiqueta estática singular para almohadas. `item-quantity.js:persistedItemQuantity` lee cantidades ES/EN y aclaraciones desde la descripción del ticket releído, nunca desde una propuesta del modelo. Si la cantidad no se puede resolver, omite el número. `ticketReplyPlan` nombra 2 almohadas/2 toallas y conserva 4/3 en la aclaración del mismo ticket. El acuse generado debe contener cantidad y objeto juntos; el número de habitación no puede satisfacer ese control. No hay un caso especial por hotel o conversación.
- **Llegada**: el compositor concatenaba la misma fecha y condición en varios avisos. `arrivalReplyText` incluye la víspera dentro del plazo, usa fecha legible y distingue edificio/habitación una vez. En seguimientos contesta al último turno. No altera fecha/hora/estancia ni afirma coordinación verificada. `groundedArrivalReply` ya no rechaza automáticamente una respuesta por superar 110 palabras; las condiciones e instrucciones se conservan. El reconocimiento de fechas sigue acotado a ES/EN y los formatos anteriores.
- **D11**: después del primer fallo no había ticket, pero el segundo mensaje se clasificaba como progreso incluso cuando acababa de crear uno. `recordOperationalRequest` devuelve `newlyRecorded` solo desde el ticket confirmado por id/hotel/huésped/conversación y mensaje de origen; `ticketTurn` transforma ese acuse en registro recuperado. No basta con el booleano propuesto por el modelo. La generación de acuse y su filtro final rechazan “sigue pendiente” como único contenido cuando acaba de registrarse tras ese seguimiento.

No cambian RPC, migraciones, autorización, transportes de la aplicación, flags ni presentación visual. Principal y Concierge comparten los acuses; Inbox conserva un borrador sin escrituras.

## Evidencia D11 y cantidades

Archivos completos en [evidencia](evidence/service-precision/persistence-proof.json), incluyendo UUID exclusivamente sintéticos, filtros, SQL RPC, estado antes/después, source_message_id, replayed y recibos. El arnés ejecuta el bloque real de finalización y la RPC real en PostgreSQL desechable; los errores y la salida del modelo son inyectados explícitamente.

| Recorrido | Escritura/relectura comprobadas | Respuesta |
|---|---|---|
| D11 primer intento | Fallo antes de ejecutar RPC; 0 tickets | Registro no confirmado |
| Segundo mensaje | RPC exitosa, 1 ticket, relectura por los cuatro identificadores | «Ahora sí, hemos registrado…» |
| Reintento mismo mensaje | RPC devuelve replayed=true, mismo ticket y registro idéntico | Sin duplicación ni cambio adicional |
| Petición humana posterior | Aclaración sobre el mismo ticket, nuevo recibo | Petición humana registrada; no afirma notificación |
| Dos fallos consecutivos | 0 tickets en ambos turnos | No confirma en ninguno |
| Commit seguido de pérdida de relectura | 1 ticket en SQL, respuesta no confirmada; siguiente turno lo relee y no escribe | Solo entonces puede indicar pendiente |
| F01 / D07 | Un ticket por conversación, descripción inicial y aclaración persistidas | 2→4 almohadas / 2→3 toallas |

Límite residual observado: en D11 el nuevo ticket se crea con el segundo mensaje («Sigue el mismo problema…»), prioridad normal; el primer aviso de agua, de prioridad alta en el intento fallido, permanece en `messages` pero no se fusiona con la descripción del nuevo ticket. Este ajuste acredita el registro/acuse y no resuelve esa recuperación completa de detalles previos. No se oculta como éxito de naturalidad ni como atención del problema. La simulación de pérdida de relectura conserva el ticket original de prioridad alta. La base desechable no prueba durabilidad frente a caída del host.

## Pruebas y límites

- Regresión acotada `precision-targeted`: seis conversaciones, 18 turnos principales, SQL real local; 0 propiedades fallidas. `precision-recovery`: dos variantes, cuatro turnos; 0 propiedades fallidas. Los informes preservan prompts, salida controlada original, respuesta final, transformación, mensajes, tickets y recibos. 22 generaciones controladas; **0 llamadas de proveedor**.
- PASS: `test:service-precision`, `test:evaluation-budget`, `test:guest-service-receipts`, `test:arrival-turn-context`, `test:arrival-booking-quality`, `test:service-turn-naturalness`, `test:service-evidence-followups`, `test:attention-lifecycle`, `test:operational-requests`, `test:guest-final-output`, `test:guest-service-quality`, `test:ci-guards` y sintaxis. Las salidas 95/193 del test de recibos son replays de evidencia histórica, no generaciones de esta fase.
- La prueba de minimización de tarjeta usaba por error el ticket base de toallas. Se corrigió solo su fixture a factura/cargo; se conserva la misma expectativa exacta y se exige recibo válido. No se desactiva la validación de cantidad para aprobarla.
- Incorporadas a CI: precisión/presupuesto en critical y las dos muestras acotadas en PostgreSQL. No se ha ejecutado GitHub CI ni la batería amplia completa en esta fase. Se han ejecutado localmente las regresiones afectadas.
- Fallo heredado: `test:guest-ai-tenant-isolation` exige una consulta directa `withHotel(supabase.from('ai_logs'))` que ahora se delega; reproducción en `5768682` conservada en el informe anterior. No se modifica, no se declara PASS y no se repite la auditoría general.
- Build final aislado del Dashboard: **PASS**. Sintaxis: **453 archivos PASS**. `git diff --check`: **PASS**. Un reintento del build encontró EINVAL/readlink de OneDrive en `.next/diagnostics/build-diagnostics.json`; únicamente se regeneró la salida ignorada `.next`.

## Comparación y reserva

[Las seis conversaciones completas antes/después](evidence/service-precision/six-before-after.md) reutilizan como antes la evidencia de 01d8f15. La cantidad singular y el acuse incorrecto D11 procedían del código posterior al modelo. La extensión de D02 procedía del compositor de acceso. No se puede atribuir a un modelo real la repetición de esta ejecución con dobles.

D06 (datos contradictorios/ausentes), D09 (estados distintos acreditados) y las gracias F01 se conservan. Los acuses deterministas aún son formularios de respaldo y pueden sonar mecánicos. Cero repeticiones exactas no es una medida suficiente ni una certificación de naturalidad. No se afirma revisión humana de estas nuevas respuestas.

R01–R03 permanecen intactas y **sin ejecutar**, incluso con dobles. El hash canónico está verificado por `test:evaluation-budget`. No hay resultados favorables o desfavorables nuevos de reserva. Si en la comparación real se usan para corregir, perderán independencia para el motor siguiente.

## Acceso y ensayo real

Solo se comprobó el mecanismo autorizado de desarrollo: no existen `provenance.json` ni `openai-key.dpapi`. No se han buscado claves de producción. [Procedimiento seguro](guest-service-development-access.md).

[Plan sustituido y acotado](guest-service-precision-real-plan.md): 27 turnos por versión principal, diferencias representativas de Concierge y borradores Inbox, 88 llamadas esperadas, techo 114; 12.000 entrada + 1.000 salida por intento; máximo 1.482.000 tokens; **0,75 USD propuestos, aún sin autorización**. El control conservador offline está implementado y probado. El transporte real y el conteo completo previo se deben conectar y validar antes de ejecutar; no hay un comando que arranque inadvertidamente el proveedor.

Consumo real: **0 llamadas, 0 tokens, 0 errores de proveedor, 0 USD**. No existe comparación real antes/después nueva. No recomendar publicación por calidad del modelo hasta ejecutarla y revisar las respuestas. Cancelación efectiva y ejecución de varias solicitudes independientes continúan sin implementar; necesitan herramientas/persistencia adicionales. Registrar desistimiento no cancela y cambiar la redacción no implementa varias operaciones.

Se mantienen producción, demo, inventarios, Ubikos, Guest Memory OFF y SEND_AUTOMATIONS=false. Solo datos ficticios locales; no migración remota, envíos, push, PR o despliegue.
