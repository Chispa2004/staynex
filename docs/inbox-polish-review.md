# Pulido final del Inbox — 11 de septiembre de 2026

Base: `9f1d0e5a0ec303ec5fb8308cfc4ef078e44719f6`, rama `codex/inbox-conversation-first`. Sin modificaciones previas salvo el inventario remoto sin seguimiento, que permanece excluido de Git.

## Cambios

- Estado de atención visible y un único control «Opciones» por mensaje. Su desplegable contiene selección, resolución/reapertura y quién cambió el estado y cuándo. Los mensajes históricos conservan sus dos operaciones explícitas. La información existente de autor no se sustituye por nombres deducidos.
- «Atención» en la cabecera reúne la actualización de seguimiento y las operaciones conjuntas. Los avisos y errores permanecen fuera del menú, visibles aunque esté cerrado. No se mezcla con la actualización del historial.
- El control lateral usa iconos de panel con flecha de expansión/contracción. Conserva preferencia, etiquetas, `aria-expanded`, accesos y contadores.

Sin cambios en el proveedor/contexto de atención, reglas de elegibilidad, confirmaciones, autorización, Human Takeover, Kill Switch, traducciones, envío manual, APIs, SQL ni dependencias. Resolver atención continúa siendo independiente del control de la conversación.

Archivos del pulido: `dashboard/components/AppShell.js`, `dashboard/components/InboxClient.js`, `dashboard/components/InboxDetailPanel.js`, `dashboard/components/InboxErgonomics.module.css`, `dashboard/components/MessageAttentionControls.js`, `scripts/test-inbox.js` y este informe.

## Validación local

Comandos desde la raíz, con `SEND_AUTOMATIONS=false` y `USE_MOCK_AI=true`:

```powershell
$env:SEND_AUTOMATIONS='false'
$env:USE_MOCK_AI='true'
node --require ./scripts/ci/isolate.cjs scripts/test-inbox.js
node --require ./scripts/ci/isolate.cjs scripts/test-message-attention.js
node --require ./scripts/ci/isolate.cjs scripts/test-manual-send.js
node --require ./scripts/ci/isolate.cjs scripts/test-permissions.js
npm run ci:dashboard
git diff --check
```

Todos PASS. Atención: 20 escenarios con dependencias controladas. Envío manual: 16 escenarios. Build productivo del dashboard finalizado correctamente. El wrapper bloquea conexiones externas y carga de `.env`; los tests de atención no son una nueva comprobación PostgreSQL.

La ampliación de Inbox ejecuta las funciones JSX productivas de presentación con un contexto sintético mediante TypeScript y React ya instalados. Verifica permisos de solo lectura, controles deshabilitados durante guardado, selección del mensaje exacto, resolución/reapertura, operaciones históricas y uso exclusivo del refresco de atención. No se modifican ni debilitan las pruebas existentes de seguridad o envío.

## Navegador y evidencia

Montaje existente: `http://127.0.0.1:3321/dashboard/inbox`. Para arrancarlo si está detenido: `node .npm-cache/inbox-redesign/run.cjs`. Proveedor simulado en loopback 3322; configuración sintética y bloqueo externo impuestos por el lanzador. Los componentes revisados del montaje coinciden con los archivos productivos; los adaptadores están únicamente en `.npm-cache`.

Comprobaciones realizadas:

- 1920×1080, 1440×900, 1366×768 y 390×844; modos de menú, ficha acoplada/superpuesta y navegación móvil lista/chat/volver. Sin desbordamiento horizontal del Inbox.
- En 1366×768 expandido, historial de 445 px frente a los 405 px documentados antes: 40 px recuperados. Compositor y huésped/habitación/control siguen visibles.
- Menú de atención accesible con ratón y teclado. Tab alcanza «Actualizar atención»; Escape cierra y devuelve el foco a «Atención». Los controles se abren por activación, no por hover. En móvil las opciones se despliegan dentro del mensaje y permanecen accesibles con desplazamiento del historial.
- Resolución individual: confirmación del mensaje exacto y cancelación sin modificación. Selección conjunta: confirmación y guardado sintético de un mensaje; aviso visible, estado actualizado y control de IA independiente.
- Borrador conservado al abrir/cerrar menús, cambiar de conversación y contraer el lateral. Recuperación de un envío incierto persistido: conserva el texto y bloquea el reintento del mismo contenido. Los mensajes históricos y los estados aceptado/fallido/incierto siguen visibles.
- El proveedor simulado mantuvo cinco llamadas (las cinco preexistentes) durante este pase. Cero traducciones solicitadas. No se enviaron nuevos mensajes.
- Panel principal, Reservas y Tickets cargan sus datos sintéticos, conservan el tema oscuro guardado y sus enlaces/contadores. Inbox conserva el modo claro. Selector deshabilitado con un único hotel sin permiso de cambio; apertura/cierre y opciones visibles en compacto/expandido con dos hoteles sintéticos autorizados. No se cambió de hotel. El adaptador temporal de dos hoteles se restauró tras comprobarlo.
- El indicador continúa mostrando «Actualización manual»: no se simula una conexión Realtime efectiva.

Capturas originales del navegador integrado, sin pasar por un visor, en `.npm-cache/inbox-polish/evidence/`:

- `1920-compacto.png`, `1920-ficha.png`.
- `1440-compacto.png`, `1440-ficha.png`, `1366-expandido.png`.
- `390-chat.png`, `390-atencion.png`, `390-ficha.png`, `390-lista.png`.
- `panel-principal.png`, `reservas.png`, `tickets.png`, `selector-compacto.png`, `selector-expandido.png`, `recuperacion-incierta.png`.

`manifest.json` registra hashes de componentes y capturas. Las capturas y el laboratorio quedan fuera del commit.

## Zoom y límites

**Zoom real 125 % y 150 %: validación manual del usuario confirmada al preparar la PR.** El usuario comprobó ambos niveles y confirmó que funcionan correctamente. Esta evidencia es manual, no una prueba automatizada ni una comprobación realizada por el agente.

El intento automatizado anterior se detuvo porque Computer Use no pudo determinar la URL activa con suficiente confianza para aplicar su política. Ese resultado se conserva como limitación de la automatización; la confirmación manual del usuario cierra el pendiente visual. Cambiar viewport o escala de dispositivo no se ha contabilizado como zoom.

Comprobación manual: abrir la URL local en Chrome, usar menú ⋮ → Zoom hasta que indique 125 %, y después 150 %. En cada nivel abrir una conversación, sus «Opciones», el menú «Atención» y la ficha; comprobar texto, scroll y acceso al compositor, tabular y cerrar con Escape. Confirmar que el borrador continúa intacto, sin pulsar Enviar. Volver a 100 % al terminar.

La comprobación visual usa sesión sintética Admin y dos variantes de disponibilidad del selector; no certifica todas las combinaciones de roles en producción. Las pruebas de permisos se mantienen. No se hicieron consultas a Supabase, SQL remoto, operaciones reales, push, PR, merge ni despliegue. El inventario remoto anterior se conserva intacto y fuera de Git.
