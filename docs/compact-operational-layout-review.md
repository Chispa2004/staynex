# Distribución compacta de páginas operativas

## Alcance y base

Rama `codex/compact-operational-layout`, desde `origin/main b6ff5eabe1d72ee7019d69c194b71ce5b17f7dd8`, comprobado el 1/10/2026. El cierre documental previo `2536b25` y la rama de organizaciones siguen conservados. No se incorporan cambios de organizaciones, contratos de datos, permisos, proveedores, flags ni SQL.

Se revisaron 25 pantallas existentes, además de Dashboard e Inbox. La lista explícita de `dashboard/lib/compact-routes.js` aplica la variante a 24 pantallas y al alias `/dashboard/settings/knowledge`. Monitorización de Platform conserva su distribución: ya presenta información útil sin la acumulación observada. Guest Memory permanece OFF; no se habilita para revisarlo. Rutas dinámicas de detalle y módulos no enumerados mantienen su shell anterior.

Exclusiones: `/dashboard` y `/dashboard/inbox`, también con filtros, conversación, Asistencia IA y menú móvil. No se modifica `globals.css`, sus componentes ni sus consultas. La tarea anterior de accesibilidad no se declara completada por este cambio.

## Diagnóstico y corrección

A 1366 × 768, el estado público anterior de Tickets situaba el primer ticket a unos 904 px. El espacio provenía de la fila independiente de tema/idioma, el aviso administrativo, márgenes del título, métricas, explicación del filtro y tres separaciones antes de la tabla.

- Shell compacto optativo: contexto del hotel y administración interna, retorno a Platform, tema e idioma en una franja; título y separación entre secciones más próximos. Avisos de soporte, preparación, errores y suspensión permanecen completos.
- Tickets: métricas más bajas; resumen, ayuda desplegable nativa, filtros y paginación en un mismo bloque. Se conservan filtro, cantidad, alcance y retirada; teclado abre/cierra la ayuda. Padding de tabla reducido, sin nuevos recortes ni alturas fijas. La tabla amplia conserva su desplazamiento horizontal interno y región accesible con teclado; no ensancha la página.
- Reservas: cuatro métricas compactas, dos columnas en móvil, resumen y controles integrados. Se preservan búsqueda, selección, detalle y paginación. El vacío «Próximas» no se sustituye ni se cambian registros.
- Automatizaciones: se corrigió además el desbordamiento observado del distintivo Preview en las métricas, manteniendo visibles el valor, etiqueta y estado.

No se reduce la tipografía de cuerpo ni de controles. No hay escalas, zoom CSS, márgenes negativos ni alturas rígidas para ocultar contenido. Se conservan los once destinos de métricas y su significado.

## Evidencia comparable

Builds de producción, datos sintéticos fijos y proveedores/red externa bloqueados. Fecha de la fixture: 2026-10-01; misma zona Europe/Madrid, sesión sintética, filtros, viewport, fuentes cargadas y scroll inicial cero. La autenticación sintética no acredita autenticación remota. Matriz: 1366×768, 1280×720, 1920×1080 y 390×844, en claro y oscuro, zoom 100 %. Se registran geometría y capturas de cada pantalla en el directorio privado `.npm-cache/compact-operational-layout/{before,after}`.

La tabla siguiente mide el espacio previo al título y al primer bloque útil (métricas, controles o formulario). En Tickets se mide la primera fila; `reservations-empty` mide el texto del vacío. La variante sintética vacía conserva `metric=upcoming&date=2027-01-01` en ambos builds, además del caso con datos. La comprobación pública mantiene el filtro y la fecha públicos originales.

| Ruta | Título antes → después | Inicio útil antes → después |
|---|---:|---:|
| `/dashboard/tickets` | 214 → 104 px | 908 → 525 px |
| `/dashboard/reservations` | 214 → 104 px | 314 → 184 px |
| `/dashboard/health` | 214 → 104 px | 314 → 192 px |
| `/dashboard/automations` | 214 → 104 px | 314 → 192 px |
| `/dashboard/settings/users` | 214 → 104 px | 314 → 192 px |
| `/dashboard/knowledge` | 214 → 104 px | 314 → 192 px |
| `/dashboard/settings/pms` | 186 → 88 px | 282 → 188 px |
| `/dashboard/onboarding` | 224 → 122 px | 348 → 234 px |
| `/dashboard/housekeeping` | 214 → 104 px | 314 → 192 px |
| `/dashboard/maintenance` | 214 → 104 px | 314 → 192 px |
| `/dashboard/settings/academy` | 214 → 104 px | 314 → 192 px |
| `/settings` | 214 → 104 px | 314 → 192 px |
| `/platform/hotels` | 120 → 88 px | 220 → 176 px |
| `/dashboard/reception` | 214 → 104 px | 338 → 216 px |
| `/dashboard/experience-bookings` | 214 → 104 px | 314 → 192 px |
| `/dashboard/qr-rooms` | 234 → 144 px | 358 → 256 px |
| `/dashboard/local-knowledge` | 214 → 104 px | 314 → 192 px |
| `/dashboard/upsells` | 214 → 104 px | 314 → 192 px |
| `/dashboard/experiences` | 214 → 104 px | 314 → 192 px |
| `/dashboard/analytics` | 214 → 104 px | 314 → 192 px |
| `/dashboard/ai-logs` | 214 → 104 px | 314 → 192 px |
| `/dashboard/simulation` | 214 → 104 px | 314 → 192 px |
| `/platform` | 120 → 88 px | 220 → 176 px |
| `/platform/providers` | 120 → 88 px | 244 → 200 px |
| `reservations-empty` | 214 → 104 px | 951 → 587 px |

A 1366×768, Tickets pasa de 908 a 525 px en la fixture; la segunda fila comienza aproximadamente en 675 px. Se ve la primera fila completa y el inicio de la segunda; no se afirma que quepan completas todas las filas de contenido extenso. Reservas vacío pasa de 951 a 587 px y queda visible sin desplazamiento. En móvil se conserva el desplazamiento natural, con controles adaptables y texto completo.

La comprobación de desbordamiento usa el ancho real del cuerpo y del contenedor principal: Chromium puede incluir la anchura de una tabla con scroll interno en `documentElement.scrollWidth` incluso estando contenida. No se ocultan fallos ni se excluyen controles para aprobar.

## Pruebas y publicación

- Nuevas regresiones en `test:density-browser`, paso **Production density and excluded-layout regressions** del job **Dashboard build**: matriz de ocho combinaciones, posiciones útiles, ausencia de desbordamiento del contenedor, exclusiones, filtros/paginación/búsqueda, ayuda por teclado, fallo visible y recuperación; navegación de las once tarjetas.
- La comparación local adicional contra el build anterior exige igualdad de posiciones, tamaños y nombres de controles de Dashboard e Inbox. Se esperan fuentes, carga y transición del diálogo antes de medir; no se comparan estados de carga con estados terminados.
- Las 14 regresiones existentes de temas/contrastes/formularios/menús/diálogos se conservan. Los dos arneses unitarios del shell importan la nueva función real de selección de rutas; sus expectativas no cambian.
- Build completo local PASS. Batería crítica local: llega al fallo heredado de HTTP Security por CRLF (`.delete()\n...eq`); no se cambian expectativas. El checkout Linux de CI debe acreditar su resultado. No se declara PASS local de ese test.
- Publicación autorizada: push, PR, checks requeridos y revisión, merge normal, CI de main, Vercel Production y salud/versiones Railway. Sin migraciones, cambios de variables, permisos ni operaciones funcionales de escritura.

Las capturas autenticadas, inventarios y huellas permanecen privados, fuera de Git. Antes de publicar: 42 mensajes, 20 conversaciones (15 pobladas/5 vacías), seis respuestas de presentación, hotel técnico lifecycle archivado. Se contrastarán las filas después de la lectura pública. Guest Memory OFF y SEND_AUTOMATIONS=false deben mantenerse.

Resultado local final: matriz de ocho combinaciones PASS; comparación estable de las exclusiones PASS; diez regresiones nuevas PASS (incluyen navegación y cifras de las once tarjetas), catorce regresiones existentes de tema/contraste PASS; sintaxis de 386 archivos PASS, build completo PASS y diff --check PASS. La fixture fija también el reloj del lector de métricas de mensajes para evitar comparar su hora real con los mensajes sintéticos. Publicación y lectura pública pendientes de incorporar al cierre.
