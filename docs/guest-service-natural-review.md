# Atención natural con solicitudes acreditadas

Base: main `1e5900a6ade7f32a851d3b1ffcbc3e9831c43923`. Rama `codex/guest-service-natural-demo`.

## Causa y cambio

El finalizador reemplazaba toda respuesta con ticket por el mismo acuse y «La actuación todavía no está confirmada». Mejorar el prompt no podía llegar al huésped. Ahora una generación breve posterior al RPC y a la lectura del ticket utiliza exclusivamente ese recibo, el contexto autorizado y Knowledge. El finalizador comprueba de nuevo hotel, huésped, conversación, mensaje y estado. Si falla el proveedor o hay afirmaciones no acreditadas, conserva un acuse seguro. No existe nueva migración ni nuevo permiso.

Se diferencian petición registrada, en curso y completada; cerrado/cancelado no equivale a completado. Se retiran afirmaciones de aviso, despacho, inmediatez, reserva, factura emitida u objeto encontrado sin evidencia. El filtro es conservador para patrones ES/EN, no una prueba semántica universal; otros idiomas conservan fallback localizado. Se añade una llamada de IA a solicitudes registradas; puede incrementar coste y latencia (timeout existente), sin repetir escrituras ni envíos.

El clasificador conserva claves por cuna, factura, traslado y nueva estancia y reutiliza el ticket abierto en seguimientos explícitos. No abre traslado/reserva solo por mencionar el tema. Se corrige la confusión entre reserva de alojamiento y traslado cuando la política del hotel niega ese servicio. Llegada nocturna distingue entrada al edificio y habitación; el seguimiento no repite toda la política. Los borradores siguen siendo propuestas sin ejecutar acciones y el control humano conserva su pausa.

## Evaluación y límites

95 generaciones reales de gpt-4.1-mini: 36 principales, 36 Concierge, 23 posteriores a tickets persistidos en PostgreSQL desechable. 18 casos (nueve por hotel), dos turnos. 12 tickets, seguimientos reutilizados y una petición independiente nueva. Se conservan todas las salidas, incluidas las desfavorables, en la fixture sintética `natural-evaluation.json`. No hubo errores HTTP del proveedor. 19 de los 23 acuses se recortaron, sustituyeron o ajustaron por preguntas redundantes: el modelo sigue produciendo promesas sin fundamento. No se afirma que esté libre de errores.

Comparación completa: [guest-service-natural-evaluation.md](guest-service-natural-evaluation.md). El «antes» es el finalizador publicado aplicado a la misma generación y evidencia, no otra respuesta seleccionada. Persisten límites de estilo: el fallback de ofertas complejas conserva condiciones completas, puede exceder tres frases y cita el idioma original de Knowledge. Una ausencia de nombre acreditado puede provocar una pregunta de identificación; no se solicitan datos fiscales completos. Los ensayos no son una prueba exhaustiva multilingüe.

## Pruebas

- Regresión nueva: nueve grupos, incluidos 95 outputs reales y captura de la respuesta final almacenada/transportada por el bloque real, con transporte simulado.
- Calidad: 15 grupos; llegada/reservas: 16; replay anterior: 92 outputs; operación: cinco grupos.
- PostgreSQL: diez grupos (concurrencia, aislamiento, replay, recuperación, fuentes/estancias y borradores). 36 turnos nuevos adicionales reproducidos con RPC real en dos bases desechables consecutivas, restaurando recibos entre turnos.
- Navegador: accesibilidad 17, estabilidad Inbox cinco, Dashboard nueve, en escritorio/móvil y ambos temas; teclado, filtros, últimas cinco entradas, selección y recuperación.
- Build de Dashboard PASS; sintaxis y diff comprobados. CI crítico incorporará la nueva regresión; CI PostgreSQL conserva la suite operativa.
- El primer intento de navegador falló por ruta local de Chromium; se repitió con el binario instalado. HTTP Security tiene una comparación literal sensible a CRLF; se normalizó solo la copia local de `dashboard/lib/demo.js` a LF sin cambiar contenido ni expectativas, como el checkout Linux de CI.

## Sustitución de demo preparada

Hotel comprobado por ID y slug. Respaldo privado de 33 relaciones, 20 conversaciones y 42 mensajes. Quince conversaciones pobladas llevan marcadores sintéticos y cinco vacías corresponden a identidades del seed demo; se conservan tickets y reservas. La transición cierra las anteriores, no elimina sus filas ni sus mensajes. El directorio y métricas de esta demo omiten conversaciones cerradas; enlaces explícitos de tickets siguen leyendo su conversación original con autorización del hotel. No afecta al directorio de otros hoteles.

Nueve conversaciones nuevas usarán identidades sintéticas protegidas, y las respuestas con acuse deberán acreditarse contra los tickets realmente persistidos en la demo antes de guardarlas. No se escriben respuestas finales manuales. Las fechas de escenario se identifican separadamente de la fecha de generación para preservar las reservas históricas existentes; no se convierte una habitación histórica en actual. No se borran tickets, reservas, seguimientos ni deduplicadores antiguos.

## Publicación y recuperación

Publicar rama/PR, comprobar los tres jobs y logs para su SHA, merge normal, CI main, Vercel y Railway. Verificar versiones y flags antes de sustituir datos demo. La sustitución solo se habilita después de validar el conjunto completo y conservar el respaldo. Recuperación: reabrir las conversaciones anteriores y cerrar las nuevas, sin eliminar tickets ni recibos ni reencolar envíos. Guest Memory OFF y SEND_AUTOMATIONS=false; no se usan proveedores de transporte ni conectores.

La publicación, la carga final y la comprobación pública se registrarán al terminar. Este informe no acredita todavía esas fases.

## Ajuste de CI de la PR #43

El primer job PostgreSQL ejecutó correctamente los diez grupos operativos, pero la fixture de métricas carecía de la columna `conversations.status` presente en el catálogo. Se añadió esa columna a la base desechable y una comprobación de que los hoteles ordinarios conservan el histórico cerrado. Los seis grupos de métricas pasan con la red del contenedor deshabilitada. Ninguna expectativa ni política de acceso se relajó.


## Corrección observada antes de activar la nueva demo

La PR #43 se integró en `c0d0a1ee5942d49c5ba8c1bc6c92c08b2c135bbd`, con sus tres jobs y los tres de main aprobados. Vercel Production y Railway se verificaron para ese SHA; SEND_AUTOMATIONS=false y Guest Memory ausente/default OFF. Durante la primera generación destinada a demo, todavía oculta, apareció «El equipo encargado lo revisará a la mayor brevedad posible». Se conserva esta salida desfavorable y se incorpora una regresión que retira la promesa manteniendo el acuse.

Se corrige además la pregunta que mezclaba la fecha conocida con la hora/vuelo faltantes, la explicación concreta cuando el huésped pregunta si una cuna/traslado/factura/objeto está confirmado y un falso positivo que descartaba «no se garantiza disponibilidad anticipada de habitación». No se ha guardado ninguna respuesta final de esa tanda antes de este ajuste. Los seis tickets nuevos ya están persistidos y no se repiten ni se borran; las nueve conversaciones siguen cerradas mientras se prepara su contenido.


En los seguimientos de demo se conservaron las salidas que reenviaban innecesariamente a recepción, ofrecían horarios de entrega o toallas ajenas a la incidencia y pedían otra vez identificar una estancia ya localizada. Se eliminan esas preguntas/derivaciones solo para peticiones ya registradas. Cuando se pregunta expresamente por disponibilidad, reserva, emisión o hallazgo, la respuesta aclara ese resultado pendiente, sin añadir un descargo a todos los acuses. Un seguimiento de horario de desayuno usa únicamente la ventana inequívoca del Knowledge autorizado y no introduce piscina u otros servicios.

La demo ha requerido 31 generaciones reales adicionales (18 principales y 13 posteriores a tickets). Total: 126, cero errores HTTP, sin repeticiones selectivas. Los siete tickets nuevos se han leído tras su persistencia; seis seguimientos reutilizan los iniciales y la nueva estancia crea uno independiente. Las conversaciones siguen cerradas hasta validar/desplegar el ajuste final y publicar el lote completo. Las salidas y recibos de esta carga permanecen en el respaldo privado, fuera de Git.
