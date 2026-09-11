# Inbox: conversación primero

Revisión local del 11 de septiembre de 2026. Rama `codex/inbox-conversation-first`, base `87d77f450aac0ff7cc16fe7c7f2704ae575e006a`. Sin push, merge, despliegue, SQL remoto ni envíos reales.

## Implementación

- Inbox en modo claro, independientemente de la preferencia guardada para las otras páginas. Lista de 360 px en escritorio, mensajes de 16 px, burbujas ajustadas al contenido y desplazamiento independiente del historial y la lista.
- Menú compartido de 240/72 px, con los mismos filtros de autorización, enlaces y contadores. Preferencia de sesión existente, nombres accesibles, ayuda al pasar el ratón y al enfocar con teclado. Navegación móvil conservada.
- Identidad y habitación completas, estado efectivo de control visible, ficha opcional de 300 px en escritorio amplio y diálogo modal en portátil/móvil. Escape y restauración de foco. Fechas desconocidas indican «No disponible».
- Respuestas rápidas agrupadas en un menú; asistencia IA y selector de idioma junto al compositor. Se conservan sus acciones originales y las acciones de atención vinculadas a cada mensaje.
- Original/traducción se etiquetan cuando existe una traducción que distinguir. La procedencia verificada y la traducción bajo demanda conservan sus comprobaciones anteriores. Un idioma desconocido conserva la acción explícita de traducción.

No se añaden endpoints, dependencias ni campos de almacenamiento. No se modifican proveedores, autorización, filtros de Realtime, RLS, resolución de atención, Human Takeover, Kill Switch ni los controladores de envío/recuperación.

Las maquetas son referencias, no contratos de datos. Se conservan los seis filtros existentes y sus unidades: el resumen cuenta mensajes sin leer y los filtros cuentan conversaciones. El listado no dispone de un agregado canónico de mensajes pendientes; no se inventa ese contador ni se equipara con conversaciones sin leer. El seguimiento por mensaje sigue disponible en el historial. Las acciones de tickets/escalado disponibles permanecen en la asistencia existente; no se crean botones sin contrato autorizado para imitar la maqueta.

## Validación automática

Node 24.19.0. Los wrappers de CI aíslan variables, impiden cargar `.env` y bloquean destinos externos. `SEND_AUTOMATIONS=false`, proveedores simulados.

- `npm run ci:critical`: PASS. Ejecuta `check:syntax`, `test:ci-guards`, `test:manual-send`, `test:inbox`, `test:auth-hotel-context`, `test:messages-tenant-isolation`, `test:pilot-human-safety`, `test:translation-knowledge-isolation` y `test:http-security`.
- `node --require ./scripts/ci/isolate.cjs scripts/test-permissions.js`: PASS.
- `node --require ./scripts/ci/isolate.cjs scripts/test-message-attention.js`: PASS, 20 escenarios con dependencias controladas; no es validación PostgreSQL.
- `npm run ci:dashboard`: PASS, compilación y generación de 64 páginas. Avisos no bloqueantes de caché de Webpack en Windows.
- `git diff --check`: PASS.

La prueba de Inbox ajusta las referencias a los estilos y ejecuta el ciclo real de presentación del diálogo contra una frontera DOM sintética, incluida la transición modal/acoplada, retirada del listener y devolución del foco. También verifica la persistencia de la preferencia del menú. No se han eliminado aserciones de aislamiento ni de envío.

## Comprobación real en navegador

Montaje aislado en `http://127.0.0.1:3321/dashboard/inbox`; proveedor simulado en loopback 3322. Reutiliza el mecanismo previo de revisión, con una copia local de los componentes productivos y adaptadores exclusivamente bajo `.npm-cache/inbox-redesign`. No hay fixtures ni rutas de laboratorio incorporadas al runtime productivo.

- 1920×1080: menú compacto/expandido, estado inicial sin selección, ficha acoplada de 300 px.
- 1440×900 y 1366×768: menú compacto/expandido, ficha superpuesta y compositor visible. En 1366 expandido, historial de 405 px y ancho total 1366 sin desbordamiento horizontal.
- 390×844: lista → chat → volver, menú móvil y ficha modal. Escape cierra la ficha.
- Historial largo: desplazamiento del historial independiente de la lista. Borrador largo conservado al cambiar de conversación y contraer/expandir el menú; sin mezcla entre conversaciones.
- Ayuda del menú comprobada con teclado: al enfocar Inbox aparece su nombre y las unidades de sus contadores. La preferencia compacta sobrevive a recargar.
- Dashboard → Inbox: ambas páginas cargan con el menú compartido. Se corrigió un import ausente únicamente en el adaptador sintético del dashboard; no era un fallo del producto.
- Envío pausado y doble clic: un solo intento, botón deshabilitado y texto conservado. Aceptación: borrador resuelto, sin afirmar entrega.
- Rechazo recuperable: texto y error visibles, reintento explícito. Resultado incierto: texto conservado, repetición bloqueada y ningún reintento automático. «Actualizar historial» mantiene la incertidumbre e informa de que no consulta WhatsApp.
- Cambiar de conversación y recargar/reabrir recuperan el resultado incierto sin nuevas llamadas. Aceptación seguida de fallo de persistencia: aviso «no repitas el envío», sin ofrecer un reintento.
- Mensajes históricos sin metadatos de envío permanecen visibles con estado no disponible. Traducciones antiguas sin procedencia no se reutilizan; cambiar el idioma no solicita traducciones. La acción explícita muestra original y traducción con su control de visibilidad.

Los escenarios de envío produjeron cinco llamadas al proveedor simulado: aceptación, rechazo, reintento explícito, timeout y aceptación sin persistencia. Navegación, cambio de presentación, ficha y recarga no añadieron envíos. La prueba explícita de traducción produjo una llamada simulada; el cambio de idioma no añadió llamadas de traducción.

## Evidencia local

Directorio: `.npm-cache/inbox-redesign/evidence/` (fuera de Git).

- `final-1920-compacto.png`, `final-1920-ficha.png`.
- `final-1440-expandido.png`, `final-1366-expandido.png`.
- `final-390-lista.png`, `final-390-chat.png`, `final-390-ficha.png`.
- `envio-en-proceso.png`, `envio-aceptado.png`, `envio-fallido.png`, `envio-incierto.png`, `recarga-incierto.png`, `aceptacion-sin-persistencia.png`, `traduccion-explicita.png`.

Las capturas de estados documentan el recorrido de validación; las que empiezan por `final-` corresponden a la presentación final. `manifest.json` registra hashes de los archivos finales y de las capturas. Todo el contenido mostrado es sintético.

Para abrir el montaje ya preparado, usar la URL anterior. Si está detenido, desde la raíz ejecutar `node .npm-cache/inbox-redesign/run.cjs`; el lanzador impone la configuración aislada y no carga credenciales reales. El montaje y sus recibos son locales y desechables; no se distribuyen como funcionalidad de producción.

## Límites

- Zoom real del navegador pendiente: el atajo de la superficie automatizada no modificó la escala. Las cuatro resoluciones y el reflow móvil sí se comprobaron; no sustituyen esa prueba de zoom.
- Revisión visual con sesión sintética Admin, no una certificación de cada pantalla y rol. Las pruebas de permisos y contratos permanecen activas.
- La simulación no certifica Supabase, PostgreSQL, Realtime remoto ni entrega WhatsApp. No se hicieron llamadas externas ni cambios de datos reales.
- Se mantiene el contrato anterior de borradores: navegación dentro de Inbox conserva el borrador en memoria; no se añade persistencia permanente de todos los borradores nuevos. Los recibos y recuperación de fallos/incertidumbre conservan su mecanismo existente.
- La ficha usa exclusivamente campos ya disponibles; no se completan reservas ausentes ni se deducen nombres de mensajes.
- El inventario `staynex-inventario-remoto (1).json` se conserva fuera de Git, SHA-256 `f92bda9820b7cc54b61a9f4910f7891da12dcba7bdb9578ecec3b32b331e3429`.
