# Dashboard: mensajes, tickets pendientes y servicios

Base: `65b9c7d399a6f5ee2e91a0e9c2f6899e650013df` (origin/main comprobado el 2026-10-05).
Rama: `codex/dashboard-pending-tickets`.

## Comportamiento

Se conservan la cabecera, las cuatro tarjetas de mensajes, sus destinos y el selector `attentionOrigin`. Debajo aparecen Mensajes a la izquierda y Tickets pendientes a la derecha. El mismo componente de servicios se presenta una sola vez, al final y a todo el ancho: cuatro columnas en escritorio, dos en anchos intermedios y una en móvil. No se cambian los criterios de Salud ni la distribución de Inbox, Tickets o Reservas.

La nueva lectura exige el permiso existente `tickets` y el hotel autorizado por el servidor. Incluye exclusivamente `open`, `pending` e `in_progress`; excluye `completed`, `resolved`, `closed`, `cancelled` y estados desconocidos. Recorre páginas de 500 filas antes de contar, ordenar o limitar. El total representa todos los pendientes del origen seleccionado; se muestran como máximo cinco.

Orden: prioridad efectiva urgente > alta > normal > baja, fecha de creación descendente y UUID ascendente como desempate estable. La prioridad efectiva conserva la asignación guardada y la eleva cuando el copilot actual de Tickets detecta una prioridad mayor. No se escriben prioridades ni se invoca IA. «Nuevo» significa fecha de creación entre el instante de lectura menos 24 horas y el instante de lectura, ambos incluidos; no significa sin leer. Fechas futuras o inválidas no reciben esa marca.

Los tickets tienen un selector propio: «Sin marca de simulación» / «SIMULADO». Se reutilizan las identidades sintéticas reservadas y las marcas canónicas del mensaje fuente; sin fuente válida se comprueba la conversación. La ausencia de marca no se presenta como prueba de que el dato sea real. Cambiar este selector no cambia el origen de las cuatro tarjetas de mensajes. No se clasifican hoteles por su nombre ni se modifican registros históricos.

Cada fila es un enlace nativo al ticket correcto. «Ver todos los pendientes» usa la pantalla existente y el mismo criterio de estados/origen. El retorno explícito al Dashboard conserva el hotel y ambos selectores mediante parámetros limitados a valores admitidos. La lectura del detalle ahora resuelve contexto con `readOnly: true`, sin procesar invitaciones, y rechaza contextos denegados.

Carga independiente, actualización visible sin retirar datos válidos del mismo contexto, timeout de 15 segundos y reintento. Un error no se convierte en un cero; un 401/403, una respuesta de otro hotel o un cambio de identidad/contexto retiran el contenido anterior. Se descartan respuestas antiguas mediante generación, cancelación y comparación de contexto. El total es el resultado del recorrido de lectura; no se promete una instantánea transaccional de varias consultas concurrentes. Duplicados o errores parciales invalidan la lectura.

## Validación local

- Seis grupos de comportamiento: 1.207 tickets, prioridad fuera de la primera página, total completo, desempate, tres estados pendientes, exclusiones, límite de 24 horas, simulados, aislamiento, fallo parcial y recuperación; handlers reales de colección y detalle, permisos y contexto de solo lectura.
- Ocho pruebas de navegador con build de producción y transporte sintético: 1920×1080, 1366×1080 y 390×844, claro/oscuro; cinco filas, orden, total, enlaces y retorno, teclado, selectores independientes, carga lenta, error/reintento, vacío, denegación y respuesta tardía tras cambiar de hotel. Todas PASS. Dimensiones efectivas y desbordamiento horizontal cero registrados.
- Comparación anterior con el build sin cambios de main en las mismas seis combinaciones. Capturas de cabecera, paneles y franja de servicios conservadas fuera de Git, junto con las capturas públicas previas.
- Build de producción y `git diff --check`: PASS. Sintaxis: 408 archivos comprobados. Regresiones operativas y de navegación: PASS.
- Suite crítica ejecutada hasta HTTP Security. Los grupos anteriores pasan; permanece la discrepancia local heredada de CRLF en la búsqueda literal LF de `dashboard/lib/demo.js`, documentada en la revisión anterior. No se cambian expectativas; el checkout Linux de CI debe ejecutar esta prueba correctamente.
- CI incorpora los seis grupos al job crítico y las ocho pruebas de navegador al job Dashboard, con artefactos sintéticos. Mantiene PostgreSQL desechable y proveedores bloqueados en las regresiones existentes.

Las pruebas de teclado y nombres accesibles no equivalen a una prueba con lector de pantalla ni a accesibilidad completa. Los escenarios de volumen, error, cambio de hotel y tickets recientes son sintéticos; no se fabrican en producción.

## Publicación y límites

Sin migraciones, cambios de permisos, variables, datos operativos, limpieza ni llamadas a proveedores. Se conservan Guest Memory OFF, SEND_AUTOMATIONS=false, los controles humanos y los tickets/mensajes de la demo. Los inventarios, capturas públicas y respaldos permanecen fuera de Git.

Secuencia: PR y comprobación de logs del SHA final; merge normal con checks aprobados y sin revisión bloqueante; comprobar CI de main, Vercel Production y Railway; recorrer el Dashboard público autenticado, el detalle y el listado filtrado mediante lectura. El despliegue por sí solo no acredita la navegación pública. Los identificadores y resultados definitivos se añaden al cierre tras comprobarlos.
