# PMS 1.24 — diagnóstico privado de lectura manual

## Evidencia anterior y alcance

Base publicada: `142ecec575aafdfc47360707dc0b6698bee845b5`.
El registro reducido conservado de PMS 1.23 acredita un POST al Dashboard el
20/10/2026 a las 18:35:33.080 Europe/Madrid (16:35:33.080Z), con HTTP 503.
No acredita HTTP, duración, recepción de la petición ni causa en Ubikos.
La consulta de runtime logs disponible, limitada al requestId y ventana de esa
ejecución, terminó con cero registros. Eso no prueba ausencia de transporte.
Los metadatos conservados acreditan la retirada del deployment habilitado
`dpl_6PJuFhksbn8vkG1w2aAxBVNt8uiz` y el retorno API 404 tras retirarlo.
No se reconstruye el resultado del proveedor ni se repite la consulta.

Production conserva `dpl_8FrFUznjAxjYxmPdupTAHjQbUgD8`, SHA142ecec,
con lectura deshabilitada. Hotel y vínculo10318 ya existen: no recrearlos.
Railway conserva `407f5c24-c260-4c1d-add6-9d7df095073a`.
Los UUID de hotel/conexión y las evidencias privadas permanecen fuera de Git.

## Pérdida localizada

1. `bounded-json-read.js / readUbikosJson` calculaba HTTP, duración, código seguro
   y clasificación limitada del error en memoria.
2. `observation-reader.js / createUbikosObservationReader.read` sustituía cualquier
   resultado negativo por una excepción `READ_FAILED`, descartando esos datos.
   El rechazo de la proyección descartaba también el HTTP200 precedente.
3. `ubikos-observations-server.js / createUbikosObservationHandler` devolvía
   `{ok:false,code}` con HTTP503/502 sin correlación ni registro del diagnóstico.
   El navegador solo podía mostrar la explicación genérica.

Esto explica la falta de diagnóstico, no el fallo real de aquella lectura.

## Corrección

El transporte añade evidencia de etapa, inicio de invocación de fetch y recepción
de respuesta. Inicio de transporte NO significa recepción por el proveedor.
JSON inválido se distingue de contenido incompatible, exceso de tamaño,
red/TLS, timeout, cancelación, redirección rechazada y HTTP no satisfactorio.
No se inspeccionan mensajes crudos de excepción para inferir causas de red/TLS.

El adaptador conserva solo campos permitidos en un WeakMap privado asociado a la
excepción. No adjunta payloads ni acepta una propiedad `diagnostic` de una
excepción arbitraria como evidencia. El handler genera un UUIDv4 nuevo, ajeno a
cabeceras del solicitante, y emite `staynex_ubikos_manual_read_failure_v1`:

| Campo privado | Significado |
| --- | --- |
| diagnosticId | Correlación generada por Staynex |
| startedAtUtc, durationMs | Inicio y duración de la petición al handler |
| failureStage | autorización, vínculo, solicitud, configuración, transporte, HTTP, cuerpo, JSON, proyección o lector desconocido |
| transportStarted | fetch invocado: true/false; null si el lector falla sin evidencia |
| httpResponseReceived | Respuesta del proveedor observada: true/false/null |
| providerHttp | HTTP observado del proveedor; null sin evidencia |
| providerDurationMs | Duración medida por el transporte; null sin evidencia |
| dashboardHttp | HTTP que devuelve el handler, separado del proveedor |
| technicalCode | Código permitido, nunca el mensaje de excepción |
| providerReportedCategory | Clasificación limitada de tokens JSON reconocidos, no una causa validada independientemente |

La interfaz mantiene la explicación traducida y muestra solo `diagnosticId`.
No expone el objeto técnico privado. Referencias malformadas se omiten.
Un fallo del logger no cambia la respuesta ni provoca reintentos. Un fallo de red
del navegador sin respuesta del handler no puede mostrar una referencia recibida.
Los logs siguen sujetos a la retención del plan: recoger el evento reducido
inmediatamente tras una futura prueba, sin exportar registros ajenos.

Sin cambios de permisos, vinculación, destino, autenticación, límites10s/256KiB,
redirecciones, reintentos ni importación. No se activan lecturas al cargar.

## Validación sintética

`npm run test:ubikos-dashboard`: 42 pruebas, incluidas 19 nuevas de diagnóstico.
Comprueban 400/401/403/429/500, red/TLS, timeout anterior y posterior a HTTP200,
JSON inválido, HTML, límite de tamaño, rechazo de proyección y secreto reflejado.
Además: configuración incompleta, denegaciones/otro hotel, cancelación anterior a
fetch, excepción desconocida, fallo del logger, correlación independiente,
sin reintentos y éxito vacío como observación parcial. Logs y respuesta se
comprueban por lista exacta de campos y ausencia de secretos/PII sintéticos.

`test:ubikos-diagnostic-browser`: shell existente, UI real y handler real con
transporte ficticio; ES, claro/oscuro,1366/390, activación con teclado, referencia
igual al log privado, detalles ocultos, sin consultas automáticas y recuperación
manual sintética. No utiliza ni modifica hoteles remotos.
Resultado local: las cuatro combinaciones pasan. El primer ensayo detectó un
UUID incoherente en el fixture nuevo (la autorización lo rechazó correctamente);
se corrigió el fixture, sin cambiar controles ni permisos del producto.

Build completo Dashboard y 11 grupos de observabilidad construida, sintaxis y
diff-check. Los primeros builds locales fueron bloqueados por EPERM del sandbox
sobre .next/junction; se repitieron con el mismo aislamiento de transportes.
HTTP Security mantiene su discrepancia local CRLF/LF ya documentada; sus
expectativas no cambian y se conserva el check Linux en CI.

## Publicación propuesta, NO ejecutada en PMS1.24

1. Revisar SHA final de PR58, CI y Preview. PR en borrador, sin auto-merge.
   Preview no tiene las variables UBIKOS de Production; no consultar datos reales.
2. Bajo autorización posterior, publicar exclusivamente el Dashboard del SHA
   revisado, con ENABLED=false, mediante staged/inspect/promote. Conservar el
   deployment público anterior y comprobar destino servidor/versiones.
   No merge que dispare Railway.
3. Reutilizar hotel/conexión y secreto existentes, verificar los UUID guardados
   sin mostrarlos públicamente. No crear otro workspace ni cambiar el contrato.
4. Solo con autorización de otra prueba: habilitar exclusivamente el mismo
   vínculo, desplegar mismo SHA, UNA lectura manual Alojados, recoger referencia
   y evento privado reducido inmediatamente. No inferir causa de un503/403.
5. Ante fallo: ENABLED=false, artefacto deshabilitado público y retirada de todos
   los deployments habilitados por esa intervención, sin borrar hotel/conexión.

Ninguna consulta Ubikos, escritura remota de datos, secreto, configuración,
publicación, merge, mensaje, IA o gasto en esta fase. El push solo actualiza PR/CI
y Preview; la reconciliación con main sigue esperando el relevo autorizado.
