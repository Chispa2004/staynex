# Daniel, punto 3: cuatro tarjetas de mensajes → Inbox

Base: `origin/main` `1abf4bc74e264a5f244a5447d12b252c0eb2877d`. Rama: `codex/dashboard-metric-navigation`. No existía una rama local/remota ni commits identificados con ese nombre al iniciar. Se reutiliza el checkout libre conservando la rama y el informe local `bb67303` de carga progresiva. No se incorpora organizaciones/PR #11.

## Contrato y destino

Unidad: **mensajes entrantes elegibles**, no conversaciones. Hotel autorizado en servidor. Origen explícito `traced`, `simulated` o `unknown`: simulación según metadata canónica; trazable exige un claim Twilio del mismo hotel con SID; el resto no confirmado. Elegibilidad excluye las claves técnicas `system_event`, `preview`, `draft`, `translation_only`, `automation_type`, incluso si su valor es falso.

| Tarjeta | Definición conservada | Filtro y destino |
| --- | --- | --- |
| Recibidos | Entradas elegibles creadas en la fecha local del hotel, sin fechas futuras. Incluye históricos de ese día aunque no tengan seguimiento. | `/dashboard/inbox?metric=received&metricOrigin=…&hotelId=…&metricDate=AAAA-MM-DD` |
| Resueltos | Actualmente resueltos, con la última marca de atención en esa fecha local y no futura. No se deduce de entrega ni respuesta IA. | Igual, `metric=resolved`, fecha explícita |
| Pendientes | Estado efectivo `pending`, inclusión v1 o seguimiento explícito, creación no futura; sin límite diario. | Igual, `metric=pending`, sin fecha |
| Urgentes | Pendientes cuya alerta `urgent` se actualizó entre la creación del mensaje y la lectura actual. Alerta sin fecha o futura conserva desconocido. | Igual, `metric=urgent`, sin fecha |

«Hoy» usa la zona horaria persistida del hotel. Los enlaces diarios fijan su fecha para que medianoche/atrás/recarga no cambien silenciosamente el periodo; el estado de atención se vuelve a leer. Zona inválida/ausente deja desconocidas las cifras diarias. Se aclara el texto genérico anterior que excluía todos los históricos: esa exclusión no correspondía al SQL de recibidos. No se alteran las reglas de inclusión.

`shared/message-attention/metrics.js` contiene el predicado usado por ambos endpoints, el contrato URL y la selección de identidades. `dashboard/lib/message-metrics.js` pagina todas las fuentes, usa `staynex_attention_read_v1` para estados/versiones/fechas efectivos y comprueba el contrato habilitado mediante la RPC de Dashboard existente. No lee directamente la tabla privada `message_attention`, no amplía permisos ni requiere SQL nuevo. El listado de muestra de Dashboard mantiene `staynex_attention_dashboard_v2`; sus cuatro totales usan el mismo conjunto que Inbox.

## Navegación y autorización

Las cuatro tarjetas son enlaces con foco visible; desconocidos/carga no se presentan como ceros navegables. El selector de origen se conserva en URL y retorno. El antiguo filtro de muestra urgente sigue disponible como botón «Solo urgentes» dentro del bloque Mensajes.

Inbox devuelve el total de mensajes, conversaciones e IDs coincidentes. Solo carga el contexto completo de esas conversaciones; la presentación pagina 25 conversaciones después de completar todas las lecturas. La etiqueta de coincidencia no oculta respuestas ni mensajes fuera del criterio. Los filtros adicionales son visibles y combinan etapa/origen sobre los mensajes coincidentes; la búsqueda consulta el contexto de la conversación. Sus totales visibles se distinguen del total de la tarjeta. Retirar filtro conserva hotel, elimina los filtros asociados y vuelve al Inbox general. No se heredan filtros guardados.

Los endpoints resuelven usuario, hotel y permiso con contexto `readOnly`, evitando la resolución de invitaciones como efecto de esta lectura. El filtro de URL no concede acceso. Se rechazan alcance manipulado y resultados de hotel distinto. Se mantienen restricciones de archivo, soporte y operación. Las respuestas anteriores a otro filtro/hotel/sesión se descartan; el conjunto filtrado no sobrescribe los indicadores globales de Inbox. Abrir una conversación conserva el comportamiento local de leído, sin resolver mensajes, tomar control ni llamar a proveedores.

Errores de fuentes, contrato o lectura parcial se propagan: no confirman cero. Si desaparece contexto coincidente entre las lecturas, se pide actualizar. No se promete una transacción única entre todas las consultas: el resultado tiene momento de lectura y se actualiza al abrir/refrescar, sin forzarlo a la cifra vista antes. Se conserva la carga progresiva del shell. La lectura exhaustiva tiene coste proporcional al historial; no se declara resuelta la latencia independiente de indicadores ni la espera aislada de Inbox.

## Pruebas y revisión local

- `test:dashboard-metric-navigation`: 10 grupos de comportamiento: cuatro enlaces, identidades y contexto, zonas y límites de fecha/DST, semánticas separadas, orígenes/históricos, filtros inválidos/cero/error, combinación/retirada, 3.105 mensajes y lotes RPC, handler real con autorización, callbacks reales con error/reintento y respuestas antiguas. Transportes sintéticos, sin proveedores.
- `test:dashboard-metric-postgres`: cinco grupos sobre PostgreSQL 17.10 desechable con red `none`. Extrae y ejecuta las funciones SQL versionadas sin modificarlas; compara los cuatro recuentos con las tres fuentes en Madrid, Nueva York y Kiritimati, sobre 601 mensajes; también alerta incierta y contrato deshabilitado. No prepara ni ejecuta migraciones remotas.
- Ambas suites están incorporadas a los jobs correspondientes del CI. Se adapta únicamente el contexto del harness previo de Inbox a los nuevos bindings; conserva todas sus aserciones. Se mantienen las regresiones de carga progresiva, autorización, onboarding, PMS, lifecycle, Salud, memoria OFF y envíos.
- Navegador aislado, componentes reales, loader de métricas y handler Inbox reales con transporte de datos sintético: 29/28 recibidos, 6/6 resueltos, 24/23 pendientes, 4/3 urgentes; segunda página/recarga, retorno con SIMULADO, retirar/atrás, teclado Enter, cero trazable, historial completo y dos coincidencias en una conversación. Revisión 1366×900 y 390×844, sin desbordamiento horizontal.

Build y sintaxis se comprueban sobre el resultado final. Se preservó fuera de Git una salida `.next` antigua con un enlace inválido de OneDrive y se hizo build limpio. El fallo local conocido de HTTP Security por literal LF frente a CRLF se mantiene separado; el checkout Linux de CI debe ejecutar la prueba sin cambiar expectativas. Los fallos estáticos adicionales de permisos/PMS y post-login documentados en la base no se presentan como corregidos en esta tarea.

## Publicación, recuperación y conservación

Publicar rama/PR; esperar los tres jobs del SHA final y revisar logs de ambas suites; merge normal sin bloqueo de revisión; CI de main y versiones Vercel Production/Railway; comprobar las cuatro tarjetas públicamente mediante navegación y lectura. No hay migración, cambios de variables/permisos, datos sintéticos remotos ni nuevos proveedores. Recuperación: revertir el código con CI habitual; no requiere restaurar datos ni modificar contratos SQL. No ejecutar operaciones inciertas ni cambios de seguimiento para fabricar resultados.

Inventarios y capturas privadas quedan fuera de Git. Baseline de conservación: 42 mensajes, 20 conversaciones (15 pobladas y cinco vacías) de la demo; seis respuestas de presentación incluidas en ese historial. Se compararán filas completas, no solo cantidades. Guest Memory OFF, `SEND_AUTOMATIONS=false` y hotel técnico lifecycle archivado se mantienen.

## Inventario breve que sigue pendiente

Este cambio no implementa la navegación de otras métricas: agregados de Platform (hoteles, atención, reservas, IA, revenue, PMS, catálogo y WhatsApp); tarjetas de Automatizaciones (certificados, previews, programados, fallidos/configurados); analítica/revenue; recuentos y cobertura de Salud; indicadores de reservas/tickets y otros módulos. Deben revisarse por separado con unidad, periodo, permiso y destino propios. Este inventario no es una nueva auditoría ni una declaración de defectos probados en todas esas tarjetas.

## Resultado de publicación

Pendiente de incorporar PR, SHA, CI, despliegues y verificación pública. El cierre autorizado es exclusivamente: **«Cuatro tarjetas de mensajes del Dashboard navegables hacia sus resultados correspondientes»**. El punto 3 completo sigue abierto.
