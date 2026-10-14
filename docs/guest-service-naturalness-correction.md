# Respuesta según el último turno: corrección local

13 de octubre de 2026. Rama `codex/guest-service-quality-evaluation`, sobre diagnóstico `9c05eb6`; motor anterior `852eeb06f113c69b8e98ee5353113d9407c7ddfa`. Sin publicación. No se ha utilizado una credencial de producción ni modificado el trabajo de Ubikos.

## Resultado y límites

Hay correcciones de código y una comparación reproducible **con dobles de SDK y PostgreSQL real desechable**. No existe todavía una comparación con IA real: el proceso no tiene `OPENAI_API_KEY` y sigue ausente el registro acreditado de desarrollo. No se han buscado otras claves. Llamadas reales **0**, tokens reales **0**, coste de proveedor de esta ejecución **0**; no hubo solicitudes reales sobre las que medir errores del proveedor.

Las diez repeticiones diagnosticadas que no seguían la intención se corrigen en los ejemplos comprobados. Las cuatro incertidumbres pertinentes se conservan sin inventar confirmación. Esta valoración de pertinencia es del agente, no una revisión humana ni una tasa de calidad del modelo.

**No se cumplen todos los objetivos de estilo:** D02 conserva una respuesta nocturna extensa, advertencias redundantes y una pregunta por la fecha pese a haberse indicado «November 8». Su reconocimiento actual reconoce ISO, pero no esa fecha textual; es un defecto concreto pendiente. No se declara resuelto el criterio completo de no volver a pedir fechas conocidas. También se conserva una repetición pertinente en N03 al volver a pedir confirmación de un dato que continúa sin verificarse. No se fuerza una redacción diferente sin hechos nuevos.

## Causas y cambios

| Componente | Cambio y garantía |
| --- | --- |
| `shared/guest-service/information-evidence.js`, `turn-replies.js`, `quality.js:informationServiceDraft` | La alternativa identifica tema y aspecto: ubicación, horario, reserva o vigencia. Distingue fuentes ausentes de contradictorias y filtra el historial de otros hoteles. No elige una fuente favorable. |
| `arrival-booking.js:guestFacingKnowledgeCandidates` | Reutiliza la exclusión de contenido privado para detectar contradicción, sin convertir sus valores en hechos confirmados. La proyección pública confirmada mantiene su filtro anterior. |
| `ticket-context.js:serviceTurn`, `ticketReplyPlan` | Distingue cierre social, corrección de cantidad, progreso, petición humana, desistimiento y nueva incidencia. La cantidad reconocida solo se acusa después de persistir; una pregunta sobre «las dos» no se guarda como detalle por ese pronombre. Aportar un dato y después preguntar por progreso sigue siendo una aclaración. |
| `quality.js:finalizeServiceReply` | Sustituye la frase única de revisión de varias peticiones por una respuesta a la intención del turno. Un segundo ticket recibe un acuse de petición separada. Añade motivo de transformación e intención al metadato de calidad, sin crear autoridad operativa. |
| `operational-request.service.js:recordOperationalRequest` | Un agradecimiento aislado no reutiliza una propuesta del modelo para escribir o crear un ticket. Mantiene comprobación de ámbito antes de ese retorno. No cambia RPC, idempotencia ni permisos. |
| `operational-request.js:interpretOperationalRequest` | Una pregunta informativa de un tema reconocido no se convierte en ticket por una propuesta errónea del modelo. Reconoce variantes de limpieza para no certificar solo una parte de una solicitud múltiple. |
| `human-escalation.service.js:detectHumanEscalation` | Una petición explícita de una persona se reconoce aunque la confianza del modelo sea baja; reutiliza `human_requested` y el circuito existente. No concede permisos ni afirma que alguien haya recibido un aviso. |
| Inbox, a través de `buildServiceDraft` y `buildConversationCopilot` | Reutiliza la selección y las respuestas compartidas. Sigue siendo determinista y de solo lectura. Antes de guardar una aclaración, el borrador no dice que ya se incorporó; tras releerla, el acuse sí puede confirmarla. |

Las alternativas cambian por intención y evidencia, no por sinónimos aleatorios. Se mantienen los idiomas anteriores; las nuevas distinciones lingüísticas se comprueban en español e inglés, sin prometer comprensión universal de paráfrasis o idiomas.

Se mantienen separados registro, actuación, entrega y comunicación. Una consulta conjunta de finalización y aviso explica ambos: trabajo hecho, envío sin confirmar. La cancelación efectiva y varias solicitudes independientes **no están implementadas**; requieren ampliar herramientas/persistencia en otra fase. Una nota de desistimiento no cancela el ticket. Ningún borrador ejecuta herramientas.

## Comparación local

Los dos hoteles siguen siendo Faro de Arcilla y Juniper Quay, ficticios y con políticas distintas. Se conservan las 16 conversaciones de diagnóstico, los mismos mensajes/probes y estados iniciales vacíos equivalentes en cada ruta. El historial posterior incluye naturalmente la nueva respuesta. Principal y Concierge se ejecutan por separado; Inbox se genera antes de las escrituras y se comprueba que no modifica entradas ni tickets.

| Medida | Antes: `852eeb0` | Después | Tipo de evidencia |
| --- | ---: | ---: | --- |
| Respuestas exactas repetidas frente al turno anterior | 14/90 | 0/90 | Comparación automática; 60 pares elegibles en cada versión |
| Casos problemáticos de los diez señalados | 10/10 | 0/10 | Lectura editorial del agente sobre intenciones y hechos; no revisión humana |
| Incertidumbres pertinentes conservadas | 4/4 | 4/4 | No se elige hora, lugar ni disponibilidad sin evidencia |
| Propiedades operativas fallidas | 0/96 turnos | 0/96 turnos | Handlers y RPC con dobles, SQL real desechable |
| Preguntas redundantes de habitación acreditada | 0/90 | 0/90 | Regresión automática acotada |
| Derivaciones innecesarias identificadas | 0/90 | 0/90 | Lectura editorial; el fallo de guardado conserva la alternativa de recepción para urgencia |
| Respuestas con más de 50 palabras | 2/90 | 2/90 | Señal de extensión, no criterio suficiente de naturalidad |
| Pregunta de fecha redundante en D02 | 2/90 | 2/90 | Residual explícito, una por ruta |

La primera corrección intermedia dio 2/90 repeticiones y también se conserva. No se borran respuestas desfavorables ni se modifica su texto para presentar mejores métricas. El generador posterior al guardado sigue sustituido por `null` en este ensayo: se comprueba su alternativa, no se mide esa generación. Las regresiones históricas con generaciones reales son **replays**, no llamadas nuevas.

### Conversaciones inicialmente reservadas

N01–N04 se ejecutaron después de fijar la primera corrección. El motor anterior tuvo 16 propiedades fallidas en 32 turnos; la primera corrección tuvo 12/32. Los fallos y las omisiones editoriales se conservaron. Tras utilizarlos para corregir, **dejaron de ser independientes**.

| Caso | Hallazgo inicial de la corrección | Resultado final local |
| --- | --- | --- |
| N01, cantidad y agradecimiento | No reconocía la nueva formulación de cantidad ni «¿Habéis empezado?» | Mismo ticket con cantidad 5; agradecimiento sin escritura; progreso abierto sin inventar actuación. 0/8 turnos fallidos. |
| N02, abierto/en curso/hecho | Perdía «Has anything changed now?»; omitía contestar a la pregunta de aviso | Lee el estado persistido y separa hecho de envío. 0/8 fallos; el primer detector no contaba la omisión del aviso, identificada editorialmente. |
| N03, contradicción y cambio de tema | Dos preguntas quedaban en una alternativa genérica aunque no inventaba datos | Responde a confirmación, ubicación y cierre. 0/8 fallos; persiste una repetición justificada por la misma incertidumbre, 2 respuestas contando las rutas. |
| N04, varias necesidades, desistimiento y persona | Reconocía solo una parte y una pregunta se guardaba como detalle | No crea tareas parciales; explica la revisión, sin cancelar ni inventar aviso; reconoce la opción humana. 0/8 fallos. |

F01–F03 se reservaron después, sin ejecutarlos para corregir: nueve turnos en dos rutas, **0 propiedades fallidas/18 turnos**, sin cambios del motor motivados por su resultado. Cubren cantidad/agradecimiento, progreso abierto/en curso y cambio de tema informativo/cierre. Las huellas anteriores a ambas reservas están conservadas. Su tamaño es pequeño y solo hay dobles; falta evaluación real y juicio del usuario.

## Pruebas y conservación de evidencia

- **43 tareas críticas PASS**, incluida la nueva `test:service-turn-naturalness`, recibos, aislamiento, control humano, Inbox, demo, Guest Memory OFF y guardas de automatización. Sintaxis global: 446 archivos; utilidades posteriores comprobadas individualmente.
- **Build de Dashboard PASS** sobre la corrección. Sin cambios visuales.
- **230 turnos SQL finales**: diagnóstico 96, antiguas reservas 48, antigua validación 36, N01–N04 32 y F01–F03 18. Todos sin fallos de las propiedades verificadas. La suite PostgreSQL de CI incluye los nuevos grupos; no se ha ejecutado GitHub CI en esta fase local.
- PostgreSQL nativo 17.10, catálogo temporal, loopback, destrucción al terminar. Un primer intento falló por permisos del sandbox y otro por timeout de `initdb` al sincronizar el catálogo vacío. Se reanudaron solo los grupos pendientes. Se añade `--no-sync` al inicializador desechable, coherente con su `-F` existente: estas pruebas acreditan transacciones y relectura, **no durabilidad ante caída del sistema**. No cambia el arranque de la aplicación.
- El primer CI encontró un bloqueo de loopback del sandbox. En la segunda pasada se detectó una regresión propia en un mensaje mixto de factura y progreso: corregida sin debilitar su expectativa. La pasada final completa pasa. HTTP Security se comprobó con LF como GitHub; los bytes CRLF originales de `dashboard/lib/demo.js` se restauraron exactamente. No se modifica ese archivo.
- Prueba de progreso repetido sin novedades: se permite una respuesta idéntica cuando los hechos siguen iguales, sin nuevas escrituras ni progreso inventado.
- `git diff --check`: PASS antes del commit. No hay migración nueva.

Evidencias versionadas en `docs/evidence/service-naturalness-correction`: [comparación por respuesta](evidence/service-naturalness-correction/diagnostic-comparison.json), [seis conversaciones completas](evidence/service-naturalness-correction/six-before-after.md), [resultados de checks y huellas](evidence/service-naturalness-correction/checks.json), JSON comprimidos de las ejecuciones finales, iniciales desfavorables y reserva anterior ejecutada sobre una copia de `852eeb0`. Cada captura retiene prompts, salida original **sustituida**, respuesta final, borrador, estado de tickets, recibos SQL, efectos y errores. El motivo de transformación se conserva en la comparación; las etiquetas anteriores genéricas se reclasifican como guardas cuando cambia el texto. Los logs de comandos permanecen también en la caché local ignorada, sin inventarios ni credenciales en el commit.

## Evaluación real pendiente y siguiente paso

No se ha llamado al proveedor ni construido un transporte real que sustituya el aislamiento de pruebas. Antes de hacerlo hay que conservar la línea base **real** de `852eeb0` desde su fuente intacta, usar el mismo modelo/configuración del producto y capturar también la composición posterior al guardado. Esta corrección local no se utilizará como si fuese aquella línea base.

El propietario puede ejecutar desde PowerShell normal el script descrito en [acceso de desarrollo](guest-service-development-access.md):

```powershell
& 'C:\Users\chimi\OneDrive\Documentos\New project\.npm-cache\guest-service-quality-evaluation\worktree\scripts\configure-development-evaluation.ps1' -ConfirmDevelopment
```

Debe usar una clave **nueva de un proyecto de desarrollo**, introducirla solo en el campo oculto y no pegarla en el chat. Se cifra para su usuario mediante DPAPI fuera de Git y OneDrive. La declaración de procedencia no equivale a una autenticación ya comprobada.

Se conserva el tope comunicado de **360 intentos y 2.400.000 tokens**, sin reintentos automáticos. El plan original de reserva queda como documento histórico: N01–N04 ya son diagnóstico. Una ejecución real acotada puede usar los 26 turnos diagnósticos preparados en ambas versiones (hasta 260 intentos entre rutas y composición) y los nueve turnos F solo tras fijar la corrección real (hasta 45): 305 como máximo planificado, dentro del tope. Si nuevos resultados obligan a cambiar el motor, habrá que reservar casos adicionales y ajustar la muestra sin superar ese tope. Registrar también errores, latencia, uso desconocido tras timeout y coste cuando el proveedor lo permita; no afirmar aprobación humana mediante puntuación automática.

Falta revisión humana de naturalidad, evaluación con IA real, el residual D02 y el soporte funcional separado de cancelación/múltiples tareas. No se declara cerrada la calidad general de Staynex. Producción, demo, datos, permisos, Guest Memory OFF, `SEND_AUTOMATIONS=false` y demás configuración desplegada permanecen intactos. Sin push, PR, merge, despliegue, SQL remoto, envíos ni conexión a Ubikos.

Continuación local desde `5768682`: [corrección de llegada nocturna y respuestas completas](guest-service-arrival-correction.md). Este informe se conserva como evidencia anterior, incluidos sus resultados desfavorables.
