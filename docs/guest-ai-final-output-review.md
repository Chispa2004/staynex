# Cierre acotado de calidad de salida y Asistencia IA

Base comprobada: `origin/main` `25d1f7a52e09ed3984041467ff1e0a2404784fe3`. Rama: `codex/guest-ai-final-output-review`. Sin cambios de esquema, configuración, permisos o datos remotos. Organizaciones y demás auditorías quedan fuera.

## Evidencia completa y resultado

Se leyeron los informes `guest-ai-service-quality-review`, `guest-ai-arrival-booking-quality-review` (incluido su cierre local conservado) y la comparación previa. Se revisaron las 92 generaciones guardadas: 80 principales y 12 Concierge sobre 36 casos/dos hoteles ficticios. No se han repetido llamadas al proveedor ni modificado las generaciones originales; las 64 anteriores permanecen como referencia.

[Tabla completa, texto original, salida y estado por generación](guest-ai-final-output-comparison.md). [Captura reproducible del transporte](evidence/guest-final-output-replay.json). [36 borradores Inbox](evidence/guest-final-inbox-drafts.json).

| Resultado de la reproducción acotada | Generaciones |
| --- | ---: |
| Error corregido antes de la salida final | 69 |
| Error que permanece en la salida final | 0 |
| Problema de claridad o idioma residual | 4 |
| Evidencia insuficiente del recorrido original bajo control humano | 2 |
| Sin incidencia identificada | 17 |

Estos recuentos no significan 69 correcciones nuevas. La mayoría de las protecciones ya estaba publicada. Tampoco significan 92 envíos: son capturas locales con transporte y persistencia sintéticos. El contexto intermedio original de Concierge no se guardó; se identifica su pareja principal y se prueban además los 12 candidatos seleccionándolos con confianza principal baja. Los dos ejemplos humanos solo se fuerzan como sondas de la frontera; una prueba separada ejecuta el retorno temprano real que impide generar/enviar bajo control humano.

Inbox: 36 borradores deterministas, 35 sin otro defecto concreto observado y uno con claridad residual. No se atribuyen estos borradores ni las plantillas de presentación al modelo.

## Defectos que alcanzaban la salida y ajuste

1. Tras guardar `a-invoice`, el acuse conservaba «¿Desea que prepare un ticket…?». Se filtran las preguntas de creación de la misma solicitud únicamente después de acreditar el ticket por hotel, huésped y conversación. Se mantienen preguntas esenciales, como la edad ausente.
2. Con la capacidad de registro deshabilitada, las salidas conservadas de `b-lost`, `b-invoice` y `a-towels` atravesaban la guarda con «I'll inform…», «I will create…» y «hemos solicitado…». Se reprodujo contra el finalizador de la base y el actual usando el mismo transporte de prueba. Se amplía la familia de compromisos conocida, sin excepciones por caso/hotel. El texto final no certifica registro ni acción; un fallo de persistencia bloquea el envío.
3. El fallback duplicado de `InboxAiCopilotPanel` prometía pedir una revisión y contestar pronto, siempre en español. Se elimina y reutiliza `buildConversationCopilot`, que conserva idioma original, contexto, borrador y control humano.
4. `Calm`, acciones y explicaciones se localizan mediante `tx`/diccionario existente. También se traducen las etiquetas fijas y prefijos del resumen. Se conserva el contenido citado del huésped, el texto del borrador, los valores internos y las acciones de oferta. El botón de cerrar tiene nombre accesible. No se ha añadido envío ni cambio de estado.
5. Se sustituye «condiciones verificadas» / «canal autorizado» en la presentación ES/EN por límites comprensibles. Se mantienen condiciones de promoción, ausencia de inventario y necesidad de confirmación.

## Pruebas y límites

- `test:guest-final-output`: 9 grupos de comportamiento en Critical CI. Captura 92 fronteras finales reales, orden ticket/mensaje/transporte, tres sondas sin capacidad, fracaso/reintento y recibo de otro hotel; 12 Concierge seleccionados; 36 Inbox; panel real compilado/renderizado en ES/EN con y sin copilot precargado; Guest Memory OFF; retorno temprano real bajo control humano.
- Las capturas ejecutan los bloques de producción de `staynex.service.js` y `ticket.service.js`; no simulan la cadena completa de analítica ni los recorridos independientes de proveedores. No se ha afirmado lo contrario.
- `test:guest-service-quality`: 15 grupos PASS; `test:arrival-booking-quality`: 16 grupos PASS. Suite Critical ejecutada hasta `http-security`; ese único bloqueo local corresponde al assert estático heredado sensible a CRLF de `dashboard/lib/demo.js`. Repetido únicamente ese test con LF temporal y restauración exacta de los bytes: PASS. Ninguna relajación del control.
- La antigua comprobación estática Guest Memory esperaba el fallback eliminado. Se sustituye por comportamiento OFF/ON del constructor y render del componente real; OFF no muestra la memoria sintética. No se cambia la política.
- Fallo adicional heredado `test:guest-ai-tenant-isolation`: sigue FALLANDO en el assert estático de `withHotel(supabase.from('ai_logs'))`; documentado/reproducido en la base en la revisión anterior. No se presenta como PASS ni se modifica.
- Sintaxis y build de Dashboard PASS; `git diff --check` PASS.
- Navegador local: componente real en laboratorio independiente sin autenticación/servicios remotos, 1366×1000 y 390×844, tema claro. UI ES con huésped EN y UI EN con huésped ES; no desbordamiento horizontal, cierre y reapertura por teclado; control humano conservado. El render de regresión incluye una traducción de lectura ES y comprueba que el borrador EN no cambia. No se llama al traductor/proveedor de producción para fabricar esta prueba. Solo ES/EN revisados.

Persisten cuatro generaciones con claridad mejorable: dos `a-cot` dicen «para confirmar» al pedir edad, sin acreditar disponibilidad; dos `booking-contradiction-b` citan una instrucción interna mezclada con la política de Knowledge. Ese último caso también aparece en un borrador Inbox. Se registran expresamente; no se aplica una excepción por frase ni se inventa un contrato editorial. Las expresiones regulares siguen siendo una guarda acotada, no una prueba semántica universal.

## Conservación y publicación

Antes del ajuste se comprobó por lectura la demo: 42 mensajes, 15 conversaciones con mensajes. Inventario privado de 11 tablas fuera de Git. Sin modificaciones de mensajes, seis respuestas de presentación, reservas, tickets, invitados o flags.

Publicación autorizada mediante PR y merge normal tras CI y revisión. No requiere migración ni variables. Vercel/Railway por el mecanismo habitual; comprobar SHA activo, salud, `SEND_AUTOMATIONS=false`, Guest Memory OFF y comparar el inventario posterior. Comprobar panel público autenticado ES/EN y móvil sin enviar, tomar control ni preparar ofertas.

Estado al preparar la PR: validación pública y versiones finales pendientes; no se confunden con el laboratorio. El cierre de publicación se añadirá con los identificadores observados.
