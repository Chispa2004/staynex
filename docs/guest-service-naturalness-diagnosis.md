# Naturalidad: diagnóstico local y acceso pendiente

13 de octubre de 2026. Rama `codex/guest-service-quality-evaluation`. Motor conservado exactamente en `852eeb06f113c69b8e98ee5353113d9407c7ddfa`. El usuario ha confirmado **«Continuar solo el diagnóstico local por ahora»**. Esta fase no contiene una corrección del motor ni una comparación real antes/después.

## Acceso y consumo

No hay una credencial de desarrollo acreditada: variable del proceso ausente, worktree sin credenciales de desarrollo y registro explícito de desarrollo ausente. No se han inspeccionado claves de Railway/Vercel, `.env` de otros trabajos ni secretos de producción. **0 llamadas reales, 0 tokens, ningún error del proveedor observado porque no se ha llamado.**

Se deja el [procedimiento de configuración](guest-service-development-access.md) con almacenamiento DPAPI para el usuario de Windows, fuera de Git y de OneDrive. Se ha ensayado con un valor ficticio, no con una clave real. Su validez se declara localmente; no equivale a autenticar contra OpenAI.

Presupuesto máximo comunicado para una fase real posterior: 360 intentos y 2.400.000 tokens totales, sin reintentos automáticos. Es un límite preparado, **no un transporte implementado ni una evaluación iniciada**. El plan reserva hasta 340 llamadas para las ejecuciones previstas; cualquier consumo debe contabilizarse antes de salir y en la respuesta del proveedor, incluyendo errores y consumo desconocido tras timeout.

## Las 14 repeticiones, con procedencia

Fuente conservada: `docs/evidence/fresh-service/diagnostic-final.json.gz`. Son **14 respuestas de 90**, correspondientes a **7 transiciones distintas reproducidas por dos rutas**; no son 14 conversaciones independientes. Hay 60 pares consecutivos con respuesta: la métrica alternativa es 14/60. No se atribuyen a un modelo real.

| Caso y turno, en ambas rutas | Cantidad | Causa comprobada | Valoración editorial del agente |
| --- | ---: | --- | --- |
| D06.2: confirmar una hora de desayuno contradictoria | 2 | Filtro final → `informationServiceDraft` → `serviceCopy.missing` | Repetir la incertidumbre es pertinente; falta responder expresamente a la confirmación. |
| D06.3: cambiar de desayuno a ubicación del gimnasio | 2 | Mismo filtro de información insuficiente | Problemática: cambia el tema y la respuesta no identifica qué dato falta. |
| D10.2: preguntar cuál de dos necesidades está en curso | 2 | Rama fija `needs_review` del finalizador | Problemática: repite la limitación inicial en vez de contestar al progreso acreditado. |
| D10.3: pedir conservar visibles ambas necesidades | 2 | Misma rama `needs_review` | Problemática: no responde al nuevo propósito. El mensaje conserva ambas, pero no hay dos registros operativos acreditados. |
| D14.2: nueva incidencia de cobro, con segundo ticket distinto | 2 | Alternativa posterior al guardado, `ticketReplyPlan`, mismo asunto `billing_review` | Problemática: SQL sí distingue la nueva petición; el acuse no lo hace. |
| D16.2: preguntar si el horario desconocido de piscina está actualizado | 2 | Filtro de información insuficiente | Misma incertidumbre legítima; la pregunta solicita verificación de vigencia y merece una respuesta directa. |
| D16.3: preguntar si hace falta reservar la piscina | 2 | Mismo filtro, pese a conservar el tema piscina | Problemática: cambia de horario a condiciones de acceso, pero se repite la respuesta genérica. |

Resumen causal exclusivo: **8** por alternativa de información insuficiente introducida por el filtro final, **4** por filtro fijo de limitación de herramienta y **2** por alternativa posterior al guardado. Las 12 primeras nacen del código final, no de la respuesta sustituida. Las dos últimas no miden la composición del proveedor: el evaluador anterior fijaba `composeRecordedGuestReply: async () => null`.

En **0/14** coincide el probe controlado con el del turno anterior; esto demuestra que el código introduce la repetición en estos ejemplos, **no que un modelo real tenga una tasa de repetición cero**. Las salidas reales del modelo están sin medir.

Se consideran **4/14 repeticiones con contenido de incertidumbre justificado** y **10/14 problemáticas**. Es una lectura editorial del agente, no una revisión humana externa. Mantener una respuesta idéntica puede ser correcto ante la misma pregunta y hechos sin cambios: no se establece «cero repeticiones» como objetivo.

## Contexto disponible frente a contexto utilizado

- `informationEvidence` conserva tema y suficiencia de hechos, pero la respuesta alternativa utiliza la misma frase `missing`; no distingue contradicción, vigencia, ubicación u otra condición solicitada. No falta necesariamente historial: se pierde su utilidad al redactar.
- La rama `needs_review` de `finalizeServiceReply` depende del estado de la herramienta y no de la intención del turno. La frase inicial aparece también en consultas de progreso y conservación del mensaje.
- `ticketReplyPlan` reconoce la petición nueva, pero su alternativa inicial se deriva del asunto del ticket; dos tickets de cobro reciben el mismo texto. La evidencia SQL contiene los UUID distintos.
- Inbox genera un borrador antes de ejecutar herramientas. En D06 y D16 comparte la misma frase de información insuficiente. En D10 y D14 puede añadir «Which detail would you like to confirm?» aunque ya hay una intención concreta: es otro punto a observar, no un envío ni una escritura.
- Los datos retenidos no acreditan que la repetición se deba a un timeout del proveedor. Sí acreditan alternativas por información insuficiente, capacidad limitada y la composición posterior al recibo desactivada deliberadamente. No se deben confundir esas causas.

Antes de corregir, la evaluación real deberá capturar el prompt y la respuesta de `composeRecordedGuestReply`, así como las de generación principal y Concierge. De lo contrario, volveríamos a medir la alternativa artificialmente seleccionada. La redacción de Inbox debe conservar su naturaleza determinista y sin efectos; no se contará como una generación real.

## Plan fijado antes de modificar el motor

Archivo: `scripts/fixtures/guest-service-quality/naturalness-evaluation-plan.json`.
SHA-256 de contenido LF: `166b6dc640737cd178158f29352c45bd0ed3ff643daf64e2d849287480b2c7b9`.

Diagnóstico futuro: D06, D07, D08, D09, D10, D11, D14 y D16; se conserva el material original y se definen variantes explícitas para agradecimiento y una consulta de progreso sin novedades. Son 26 turnos. Cubren cantidad, desistimiento, abierto/en curso/hecho, varias necesidades, timeout, persona, contradicción y ausencia de información. No se alteran los fixtures anteriores.

Reservadas **sin ejecutar**: N01–N04, cuatro conversaciones de cuatro turnos. Utilizan exclusivamente los dos hoteles ficticios y sus políticas existentes. Incluyen agradecimiento, confirmación breve, evolución real de estado, comunicación pendiente, cambio de tema, desistimiento parcial y petición de una persona. Si motivan una corrección, deberán declararse utilizadas para diagnóstico y añadirse otras; no se reutilizarán como supuesta validación independiente.

Secuencia pendiente:

1. Configurar y acreditar la clave exclusiva de desarrollo; confirmar su proyecto efectivo sin mostrar secretos.
2. Preparar el transporte real acotado al proveedor de IA, con bloqueo de los demás transportes, presupuesto acumulado, journal de llamadas y ausencia de reintentos ocultos del SDK. No abrir la red del laboratorio de forma general.
3. Conservar la línea base real sobre el motor `852eeb0`, incluyendo los prompts, salidas originales, selección/descartes, respuesta final, borrador y recibos de PostgreSQL desechable. Guardar también errores y resultados desfavorables.
4. Corregir causas según intención y cambios de evidencia, sin variar sinónimos al azar. No afirmar progreso por cortesía. Comparar con la misma base de hechos y situaciones SQL.
5. Ejecutar las cuatro reservadas después de congelar la corrección. Separar métricas de operación y estilo, y ofrecer transcripciones para revisión humana. No afirmar aprobación humana sin recibirla.

## Límites funcionales que no cambia la redacción

**Varias solicitudes:** el contrato actual acredita una solicitud por mensaje. Registrar varias de forma automática requiere una ampliación futura de herramienta/persistencia: identidad por solicitud, recibos por componente, tratamiento de atomicidad o éxito parcial y reintentos que no dupliquen trabajo. Aquí no se diseña ni aplica una migración. Con el contrato actual debe permanecer explícita la revisión humana, sin afirmar que dos tareas quedaron creadas o iniciadas.

**Cancelación:** añadir «ya no hace falta» a la descripción conserva la intención del huésped; no cancela la tarea. Una cancelación efectiva necesitaría operación autorizada sobre el ticket exacto, estados y concurrencia definidos y prueba del resultado. Hasta entonces, ninguna mejora de estilo debe convertir el desistimiento en confirmación de cancelación.

**Entrega y notificación:** «hecho» no acredita que se haya enviado una respuesta ni entregado un objeto. La evaluación reservará una situación de trabajo completado con comunicación pendiente.

## Evidencias y comprobaciones de esta fase

- [Diagnóstico íntegro de las 14 respuestas](evidence/service-naturalness/repetition-diagnosis.json), con probe, respuesta final, borrador y relación entre tickets.
- [Seis conversaciones completas y breves del código actual](evidence/service-naturalness/six-current-conversations.md). Son muestras del ensayo anterior, identificadas como tales; incluyen los defectos residuales. No son una comparación real nueva.
- `node scripts/test-service-repetition-diagnosis.js`: PASS. Recuento reproducible, prueba del finalizador real que caracteriza las repeticiones, distinción entre alternativa y recibo, independencia de casos y coherencia del presupuesto. Es una caracterización temporal de un defecto conocido, no una expectativa permanente para el CI del producto.
- `scripts/test-development-evaluation-setup.ps1`: PASS con valor ficticio; cifrado/descifrado DPAPI, procedencia, rechazo de sobrescritura, proyecto inválido y falta de confirmación antes de escribir; limpieza del directorio temporal propio.
- `test-service-evidence-followups` y `test-guest-service-receipts`: PASS. Las generaciones históricas que imprime el segundo son replays anteriores, no nuevas llamadas.
- Sintaxis de los scripts nuevos y `git diff --check`: comprobados. No se repite el build ni PostgreSQL por cambios exclusivamente de diagnóstico/documentación: el motor y el esquema no cambian y se conservan los resultados de `852eeb0`.

Sin comparación real, no hay una reducción de repetición acreditada ni cierre del objetivo de naturalidad. Motor, demo, datos, permisos y flags intactos. Guest Memory OFF y `SEND_AUTOMATIONS=false`; sin push, PR, despliegue, SQL remoto, mensajes ni consultas a proveedores. El trabajo de Ubikos permanece en su rama y commit anteriores.
