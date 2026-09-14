# Inbox: claridad de estados, idiomas y actividad interna

Revisión local del 12 de septiembre de 2026. Rama `codex/inbox-state-clarity`, creada desde `origin/main` en `cffec64faacba8c917068a269f458dd9328aed7e` (merge de PR #5). Las referencias se actualizaron antes de editar. No había cambios versionados pendientes. El inventario remoto sin seguimiento se preservó fuera del commit; SHA-256: `f92bda9820b7cc54b61a9f4910f7891da12dcba7bdb9578ecec3b32b331e3429`.

## Alcance y fuentes

- `InboxClient.js`: presenta por separado conexión, estado de conversación, control humano y configuración de respuestas automáticas. Conserva los predicados de todos los filtros, permisos y manejadores existentes.
- `inbox-clarity.js`: helpers de presentación probados con datos sintéticos. Un bloqueo global o del hotel se muestra como «Respuestas automáticas desactivadas»; información insuficiente como «sin confirmar»/«sin configurar». Para afirmar configuración habilitada se exige evidencia positiva global y del hotel. El control humano pausa esa configuración en la conversación.
- «En vivo» sigue dependiendo de la suscripción de Realtime, no de la posibilidad de responder. El filtro `ai` mantiene exactamente `!isHumanTakeoverActive(conversation)` y se llama «Sin control humano». No depende de `SEND_AUTOMATIONS`.
- `shared/pilot/ai-safety.js:221` contiene el gate real del servidor (global, hotel, fallo de consulta del estado y control humano). Las etiquetas usan `pilotAiSafety.globalStatus`, `pilotAiSafety.hotelStatus` y el contexto autorizado del hotel ya disponibles. No certifican disponibilidad del proveedor ni una respuesta enviada: el servidor vuelve a evaluar sus condiciones al responder. Un fallo futuro en la consulta del estado no puede anticiparse en el dashboard.
- `src/services/message.service.js:69` elige `guest.preferred_language || 'es'` como destino. «Enviar en» refleja esa fuente, con tooltip sobre el valor por defecto; no usa el idioma de lectura ni el del último mensaje entrante. «Leer en» conserva su selector y manejador. Los nombres de idiomas se localizan mediante `Intl.DisplayNames`; un código no reconocible no se presenta como conocido.
- La lista reduce padding, espacio de cabecera/filtros y separación de etiquetas; mantiene identidad, habitación, hora, contadores canónicos, dos líneas de vista previa y estados. Las iniciales proceden exclusivamente de los campos de nombre autorizados ya recibidos. Sin nombre, un icono de persona reemplaza las iniciales derivadas del teléfono; el teléfono sigue identificando al huésped.

## Procedencia del registro técnico

`src/services/staynex.service.js:1485–1494` guarda un mensaje de auditoría `sender_type: 'ai'` con `metadata.system_event: 'experience_booking_request_created'`. El contenido es «Provider experience request created: …». La respuesta para el huésped se guarda separadamente con `translation_direction: 'ai_to_guest'` (línea 1733) y el cuerpo enviado a WhatsApp es `aiResponseWithUpsell.reply` (línea 1983), no ese registro de auditoría.

Solo el metadato exacto, emisor AI y ausencia de evidencia contradictoria de salida permiten la representación «Actividad interna · Solicitud de experiencia». Se conservan contenido íntegro, fecha/hora y posición en el historial. No se clasifica por idioma ni por texto. Un mensaje sin ese metadato, con evento desconocido o con metadatos de envío conserva el tratamiento normal.

`src/services/supabase.service.js` conserva metadata en `createMessage`, pero su compatibilidad con columnas antiguas puede omitirla. La lectura ampliada de `dashboard/lib/inbox.js` incluye metadata; su fallback antiguo puede no tenerla. Por tanto, NO se ha determinado la procedencia del registro concreto de producción ni se han reclasificado datos históricos. No se consultó Supabase remoto.

## Escala y comprobación visual

Montaje existente y excluido de Git: `http://127.0.0.1:3321/dashboard/inbox`, con componentes productivos copiados sin diferencias de bytes; proveedor simulado y BD en memoria en loopback 3322. Se reinició exclusivamente ese proveedor tras preservar el estado y los eventos sintéticos anteriores. El runner elimina variables heredadas, usa destinos Supabase inválidos en loopback, bloquea tráfico externo y fija `SEND_AUTOMATIONS=false`, `USE_MOCK_AI=true`. La suscripción `SUBSCRIBED` se simuló explícitamente; no es una conexión Realtime remota comprobada.

Mediciones y acciones mediante navegador:

- Portátil 1366×768 CSS: lateral expandido 240, compacto 72; lista 360. No hubo desbordamiento horizontal del documento ni de lista/historial. Con control humano, historial de 431 px y lista desplazable de 508 px; sin control humano, 455/525 px. La tercera conversación completa cabe en el ejemplo con seis conversaciones. Su altura puede variar con el contenido real.
- Escritorio: viewport solicitado 1920×1080; captura original devuelta de 1920×1065. Menú compacto, ficha lateral, actividad interna y respuesta al huésped visibles.
- Móvil: viewport solicitado 390×844 CSS; captura original 390×843. Cabecera y compositor disponibles, historial desplazable de 429 px en la medición inicial y sin desbordamiento horizontal. Se detectó y corrigió una regla móvil previa que ocultaba el nuevo «Enviar en»; la captura final muestra ambos idiomas en la misma segunda línea de controles.
- `devicePixelRatio` observado aproximadamente 1 en las primeras mediciones y 1,25 después de recargar; `visualViewport.scale` 1. Los anchos CSS permanecieron 240/72. 300/90 es matemáticamente compatible con multiplicar esos anchos por 1,25, pero no identifica la causa de las capturas de producción. No se cambió zoom, escala del sistema, transformaciones ni tipografía global.
- Zoom real 125 % y 150 % de esta revisión: **no verificado**. La herramienta utilizada controla el viewport y no acreditó el zoom de la interfaz nativa del navegador; reducir el viewport o leer DPR no sustituye esa prueba. La aprobación manual del usuario de esos zooms corresponde a PR #5, no se presenta como validación de esta revisión.

## Interacciones observadas

- Conexión simulada «En vivo» junto a respuestas automáticas desactivadas, tanto con David bajo control humano como con conversaciones sin él.
- Filtro «Sin control humano»: cinco conversaciones; excluye David sin alterar sus criterios.
- Lectura Francés y envío Español; cero solicitudes de traducción al abrir, cambiar idioma, ficha, lateral o conversación. Traducción autorizada bajo demanda e históricos conservados por las suites existentes; no se invocó un traductor externo.
- Huésped con nombre/iniciales y huésped sin nombre/icono y teléfono. Registro interno con procedencia, respuesta `ai_to_guest`, registro con la misma redacción sin procedencia y mensaje histórico de personal sin metadata conservan sus tratamientos distintos.
- Ficha abre/cierra; lateral expande/contrae; navegación móvil lista → chat → volver. Borradores separados por conversación y conservados al cambiar estos controles. No se promete persistencia al recargar de borradores nunca enviados; la recuperación del intento incierto sí se comprobó tras recargar.
- Envío sintético pausado: botón «Enviando respuesta» deshabilitado y borrador conservado. Rechazo recuperable: explicación, texto y reintento explícito. Segundo intento explícito aceptado: borrador vacío y «Aceptado por el proveedor. Entrega todavía no confirmada».
- Tercer intento explícito: timeout, texto conservado y «Resultado sin confirmar», sin reintento automático. Cambio de conversación, recarga, ficha e idiomas conservan la recuperación y los estados persistidos. Contador final: tres peticiones/tres llamadas al proveedor simulado, cero solicitudes de traducción. No se enviaron WhatsApp reales ni se cambiaron estados de atención o Human Takeover durante estas comprobaciones.

## Validación automatizada

Node 24.19.0. Comandos aislados con `SEND_AUTOMATIONS=false` y precarga `scripts/ci/isolate.cjs`:

```powershell
$env:SEND_AUTOMATIONS='false'
node --require ./scripts/ci/isolate.cjs scripts/test-inbox.js
node --require ./scripts/ci/isolate.cjs scripts/test-manual-send.js
node --require ./scripts/ci/isolate.cjs scripts/test-pilot-human-safety.js
node --require ./scripts/ci/isolate.cjs scripts/test-translation-knowledge-isolation.js
node --require ./scripts/ci/isolate.cjs scripts/test-message-attention.js
npm run ci:dashboard
git diff --check
```

Todos PASS. Inbox añade casos funcionales para estados off/on/desconocido, identidad sin nombre, idiomas independientes y procedencia interna conocida/ausente/contradictoria. Dos assertions anteriores sobre etiquetas se adaptaron a las nuevas fuentes de presentación; no se retiraron controles de seguridad. Inbox se repitió tras el ajuste móvil. Build repetido tras el CSS final: compilación, tipos y 64 páginas correctos; avisos de caché webpack no bloqueantes. Atención usa dependencias controladas, no PostgreSQL real: no se atribuye a este pase una nueva validación SQL/concurrencia.

## Evidencia original local y límites

Capturas JPEG devueltas por el navegador, sin edición ni generación, en `.npm-cache/inbox-clarity/evidence/` (fuera de Git):

- `laptop-expanded.jpg`, `laptop-compact-detail.jpg`, `laptop-no-human.jpg`.
- `desktop-compact-detail.jpg`.
- `mobile-chat.jpg`, `mobile-list.jpg`.
- `manual-failed.jpg`, `manual-accepted.jpg`, `manual-unknown.jpg`, `manual-reopened.jpg`.
- `final-metrics.json` conserva medidas CSS y contadores. La evidencia anterior del proveedor está preservada como `previous-provider-state.json` y `previous-provider-events.json`.

No se publican fixtures ni rutas de prueba en el runtime del producto. No hubo cambios de API, SQL, backend, configuración remota o producción. Pendientes: aceptación visual del nuevo pase a zoom nativo 125/150 %, y cualquier comprobación real de despliegue/procedencia remota que se autorice por separado. Esta tarea termina en commit local, sin push ni PR.
