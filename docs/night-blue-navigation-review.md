# Navegación Azul noche

Base: `dec07e5b286d22e8843c0296b1976c0a4dc98cc9` (PR #52). Rama: `codex/night-blue-navigation`.

## Cambio acotado

Paleta de tema claro definida una sola vez en `dashboard/app/globals.css`: lateral `#14243B`, activo `#243D5B`, hover `#1D334E`, texto `#F8FAFC`, secundario/iconos `#BED0E5`, borde `#526D8C`, indicador y foco sobre azul `#6EE7B7`; cabecera `#F1F5F9`, texto `#14243B`, secundario `#465A70`, borde `#D5E0E9`. Botones de cabecera y desplegables mantienen superficies blancas. Contadores conservan colores semánticos.

`AppShell` aplica la paleta al logo, grupos, enlaces activos, controles de plegado, selector, retorno a Platform, logout, scrollbar y navegación móvil. Los estados activos conservan `aria-current` y el indicador lateral. Se sustituye únicamente la rama de estilos clara de cada elemento; no se alteran handlers, permisos ni transporte.

Cabeceras existentes: `OperationalHeader` de `ExecutiveDashboardClient` / `HotelOperations.module.css` (saludo, fecha, demo, actualizar, tema, idioma y avatar); `AppShell` (móvil, barra compacta operativa/Platform y contexto de Inbox). Las cabeceras de contenido `PageHeader` y de conversación de Inbox se conservan. El avatar actual es informativo, no existe menú de usuario que abrir. No se añade ninguno.

`HotelWorkspaceSwitcher` recibe una variante de presentación explícita para su botón en el lateral. Sus desplegables, formularios y permisos siguen siendo los existentes. Se corrige el selector CSS del desplegable compacto: apuntaba a `role=listbox`, pero el componente utiliza `role=group`; se reproducía un menú de 55 px y se restablecen los 260 px ya previstos. En Inbox compacto, el desplegable de idioma comenzaba en x=-77,25 px; se alinea con su control para mantenerlo dentro de la pantalla. Se retiran las sombras claras que generaban un halo sobre el lateral azul en el control de tema y en el selector desplegado.

No se cambian ancho del lateral, alturas, distribución, métricas, Inbox, estados de Tickets, contenido central, APIs, SQL, dependencias ni configuración. Los tokens y clases del tema oscuro se conservan, salvo la corrección del ancho del desplegable, aplicable a ambos temas.

## Evidencia y límites

Capturas y pruebas: builds de producción del laboratorio existente, autenticación/identidades/datos sintéticos y transporte externo bloqueado. Nunca son evidencia de una sesión pública real. Los archivos de evidencia permanecen en `.npm-cache` fuera de Git.

Las doce regresiones nuevas usan Chromium a 1920, 1366 y 390 px en ambos temas: colores computados, contraste de textos e iconos, marcador activo, hover, foco, submenús, lateral compacto, desplegable de hotel, estado deshabilitado, Escape anidado, devolución de foco, ausencia de overflow y persistencia del tema. Se incorporan al job Dashboard después del build aislado ya existente. La medición nueva se limita al chrome identificado explícitamente, sin reducir las pruebas generales de contraste existentes.

Hallazgo separado sin modificar: el título de contenido «Workspaces Platform» utiliza `#0A66FF`, con 4,35:1 en claro y 4,08:1 en oscuro (requisito 4,5:1). Esa clase y sus fondos ya existen en la base y quedan fuera de este cambio de navegación/cabeceras.

Fallo local heredado: HTTP Security compara literalmente LF en `dashboard/lib/demo.js`; un checkout CRLF falla esa aserción estática. Misma prueba sin cambios con contenido LF: PASS; se restituyen los bytes originales. CI Linux debe confirmar el control sin excepciones.

La automatización pública integrada no ha podido arrancar: `windows sandbox failed: helper_unknown_error: setup refresh had errors`, reproducido tras reiniciar el kernel. Esto no equivale a un fallo de Staynex ni permite confirmar la sesión o el recorrido público de PR #52. No se extraen cookies ni se sortean controles. Los despliegues pueden comprobarse mediante metadatos GitHub y lectura HTTP, separadamente de la verificación funcional autenticada.

## Publicación y recuperación

PR y merge normal únicamente con CI final aprobado y sin revisión bloqueante. No migraciones, cambios de flags, roles o datos. Vercel/Railway siguen sus despliegues automáticos habituales. Verificar SHA, estado del despliegue y salud HTTP. Completar la lectura pública autorizada cuando vuelva a estar disponible la herramienta de navegador: Platform → Hoteles → Entrar al workspace → Dashboard → Inbox → Volver a Platform; claro/oscuro y menú móvil. Una recuperación de este cambio visual revierte sus estilos/atributos de presentación, sin cambios de catálogo ni datos.

Resultados locales acreditados: 10/10 pruebas iniciales nuevas, 4/4 del recorrido PR #52, build de producción y diff --check PASS. Suite crítica: sintaxis y todos los grupos funcionales PASS; última aserción HTTP Security CRLF falla como se documenta arriba y pasa con LF. Regresiones existentes de temas, distribución y accesibilidad y publicación: en curso.


Ajuste del ensayo existente de accesibilidad: al cambiar de día a 2026-10-09, el test de teclado buscaba una reserva futura con el reloj real, mientras el fixture congela sus reservas en 2026-10-01. Se reprodujo una tabla legítimamente vacía (0 reservas) y timeout al buscar un botón de fila. El caso fija ahora únicamente su reloj del navegador en la fecha del fixture, conservando todas las aserciones de teclado, errores y recuperación; no modifica la aplicación ni inventa filas remotas.
