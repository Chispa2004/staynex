# Envío manual de Inbox: validación y resultado verificable

Revisión local del 10 de septiembre de 2026. Rama `codex/reception-message-dashboard`, base `43763d836f45c3163bf48596f7dd81ea2c7d4e06`. Árbol inicialmente limpio. Alcance limitado al envío manual; sin cambios remotos ni automatizaciones activadas.

## Hallazgos y correcciones

El flujo es `InboxClient` → API del dashboard `/api/messages/send` → backend `/messages/send` (autenticación interna existente) → servicio de mensajes → Twilio → persistencia → respuesta/recarga de Inbox.

- La API ya resolvía sesión, contexto autorizado, permiso Inbox y restricción de soporte. Se conservan. El backend verificaba el hotel de la conversación después de leerla, pero no comprobaba que su huésped perteneciera al mismo hotel. Ahora ambas consultas incluyen el hotel autorizado; el destinatario se obtiene únicamente del huésped de esa conversación. Campos de hotel o destinatario manipulados por el cliente no se propagan desde el dashboard.
- Faltaba un contrato estricto de texto y longitud. Se rechazan objetos, arrays, texto vacío y solicitudes inválidas antes del proveedor. Se conserva texto Unicode y multilínea. Se valida un máximo conservador de 1600 unidades UTF-16, también sobre el texto final traducido, conforme al límite de Body de [Twilio 21617](https://www.twilio.com/docs/api/errors/21617). No había un límite equivalente en la aplicación.
- Antes se persistía el mensaje sin un resultado de envío durable; la UI mostraba un check en todos los mensajes de personal y los errores quedaban en consola. Ahora hay resultados explícitos y textos seguros, sin exponer errores del proveedor o de la BD.
- El UUID del intento es también la clave primaria del mensaje. Se guarda un estado incierto antes de llamar al proveedor. Repetir el mismo intento, incluso concurrentemente, devuelve el estado existente sin otro envío. La compatibilidad con columnas antiguas puede omitir campos de traducción, pero nunca metadata ni filtros de hotel.
- Se conserva el comportamiento existente de respuesta manual respecto de Human Takeover y Kill Switch. El adaptador exclusivo de envío manual configura timeout de 15 segundos y desactiva reintentos automáticos; no modifica el adaptador de automatizaciones.

## Resultados y recuperación

| Evidencia | Resultado visible | Recuperación |
| --- | --- | --- |
| Petición en curso | En proceso | Bloqueo síncrono de doble clic; borrador conservado antes de enviar. |
| SID válido y aceptación del proveedor | Aceptado por el proveedor; entrega no confirmada | Se limpia únicamente el borrador enviado, preservando ediciones posteriores. |
| SID válido y estado `delivered`/`read` del proveedor | Entregado | Check únicamente con esa evidencia. |
| Rechazo definitivo o fallo anterior al envío | Fallido con explicación segura | Texto conservado; botón Reintentar para fallos recuperables (p. ej., 429 o preparación temporal). Otros requieren corregir el texto/destinatario o intervención administrativa. |
| Timeout, transporte ambiguo o respuesta no verificable | Resultado sin confirmar | Texto conservado; Revisar estado recarga el historial. Sin reintentos automáticos ni repetición del mismo texto desde ese intento. |
| Aceptación seguida de fallo al guardar la confirmación | Aceptado; aviso de que no se guardó la confirmación | No se invita a repetir. La fila durable queda incierta si no se pudo actualizar. |

Los estados se conservan en `messages.metadata.manual_send`. Una fila histórica sin este contrato muestra que su estado de envío no está disponible. Reabrir el chat recupera los estados persistidos y permite recuperar su texto sin enviar nada. El recibo local se guarda en sessionStorage por usuario, hotel y conversación; restaurarlo nunca ejecuta un envío. Si no puede guardarse el recibo antes del envío, se rechaza localmente sin contactar al backend.

La prevención de duplicados cubre el mismo UUID de operación y el doble clic de este compositor. No es una deduplicación universal entre distintos operadores, pestañas o UUID. Los clientes antiguos que omitan el UUID reciben uno nuevo del servidor. El almacenamiento local dura la sesión de la pestaña; si se cierra y no existe fila persistida, esa recuperación no está garantizada.

## Verificación local

Fuente copiada sin archivos de entorno a `.npm-cache/manual-send/publishable`, con manifiesto SHA-256. Pruebas con BD simulada y proveedor simulado, bloqueo de red externa y lectura de archivos .env; `SEND_AUTOMATIONS=false`, `USE_MOCK_AI=true`. Sin mensajes reales ni llamadas a IA.

- `npm run test:manual-send`: PASS, 14 grupos. Incluye validación, conversación y huésped de otro hotel, rol/sesión, cuerpo manipulado, aceptación, rechazo, timeout, aceptación seguida de fallo de persistencia, contención del mismo UUID, recuperación tras recarga, almacenamiento local fallido y ejecución del manejador real del compositor con dependencias simuladas.
- `npm run test:inbox`: PASS.
- `npm run test:auth-hotel-context`: PASS.
- `npm run test:messages-tenant-isolation`: PASS.
- `npm run test:pilot-human-safety`: PASS.
- `npm run test:translation-knowledge-isolation`: PASS.
- `npm run dashboard:build`: PASS, 69 segundos.
- `git diff --check`: PASS antes del commit.

Evidencia local ignorada por Git: `.npm-cache/manual-send/test-*.log`, `dashboard-build.log`, `source-manifest.json`. Las pruebas ejercitan fuentes reales con adaptadores simulados; no sustituyen una prueba visual en navegador, una ejecución contra PostgreSQL real ni una validación con Twilio real. No se reclama ninguna de esas tres comprobaciones.

## Dependencias y pendientes

No se introduce SQL ni se modifica el esquema. Se reutilizan la clave primaria de `messages.id` y `messages.metadata`, presentes en el contrato del repositorio; la migración existente `supabase/sql/add_multilanguage_translation_layer.sql` contiene metadata. Su presencia efectiva en Supabase de demo sigue sin verificarse. Si falta metadata, el nuevo flujo rechaza el envío antes del proveedor; no degrada a un envío sin registro. No aplicar una migración antigua completa sin revisar el catálogo remoto.

No se encontró un callback de estados salientes; el webhook existente procesa mensajes entrantes. La aceptación síncrona no demuestra entrega, según el [contrato de estados de Twilio](https://www.twilio.com/docs/messaging/api/message-resource). Queda pendiente integrar y validar callbacks firmados o reconciliación autorizada para conocer entregas y fallos posteriores. Revisar estado consulta únicamente el historial persistido, no Twilio. Un timeout que no pueda reconciliarse requiere comprobación operativa; no se convierte en un fallo seguro.

Para utilizar este bloque hacen falta despliegues coordinados de backend y dashboard y comprobación del esquema existente. Desplegar primero backend y luego dashboard; una UI nueva con una respuesta antigua sin estado reconoce incertidumbre. La transición con UI antigua no constituye la validación final. Las actuaciones remotas de traducción y hotel_knowledge continúan pendientes y no se consideran resueltas por este cambio.

Los dos puntos de Badar quedan corregidos localmente respecto de validación del envío manual y comunicación/recuperación de los resultados de la petición. El seguimiento asíncrono de entrega/fallo y su comprobación en demo permanecen abiertos. La protección completa de automatizaciones frente a concurrencia y reintentos queda fuera del alcance.

## Archivos del commit

```text
dashboard/app/api/inbox/route.js
dashboard/app/api/messages/send/route.js
dashboard/components/InboxClient.js
dashboard/lib/manual-send-client.js
docs/manual-send-review.md
package.json
scripts/test-auth-hotel-context.js
scripts/test-manual-send.js
scripts/test-messages-tenant-isolation.js
shared/manual-send/contract.js
src/controllers/messages.controller.js
src/services/message.service.js
src/services/twilio.service.js
```

Commit exclusivamente local. Sin push, despliegue, modificaciones remotas ni activación de automatizaciones.

## Cierre visual en navegador — 10 de septiembre de 2026

Base de este pase: `3defc4efc7f706f35d9047b29e8637a5316c4057`, misma rama y árbol inicialmente limpio. Esta sección actualiza la limitación de comprobación visual del informe anterior.

**Verificación visual local: PASS en el alcance descrito.** Navegador real, viewport de 1280 × 720, tema oscuro existente. URL: `http://127.0.0.1:3311/dashboard/inbox`. Se reutilizó el montaje de revisión anterior en una copia ignorada, `.npm-cache/manual-send-visual/runtime`, sincronizada con los componentes actuales. El componente Inbox y el servicio `createManualMessageSender` son los del producto. La sesión/API visual se sustituye por el límite de red sintético existente; el servicio usa el adaptador de BD en memoria de `test-manual-send` y un proveedor simulado en loopback:3312. No es una prueba de autenticación real ni de PostgreSQL real. No hay rutas de test, fixtures ni rewrites nuevos en el producto.

Ambos procesos arrancan con lista de variables permitidas, sin archivos .env, sin credenciales reales, red externa bloqueada, `SEND_AUTOMATIONS=false` y `USE_MOCK_AI=true`. La demora del proveedor se controla desde un panel identificado como sintético. Se corrigió únicamente el reloj fijo del adaptador de pruebas para situar los nuevos mensajes después del historial. Los fixtures y sus ajustes quedan fuera del commit.

### Problemas observados y correcciones mínimas

1. Al cambiar de conversación durante un envío, el indicador «Enviando respuesta…» se mostraba también en el otro chat. Se asocia ahora al usuario/hotel/conversación que inició el intento. El otro compositor explica que espera un envío de otra conversación y permite preparar su propio borrador. Se mantiene el bloqueo global frente a envíos simultáneos.
2. «Revisar estado» no explicaba el origen de la información ni daba feedback cuando seguía sin haber confirmación. Ahora se llama **Actualizar historial**, indica que no consulta WhatsApp y comunica actualización en curso, resultado todavía incierto o imposibilidad de actualizar. El feedback pertenece al intento y chat que lo pidió.
3. Tras aceptación con fallo al persistir, la recarga de BD podía sustituir la burbuja por un resultado incierto mientras el compositor conservaba la aceptación conocida. Se conserva un recibo local por intento, con ámbito de usuario/hotel/conversación, durante la sesión de la pestaña. La burbuja usa esa confirmación solo si coinciden UUID y texto con la fila incierta, avisando de que no se guardó. Una composición posterior no borra este recibo. No se modifica la fila de BD ni se atribuye entrega. Si no existe ese recibo en otra sesión, la fila sigue mostrándose prudentemente como incierta.

### Interacciones comprobadas

| Caso real de navegador | Resultado observado |
| --- | --- |
| Doble clic con proveedor pausado | Una petición y una llamada al simulador; botón bloqueado y texto intacto. |
| Cambio a otro chat durante el envío | Borrador independiente; después de corregir, indicador exclusivo del chat de origen y espera explicada en el otro. |
| Respuesta tardía y aceptación persistida | Inicialmente incierto al vencer la espera del proxy local; una lectura posterior de BD recuperó la aceptación y resolvió el borrador sin reenviar. |
| Rechazo definitivo del intento, recuperable (429) | Explicación visible, texto conservado y Reintentar explícito. La recarga mantuvo el fallo y no envió nada. |
| Reintento explícito aceptado | Una llamada adicional; nuevo intento visible como aceptado, sin afirmación de entrega; borrador enviado resuelto. El intento fallido conserva su historial. |
| Timeout simulado sin confirmación posterior | Advertencia, texto recuperado al reabrir/recargar, envío del mismo texto bloqueado. Actualizar historial mantuvo incertidumbre y lo explicó. |
| Aceptación seguida de fallo de persistencia | Aviso de aceptación sin guardar y sin invitación a repetir. Tras corregir, burbuja coherente, también al editar otro borrador y recargar en la misma pestaña. |
| Volver a lista, cambiar de chat y recargar | No aumentó el contador de envíos; estados y textos de intentos fallidos/inciertos conservados por conversación. |
| Mensaje histórico sin manual_send | Original y hora visibles; estado de envío histórico no disponible, sin check de entrega inventado. |

El registro final del simulador contiene seis peticiones deliberadas y seis llamadas de proveedor, incluido un reintento explícito. Las acciones posteriores de volver, reabrir, recargar y actualizar historial mantuvieron el contador en seis. El registro está en `.npm-cache/manual-send-visual/events.json`.

**Qué consulta Actualizar historial:** `reviewManualHistory` → `refreshInboxSilently` → `loadInbox` → GET `/api/inbox` → `getInboxConversations` y lecturas de BD. Puede recuperar una actualización que otro proceso ya haya guardado, como la aceptación tardía observada. No llama al adaptador Twilio ni introduce callbacks. Cuando no hay evidencia nueva, el resultado continúa sin confirmar. El mensaje final lo dice expresamente.

### Capturas reales

Directorio absoluto: `C:/Users/chimi/OneDrive/Documentos/New project/.npm-cache/manual-send-visual/evidence/`. Capturas PNG del navegador, sin generación ni retoque. Los archivos 01–13 documentan la observación inicial y pasos intermedios; 14–18 incluyen las correcciones finales de historial y recibos.

| Archivo | Evidencia |
| --- | --- |
| `01-historico.png` | Mensaje antiguo sin metadatos nuevos. |
| `04-en-proceso-corregido.png` | Envío en curso, texto y botón bloqueado. |
| `05-otro-chat-corregido.png` | Espera correctamente atribuida a otro chat y borrador separado. |
| `07-confirmacion-recuperada-bd.png` | Aceptación recuperada de BD después de respuesta tardía. |
| `09-fallo-reintento.png` / `10-fallo-tras-recarga.png` | Fallo recuperable y conservación tras recarga. |
| `11-reintento-aceptado.png` | Reintento explícito aceptado, sin entrega afirmada. |
| `14-historial-sigue-incierto.png` | Feedback final de Actualizar historial sin evidencia nueva. |
| `15-aceptacion-coherente.png` | Burbuja y compositor coherentes ante fallo de persistencia. |
| `16-aceptacion-con-nuevo-borrador.png` / `17-aceptacion-local-tras-recarga.png` | Recibo del nuevo intento conservado al editar y recargar. |
| `18-recarga-sin-reenvio.png` | Resultado incierto recuperado y contador final de seis envíos. |

Manifiestos locales: `.npm-cache/manual-send-visual/source-manifest-final.json` (fuentes observadas) y `evidence-manifest.json` (capturas SHA-256). El montaje y las capturas están ignorados por Git; no se publican como parte del producto. El servidor permanece local para revisión. Para volver a arrancarlo cuando ambos puertos estén libres, el procedimiento aislado es `node .npm-cache/manual-send-visual/run.cjs`; su BD es desechable y se reinicia vacía al detener ese proceso.

### Requisitos concretos de Supabase antes del despliegue

Sin consultas remotas en este pase. **Estos requisitos proceden del código y del SQL versionado; no se da por confirmado el catálogo de demo.**

- `public.messages.metadata`: columna `jsonb`, capaz de guardar y devolver íntegro el objeto `manual_send` en INSERT, UPDATE y SELECT. El esquema versionado declara `NOT NULL DEFAULT '{}'::jsonb` en `supabase/sql/add_multilanguage_translation_layer.sql:14`. El envío escribe metadata explícitamente; registros históricos nulos o sin `manual_send` no prueban contaminación ni se deben rellenar/borrar para esta prueba. Comprobar tipo, nulabilidad, default, grants efectivos y cualquier trigger que pudiera descartar o reescribir metadata. El rol autorizado del backend necesita SELECT/INSERT/UPDATE efectivos; no se requieren nuevos permisos del navegador.
- `public.messages.id`: UUID no nulo y clave primaria **sobre id exclusivamente**, con índice válido de unicidad global y comprobación inmediata, conforme a `supabase/schema.sql:30`. Debe aceptar el UUID explícito del intento sin que un trigger lo cambie. No basta una unicidad compuesta por hotel o conversación: la deduplicación espera que un mismo id produzca `23505`, comprueba después su hotel/conversación y nunca vuelve a enviar esa operación. El default `gen_random_uuid()` conserva otros consumidores, aunque este flujo suministra su propio id.
- Conservar `hotel_id` y `conversation_id` no nulos y sus claves foráneas, `sender_type='staff'` admitido y `content` original. Confirmar que constraints/triggers no impiden guardar el intento previo al proveedor o cambian su identidad.
- Comprobar también `original_language`, `translated_language`, `translated_text`, `translation_provider` y `translation_confidence`. El lector actual de Inbox usa una selección ampliada con metadata; si falta cualquiera de esas columnas, su fallback antiguo selecciona campos básicos sin metadata y no puede recuperar estados persistidos. La comprobación de demo debe verificar que esta lectura conserva `metadata.manual_send`, no solo que la columna metadata exista. Este pase no modifica ese fallback ni declara compatible un esquema parcial.
- Una consulta con service_role no certifica RLS. La validación desplegada debe incluir sesión autorizada, pertenencia hotelera y lectura de los estados sintéticos después de recargar; requiere autorización separada para introducir datos de prueba. No se han creado aquí datos ni cambios de esquema remotos.

No se necesita SQL nuevo para las correcciones visuales. Si el catálogo no cumple estos requisitos, preparar una corrección incremental según el estado real antes de desplegar; no ejecutar a ciegas una migración antigua completa. Permanecen pendientes los callbacks/reconciliación para resultados asíncronos y las actuaciones remotas de traducción/hotel_knowledge.

### Pruebas del cierre y límites

PASS: `npm run test:manual-send` (16 grupos, incluidos recibos frente a una fila incierta y el manejador real de actualización del historial), `npm run test:inbox`, `npm run dashboard:build` (53 s) y `git diff --check`. Se usa la copia aislada sin .env ni red externa del pase anterior, sincronizada con los tres archivos de código/pruebas afectados. No se repiten las suites de autorización no modificadas.

La validación visual corresponde al entorno sintético y al viewport indicado; no certifica móvil, autenticación desplegada, PostgreSQL, proveedor real ni callbacks. El seguimiento Message Attention queda bloqueado en este montaje y muestra «Seguimiento no disponible»; no se ha modificado ni auditado ese módulo. Las confirmaciones no persistidas se conservan durante la sesión de la pestaña, sujetas a la disponibilidad de sessionStorage. Los borradores normales todavía no enviados mantienen el comportamiento anterior: sobreviven al cambio de conversación dentro de la vista, pero no se añade persistencia general tras recargar. Los textos de intentos fallidos/inciertos sí cuentan con la recuperación comprobada.

Archivos de este cierre: `dashboard/components/InboxClient.js`, `dashboard/lib/manual-send-client.js`, `scripts/test-manual-send.js`, `docs/manual-send-review.md`. Commit solo local, sin push, despliegue, consultas remotas ni activación de automatizaciones.
