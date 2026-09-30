# Daniel, punto 3: tarjetas de Tickets y Reservas

Base comprobada: `42259fab60a3fa1d7e539088b6d04fddb3ff945f` de origin/main. Rama `codex/tickets-reservations-metric-navigation`. Se conserva PR #32 y el informe anterior en `codex/dashboard-metric-navigation`, commit local `fafaa05`. No se incorpora organizaciones ni otros trabajos.

## Inventario real y contrato

Todas las cifras se limitan al hotel autorizado. Fuente: filas persistidas de `tickets` y `reservations` de cualquier origen, incluidas las sintéticas ya existentes. No se cuentan habitaciones, huéspedes ni conversaciones.

| Pantalla / tarjeta montada | Definición conservada | Destino en la propia pantalla |
| --- | --- | --- |
| Tickets / Riesgo urgente | Tickets con prioridad persistida urgent o `buildTicketCopilot().aiPriority.level=urgent`. Incluye cualquier estado, también completed. | `metric=urgent_risk` |
| Tickets / Satisfacción en riesgo | Tickets con `satisfactionRisk.level=high` calculado por el Copilot existente. Cualquier estado. | `metric=satisfaction_risk` |
| Tickets / Priorizados por IA | Tickets con prioridad de Copilot presente y distinta de low. Cualquier estado. | `metric=ai_prioritized` |
| Reservas / Reservas totales | Todas las reservas, incluidas canceladas y sin fechas. | `metric=total` |
| Reservas / Llegan pronto | Llegada entre la fecha local y siete días después, ambos inclusive; excluye cancelled/canceled/no_show/void. No exige estado upcoming. | `metric=arrivingSoon&date=AAAA-MM-DD` |
| Reservas / Alojados ahora | No cancelada ni explícitamente completed/checked_out/departed; llegada ≤ fecha local ≤ salida. | `metric=stayingNow&date=AAAA-MM-DD` |
| Reservas / Estancias completadas | No cancelada; estado completed/checked_out/departed o salida anterior a la fecha local. | `metric=completed&date=AAAA-MM-DD` |

El componente `TicketStatsCards` existe pero no está montado por la ruta actual de Tickets: no se añaden tarjetas teóricas de abiertos/en progreso/completados hoy/urgentes. El indicador urgente de la barra lateral conserva su definición distinta (prioridad urgent y open/in_progress). Los filtros reutilizados permiten acotar las tarjetas de Tickets por estado, prioridad y categoría, sin alterar su cifra base.

Los tres recuentos de Tickets son heurísticos locales existentes, sin modelo ni proveedor y sin periodo diario. Se corrige el título engañoso «Asistencia IA de hoy» a «Asistencia IA · estado actual». Se explicita que incluyen todos los estados. Las reservas antes usaban UTC/navegador y solo las primeras 100 filas; ahora las fechas emplean la zona persistida del hotel y la lectura completa del conjunto autorizado. Se conservan las reglas de estados y los extremos inclusivos; no se confunden con etapas de mensajes.

## Implementación

`shared/operational-metrics.js` comparte predicados de cifra/listado y valida métricas, fechas, hotel, páginas, tamaño y filtros adicionales. `dashboard/lib/operational-metrics.js` recorre páginas de 500 filas en servidor, calcula los criterios existentes y devuelve solo 10/25/50 registros. Carga el detalle y contexto necesario únicamente para esa página; el contexto similar del Copilot sigue consultando el conjunto del hotel. No descarga el inventario completo al navegador. No hay migración ni cambio de permisos, flags o proveedores.

Los endpoints actuales incorporan `view=metrics` para estas pantallas sin romper consumidores anteriores. Resuelven contexto `readOnly`, sin reconciliar invitaciones al consultar, y exigen el permiso de la pantalla y un hotel activo antes de leer. El identificador URL no concede acceso. Se mantienen las guardas existentes de hoteles archivados y soporte.

Tarjetas con enlaces reales, foco y teclado; filtro visible/removible, cantidades de registros y filtros adicionales explícitos; paginación, búsqueda y periodo en URL. Al pulsar una tarjeta se eliminan restricciones secundarias que ocultarían parte de su cifra. Los filtros adicionales posteriores muestran su efecto. Datos desconocidos/errores no se convierten en cero; un cero confirmado conserva enlace y vacío explicado. El hook compartido descarta respuestas de usuario, hotel o URL anteriores y limpia datos durante carga/error. Consultar nunca ejecuta cambios operativos.

Las consultas múltiples no se presentan como una instantánea transaccional. Se rechazan duplicados de paginación o cambios de pertenencia detectados al cargar detalles y se permite reintentar. Las cifras reflejan la consulta actual, sin forzar coincidencia con una lectura anterior. El coste del recorrido es proporcional al inventario del hotel; esta entrega no acredita ni pretende resolver el pendiente general de latencia.

## Verificación

Ocho grupos de comportamiento en `test:operational-metric-navigation`, integrado en Critical tests and syntax: siete tarjetas reales, estados incluidos/excluidos, zona/medianoche/DST, URL/combinaciones, 1.207 registros por pantalla, fallo parcial/cambio de pertenencia/cero/recuperación, handlers reales con permisos y hotel manipulado, callback real con error/reintento y respuestas antiguas. Transportes sintéticos, sin proveedores ni datos remotos de prueba. Sin SQL nuevo: se preserva la suite PostgreSQL existente en CI.

Regresiones existentes ejecutadas mediante `ci:critical`: pasan hasta el fallo local ya conocido de HTTP Security (`test-http-security.js:540`, literal LF frente a CRLF). No se modifica su expectativa y se exige ejecución Linux de CI. Sintaxis, autorización/contexto (incluido hotel archivado), diez grupos de mensajes de PR #32 y build pasan. Los fallos estáticos heredados de PMS/permisos y post-login documentados anteriormente no se presentan como corregidos.

Laboratorio aislado con componentes, endpoints y loader reales, autenticación y transporte de datos sintéticos, sin credenciales: Tickets 67, tarjetas 17/34/51; Reservas 137, tarjetas 137/78/37/11 para 30-09-2026 Europe/Madrid. Evidencias de navegador y revisión final de producción quedan en el inventario privado, fuera de Git.

## Publicación y recuperación

Push/PR, tres jobs del SHA final y revisiones no bloqueantes, merge normal, CI de main y versiones activas de Vercel/Railway. Verificación pública exclusivamente de lectura con cuenta/hotel existentes. No requiere migración, pausa, configuración ni acción de proveedores. Recuperación mediante revert de código con CI; no restaura ni modifica datos. Se conservan Guest Memory OFF, SEND_AUTOMATIONS=false, demo y hotel técnico lifecycle archivado.

Pendiente de añadir PR/SHA, resultados finales, despliegues, conservación y comprobación pública.

## Inventario restante

Continúan pendientes otros agregados de Platform, Automatizaciones, analítica/revenue, Salud y otros módulos. No se han añadido indicadores económicos/porcentajes sin desglose. La navegación de las cuatro tarjetas de mensajes de PR #32 permanece corregida. El punto 3 completo sigue abierto; el cierre de esta entrega solo puede nombrar las tres tarjetas enumeradas de Tickets y las cuatro de Reservas.
