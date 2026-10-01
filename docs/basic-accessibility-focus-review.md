# Accesibilidad básica: nombres, teclado y foco

Fecha: 2026-10-01. Base comprobada: `origin/main` `2190ddd061375937a165acad7d3d20b62ae5fbf9` (PR #35). Rama: `codex/basic-accessibility-focus`.

El «140» de la auditoría de Daniel es histórico, no un inventario actual. Esta revisión agrupa defectos compartidos; no cuenta cada aparición como un defecto nuevo. Se conservan PR #34, PR #35, el informe local `bd7e27c` y los demás trabajos. Organizaciones permanece fuera del cambio.

## Correcciones y recorridos

| Componente / páginas | Defecto y corrección |
| --- | --- |
| AppShell, LanguageSelector / navegación y menú móvil | El menú móvil no contenía ni devolvía el foco ni respondía a Escape. Se limita la interacción al menú abierto, se devuelve el foco y Escape en el selector de idioma cierra solo ese selector. Navegación de escritorio no modal. |
| HotelWorkspaceSwitcher / selector compartido | Campos de alta dependían de placeholders; opciones se anunciaban como listbox sin su interacción correspondiente. Etiquetas asociadas, botones nativos, estado seleccionado, cierre con Escape/salida del foco y conservación del borrador. Cambiar de hotel devuelve el foco al selector. |
| InboxClient, InboxDetailPanel / lista, conversación y Asistencia IA | Etiquetas asociadas de búsqueda y respuesta, ayuda vinculada, foco al abrir conversación móvil y retorno a la misma fila reconstruida; buscador como alternativa si desaparece. El panel contiene Tab solo cuando es modal; Escape cierra también la presentación no modal. Refrescar datos no mueve el foco. Borrador conservado. |
| TicketsTable / tabla y tarjetas | Filas con rol de botón y acciones anidadas interceptaban Enter. El título es ahora un enlace nativo al ticket correcto; las acciones conservan su propio comportamiento. |
| ReservationsClient, DataTableShell / reservas y paginación | Selección por botón nativo en tabla; las teclas de controles hijos no activan la tarjeta. Etiquetas de búsqueda y tamaño de página; modal demo identificado, cierre nombrado, entrada/contención/retorno del foco y borrador conservado. Detalle cerrado devuelve foco a la selección o al buscador. |
| HotelFieldErrors, StepHotelSetup, WhatsappDependency, LoginClient | Errores y ayudas asociados a sus campos; se conserva validación, autorización y datos introducidos. |
| PmsConnectionForm, PmsConnectionsClient / PMS y paso PMS de onboarding | Foco modal, error asociado al formulario, ayuda de credenciales solo cuando existe un valor anterior. Borrador al cerrar/reabrir en memoria local; se descarta al cambiar de contexto, perder permiso confirmado, guardar o desmontar. No se guarda en almacenamiento persistente ni se envía al cerrar. |
| HotelLifecycleDialog, MessageAttentionControls / confirmaciones | Contención y devolución del foco, alternativa lógica si el disparador desaparece, sin saltar a Cancelar por una actualización de error. Se mantienen las guardas de operación en curso. |
| OperationalMetricSummary y CSS compartido / explicaciones compactas | Escape cierra la explicación y enfoca su resumen. Foco visible también en summary y tarjetas con rol de botón. |

Dashboard y Salud no necesitaron cambios de distribución. Se revisan sus controles y enlaces junto con las once tarjetas navegables. El antiguo StepWhatsAppSetup no está referenciado en el recorrido activo y no se contabiliza como pantalla actual.

## Verificación

Laboratorio de build de producción aislado, componentes reales, identidades y datos sintéticos, transporte de autenticación/base sustituido y red externa bloqueada. Las operaciones de formularios se rechazan sintéticamente; no usan hoteles ni proveedores públicos.

- Suite nueva de navegador: nombres accesibles y etiquetas asociadas en Dashboard, Inbox, Tickets, Reservas, Salud, Onboarding, PMS y Login; 1366/390, claro/oscuro. Tab, Mayús+Tab, Enter, Espacio, Escape, capas anidadas, borradores, errores y foco alternativo. Selector de hotel y once tarjetas. Panel no modal adicional a 1920.
- PMS: regresión de borrador y separación entre hoteles añadida a sus 10 grupos existentes (11 grupos).
- Regresiones existentes de temas/contraste y distribución: 24 pruebas en navegador. No se han cambiado sus expectativas.
- Checks críticos y sintaxis, build del Dashboard y `git diff --check`. Resultados finales y publicación se anotan debajo.
- HTTP Security tiene un fallo local heredado por CRLF: búsqueda literal de `.delete()\n    .eq('hotel_id', hotelId)`. El test y el archivo inspeccionado no se modifican para conseguir PASS. CI Linux debe ejecutar esta prueba realmente.

Se comprueba DOM/árbol accesible del navegador, nombres calculados y comportamiento real de teclado/foco. **No es una prueba con NVDA, JAWS o VoiceOver**, ni una certificación global de accesibilidad. Los avisos globales para lectores de pantalla permanecen como tarea separada.

## Publicación y preservación

Sin migración, cambios de permisos, configuración, flags ni llamadas a proveedores. Push y PR normales; integración solo con CI aprobado y sin revisión bloqueante. Vercel y Railway por sus mecanismos habituales. Comprobación pública exclusivamente mediante lectura y navegación autorizadas.

Inventarios, capturas y evidencias privadas quedan fuera de Git. Se conserva el inventario previo para contrastar después: 42 mensajes, 15 conversaciones pobladas y cinco vacías, seis respuestas de presentación; hotel técnico archivado/suspendido. No se cambia Guest Memory OFF ni SEND_AUTOMATIONS=false.

## Estado y cierre

Resultado local: ocho pruebas nuevas de navegador PASS; caso de acción anidada de Tickets repetido tras extenderlo, PASS; 24 regresiones existentes de temas/contraste y distribución PASS; 11 grupos PMS PASS; build completo y diff --check PASS. Los checks críticos afectados pasan (incluidos los adaptadores de pruebas que cargan los componentes reales); permanece el fallo local heredado CRLF de HTTP Security indicado arriba. La prueba y `dashboard/lib/demo.js` son idénticos a main.

Pendiente de registrar PR, SHA integrado, CI, versiones desplegadas y lectura pública al concluir esta misma pasada.

Texto de cierre limitado, aplicable una vez verificadas publicación y navegación pública:

> Corregidos y verificados los nombres de controles, la navegación por teclado y la gestión de foco y Escape en los recorridos principales revisados de Staynex, conservando distribución, temas y permisos. No equivale a accesibilidad completa; el sistema global de avisos para lectores de pantalla y las pruebas con lector de pantalla real siguen pendientes.
