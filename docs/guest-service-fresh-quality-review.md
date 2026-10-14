# Atención de IA: corrección y evaluación local nueva

13 de octubre de 2026. Rama `codex/guest-service-quality-evaluation`, creada desde `origin/main` actualizado: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`. El commit `af4ede27ce405384d8bf782af49f6e0b3cd98393` fijó los 24 casos y la separación 16/8 antes de modificar el motor. Entrega local; no se publica esta rama.

## Resultado y límites

Se corrigen pérdida de cambios de cantidad, desistimientos que no quedaban vinculados al ticket, confirmaciones sin evidencia, pérdida de contexto informativo y acuses de éxito parcial para varias necesidades. Se conserva la lectura del estado real del ticket y la separación entre registrar, atender, terminar y comunicar. No hay cambios visuales, SQL nuevo ni cambios de permisos.

La evaluación final pasa las propiedades comprobadas de 30 conversaciones sintéticas: 16 de diagnóstico, 8 inicialmente reservadas y 6 nuevas. Las ocho iniciales **descubrieron fallos y dejaron de ser independientes** para las correcciones posteriores. No se presenta su segundo resultado como validación independiente. Las seis nuevas se ejecutaron con el motor congelado; sus huellas constan en `evidence/fresh-service/engine-validation-sha256.json`.

**No queda acreditada la naturalidad de un modelo real.** No había una credencial de desarrollo con procedencia acreditada; no se leyó ni copió ninguna clave desplegada. Presupuesto y consumo real: **0 llamadas, 0 tokens**. Los probes deliberadamente incorrectos son salidas de un doble y no tasas de error del proveedor. La ejecución final realizó 261 llamadas al doble (135 diagnóstico, 72 H, 54 R); la línea base, 135. Las pruebas históricas vuelven a leer generaciones antiguas, no son generaciones nuevas.

## Recorridos y causas

| Recorrido / archivo | Hallazgo y corrección |
| --- | --- |
| `src/services/openai.service.js`, `src/prompts/staynex.prompt.js` | Generación principal y composición posterior al commit. El prompt recibe Knowledge de huésped, activo y del hotel, también fuera del caso de llegada/reserva. Se aclara la diferencia entre cambio de detalles y ejecución. |
| `src/services/openai-concierge.service.js` | Concierge recibe la misma proyección de hechos, sin información interna, inactiva o contradictoria seleccionada arbitrariamente. Se verifica su salida procesada y la final, no solo el prompt. |
| `src/services/knowledge.service.js:searchKnowledge`, `shared/guest-service/information-evidence.js` | La búsqueda elegía la primera respuesta de un tema contradictorio. Ahora esos hechos se excluyen; las preguntas breves conservan un tema informativo acotado y no convierten una hora de desayuno en llegada nocturna. La ausencia de datos se reconoce, no se rellena. |
| `shared/guest-service/ticket-context.js`, `src/services/operational-request.service.js:recordOperationalRequest` | Cambios de cantidad, desistimientos y petición de ayuda humana se relacionan con un único ticket del mismo hotel, huésped y conversación. Se exige el ticket exacto y lectura posterior al guardado. Varios candidatos siguen siendo ambiguos. La ayuda humana no abre otro ticket redundante cuando puede añadirse a la solicitud existente. |
| `shared/guest-service/operational-request.js` | Se comparte la detección de petición nueva; las necesidades independientes se distinguen de varias descripciones de una misma avería. La RPC existente solo permite una solicitud por mensaje: se evita confirmar que dos necesidades quedaron registradas por separado. |
| `shared/guest-service/quality.js:finalizeServiceReply` | La respuesta final usa el resultado real de la herramienta. Una capacidad ausente, un fallo o un estado propuesto no acreditan registro. También se controlan afirmaciones pasivas de registro, reserva y disponibilidad. |
| `shared/guest-service/receipt-reply.js` | Un ticket abierto no acredita cancelación; uno completado tampoco acredita entrega o comunicación. Se mantiene la composición contextual y su alternativa segura cuando falla o inventa resultados. |
| `dashboard/lib/ai-copilot.js:buildConversationCopilot` | Reutiliza los hechos y planes compartidos. Se comprueba que generar el borrador no altera entradas, tickets ni estado SQL. Sigue marcado como borrador; no se envía. |
| `src/services/staynex.service.js` | La secuencia existente registra, lee, compone, finaliza y persiste la respuesta. La evaluación ejecuta ese tramo real. Los envíos y otros recorridos de experiencias quedan fuera de ese tramo y se cubren con regresiones de aislamiento existentes; no se confunde este ensayo con una ejecución integral en producción. |

El contexto operativo continúa exigiendo relaciones acreditadas; no se añade una búsqueda por nombre o teléfono ni se incorpora el trabajo pendiente de Ubikos. Las regresiones existentes de `resolveOperationalContext` cubren habitación ausente, cambiada, contradictoria, relaciones ambiguas y fases pre/post. Los nuevos casos aportan contextos sintéticos explícitos: no prueban un PMS real ni un nuevo importador.

## Persistencia y efectos

Docker Desktop no pudo arrancar. Se utilizó PostgreSQL **17.10 nativo y desechable**, escuchando solo en loopback con puerto aleatorio, datos temporales y parada/eliminación al terminar. Binaries públicos de prueba: `@embedded-postgres/windows-x64@17.10.0-beta.17`; cliente local `pg@8.16.3`, ambos en caché ignorada. No se añadió esa dependencia al runtime de la aplicación. No se usó PGlite para acreditar estas pruebas.

Se aplicaron únicamente en esas bases las migraciones **ya existentes** `add_operational_request_receipts.sql` y `guard_operational_request_clarification.sql`. La ejecución final conserva 34 tickets sintéticos entre las dos rutas (18 D, 10 H, 6 R), con 58 llamadas RPC (32/18/8), incluido timeout simulado. Los UUID, estados, descripciones y recibos antes/después están en los JSON completos. Las dos rutas tienen conversaciones SQL separadas; esos tickets no representan 34 conversaciones independientes.

La generación usa un SDK doble. Cualquier generación no prevista falla; HTTP externo está bloqueado por `scripts/ci/isolate.cjs` y por el transportador del ensayo. Los 180 borradores no ejecutan escrituras. No se ejecutan WhatsApp, email, experiencias ni PMS reales. Los checks de demo/transportes/control humano existentes complementan esta prueba. `SEND_AUTOMATIONS=false` y Guest Memory OFF son constantes de prueba, **no la única barrera de aislamiento**.

## Comparación con denominadores

16 conversaciones de diagnóstico × 3 turnos × 2 rutas = 96 turnos de ruta; 90 respuestas y 6 turnos bloqueados por control humano. No son 32 conversaciones distintas.

| Propiedad del diagnóstico | Antes | Después |
| --- | ---: | ---: |
| Turnos de ruta con alguna propiedad fallida | 22/96 | 0/96 |
| Conversaciones con alguna propiedad fallida | 6/16 | 0/16 |
| Pérdida de detalle o ticket incorrecto en aclaraciones | 2/8 | 0/8 |
| Desistimiento perdido o cierre indebido | 2/2 | 0/2 |
| Afirmaciones de cancelación sin evidencia | 4/4 | 0/4 |
| Confirmación parcial / gestión incorrecta de dos necesidades | 6/6 | 0/6 |
| Afirmaciones de envío sin evidencia en la consulta de entrega | 2/2 | 0/2 |
| Información no acreditada detectada automáticamente | 8/12 | 0/12 |
| Control humano vulnerado | 0/6 | 0/6 |
| Borradores con efectos | 0/96 | 0/96 |
| Knowledge ajeno en prompts / respuestas | 0/96 | 0/96 |

La lectura editorial de los turnos informativos distingue **7/7 consultas con hechos disponibles** respondidas directamente en ambos estados, de **6 consultas sin hechos suficientes**: reconocer que falta información no significa resolverlas. La línea base también pierde contexto en D06.2 y reafirma información no acreditada en D16.2, aunque el detector de palabras no las contaba. Ambas quedan corregidas. Los otros cinco turnos informativos de diagnóstico tratan disponibilidad/reserva y sus límites; no prueban inventario real.

No se detectan preguntas de habitación ya acreditada en los 96 turnos; las preguntas cuando falta habitación son pertinentes. La única derivación explícita de diagnóstico a recepción para atención inmediata ocurre en D11.1, tras timeout: es justificada (1/48 turnos por ruta). No se cuenta la palabra «recepción» en una política horaria como derivación. El equipo sigue siendo necesario para cancelación, varias necesidades y datos ausentes.

Tickets redundantes al pedir una persona en D11: 2/2 rutas antes, 0/2 después; la petición se añade al ticket existente. H06 repite una solicitud y conserva el mismo ticket en 2/2 rutas. D14 distingue una incidencia nueva parecida a la anterior en 2/2 rutas y no elige arbitrariamente entre ambas al preguntar por su progreso. No se presenta toda reducción del número de tickets como eliminación de duplicados: D10 pasa a revisión manual explícita.

H inicial: 8 conversaciones, 48 turnos; 12 propiedades fallidas entre confirmación de disponibilidad, envío, persistencia urgente y capacidad ausente. Se conservan en `holdout-first-failed.json.gz`. Tras corrección: 0/48. R: 6 conversaciones nuevas, 36 turnos, 0 fallos operativos observados. La primera ejecución R tuvo **2 falsos positivos del evaluador** por una negación de garantía; se conservan, se corrige solo esa aserción y se añaden comprobaciones positiva, negativa y mixta. Al recalcularla sobre las 10 salidas pertinentes de la línea base, no cambia ningún resultado.

### Estilo: sigue habiendo trabajo

La lectura editorial del agente y las transcripciones no sustituyen una revisión humana ni un ensayo real. En diagnóstico, repeticiones exactas del turno anterior: **2/90 → 14/90**; respuestas de más de 50 palabras: **4/90 → 2/90**; máximo **85 palabras** en ambos. Media **12,2 → 12,1** palabras. Las negativas seguras y la revisión manual repiten fórmulas; D02 sigue siendo largo y redundante. No se declara mejoría general de naturalidad. Una respuesta breve incorrecta de la línea base tampoco es una mejora de estilo válida.

Se entregan [seis conversaciones completas con antes/después](evidence/fresh-service/six-conversations.md), incluida D02 como residual, y [las 30 conversaciones finales por ambas rutas](evidence/fresh-service/all-final-conversations.md). Los JSON comprimidos conservan prompts, probes, respuestas procesadas, borradores, SQL y efectos; el manifiesto contiene sus huellas. No se ha escogido solo el mejor resultado.

## Verificación y publicación futura

- Nueva regresión de comportamiento `test:service-evidence-followups`, incorporada al runner crítico.
- `test:fresh-service-postgres`, incorporada al runner PostgreSQL: D/H/R, 180 turnos, PostgreSQL real, PASS. El runner de CI usa el contenedor local `postgres:17.10` sin red; aquí se acreditó el mismo SQL con el runtime nativo descrito. No se ha ejecutado GitHub CI ni se afirma haber ensayado su contenedor en este equipo.
- No se ejecutó localmente el job completo `ci:postgres` de las otras áreas porque requiere Docker; se ejecutó la nueva regresión SQL afectada. El runner crítico completo sí pasó sus 42 comandos, usando LF para la comprobación histórica indicada abajo.
- Regresiones existentes de recibos, calidad, llegada/reserva, aislamiento de Knowledge y tenants, Inbox, control humano, demo, Guest Memory OFF y automatizaciones: ejecutadas. Las cifras de generaciones históricas que imprimen son replays anteriores, no llamadas nuevas.
- Build final de Dashboard: PASS. Se corrigió un error de codificación UTF-8 propio de la edición local; se conservan las salidas desfavorables de evaluación previas.
- HTTP Security: falla en el checkout CRLF en su comprobación textual histórica de `dashboard/lib/demo.js`; PASS usando LF como GitHub/Linux, sin cambiar expectativas. Se restauran exactamente los bytes del archivo y no se incluye en el diff. El sandbox también bloqueó inicialmente la conexión a su servidor local y la escritura de `.next`; la repetición autorizada mantuvo los transportes externos bloqueados.
- Sintaxis y `git diff --check`: verificados. El detalle final de comandos y resultados se guarda en `evidence/fresh-service/checks.json`.

No se propone una migración nueva. Una publicación posterior necesita revisión del diff y CI del SHA que se publique. Antes de conectar el hotel real falta evaluación con credencial de desarrollo autorizada, presupuesto previamente fijado, revisión humana de naturalidad y validación de su Knowledge/capacidades. No hay un fallo operativo crítico observado pendiente en estos casos finales; los controles son acotados y no garantizan entender toda paráfrasis o idioma. La cancelación automática, las múltiples solicitudes en una RPC y el envío de una comunicación siguen sin ser capacidades acreditadas por este cambio.

Producción, demo, datos, permisos y configuración permanecen intactos. No se hizo push, PR, merge, despliegue, limpieza, SQL remoto ni conexión a Ubikos. `codex/pms-read-context-foundation` sigue en `bf1492ec5b704f55de8064eed1998388380dfaac` sin cambios; los inventarios y trabajos del checkout principal se conservan fuera del commit.
