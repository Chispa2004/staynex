# Selección de tema y contraste — punto 4 de Daniel

## Base y diagnóstico

Base comprobada: `origin/main f8876af7ab7e278b628a2e191ba97f7a48f4fd1e`. Rama `codex/theme-selection-contrast`. Se conserva PR #33 y su cierre documental local `765187b`, además de los inventarios privados. No se incorpora organizaciones.

La descripción histórica sigue teniendo dos causas concretas: Tailwind genera `dark:` mediante `prefers-color-scheme` al faltar `darkMode`; el proveedor no establece `.dark`. Una sonda visible compilada con la configuración original reproduce la contradicción sistema/selección. Esto no implica que todas las pantallas estuvieran gobernadas por el sistema: muchos componentes ya elegían clases mediante React. Inbox sí imponía explícitamente claro, ocultaba el selector y tenía su propia paleta clara. Reproducción pública: seleccionar oscuro y entrar en Inbox volvía a claro.

Además, el proveedor arrancaba en oscuro y recuperaba la preferencia después del primer render. Reglas globales existentes y colores locales provocaban contrastes insuficientes medidos.

## Corrección

- Tailwind usa clase; un bootstrap anterior al pintado y el proveedor comparten la selección persistida. Se conserva la clave de almacenamiento. Claro es el valor inicial sin preferencia; oscuro guardado se respeta. No existe ni se añade opción Sistema.
- Inbox usa la misma selección y muestra el selector, incluso en navegación compacta/móvil. Su paleta se expresa mediante variables para ambos temas; se conserva distribución y comportamiento.
- La primera presentación es una envoltura neutral que usa el tema recuperado. La sesión, el hotel y sus permisos siguen verificándose antes del contenido protegido. No se adelanta su montaje. Estados de carga y error usan el tema.
- Se corrigen colores observados, placeholders, límites de campos, foco, indicador de navegación y avisos. Se ajustan reglas `!important` ya existentes sin añadir otra capa de ellas. La etiqueta Claro/Oscuro y su acción usan las traducciones existentes.
- No cambia ningún endpoint, dato, autorización, flag, requisito live ni operación funcional.

## Matriz comprobada con producción local

| Sistema | Selección | Base: sonda Tailwind | Resultado nuevo, recarga/entrada/navegación |
|---|---|---|---|
| Claro | Claro | Claro | PASS claro |
| Claro | Oscuro | Claro incorrecto | PASS oscuro |
| Oscuro | Claro | Fondo oscuro/texto oscuro incorrectos | PASS claro |
| Oscuro | Oscuro | Oscuro | PASS oscuro |

La sonda es una fixture y no se publica en la aplicación. Las páginas reales usan los componentes y CSS compilados del producto, transportes de autenticación y datos sintéticos, y salida externa bloqueada. Se prueban también cambio del selector, persistencia, almacenamiento no disponible y primer HTML con scripts de hidratación bloqueados. Ningún contenido protegido aparece durante la espera de autorización.

## Contrastes

Valores calculados en Chromium a partir de `getComputedStyle`, tamaño/peso efectivos y composición de colores alfa. Para gradientes se toma la cota conservadora entre sus paradas, no se deducen colores de clases ni de una captura. Se espera el contenido y el fin de su presentación. Texto normal requiere 4,5:1; grande, 3:1 solo desde 24 px o 18,667 px y peso 700. Controles/foco comparados requieren 3:1 respecto de los colores adyacentes.

La base de laboratorio usa los archivos originales de main y el mismo conjunto sintético. Los hallazgos públicos originales se conservan privadamente; no se incluyen nombres, capturas autenticadas ni inventarios en Git.

| Elemento / tema | Tamaño y peso | Antes | Después |
|---|---|---:|---:|
| Placeholder PMS claro | 14 px / 400 | 2,56 | 6,06 |
| Placeholder PMS oscuro | 14 px / 400 | 2,31 | 8,95 |
| Aviso error PMS oscuro (fallo simulado) | 14 px / 400 | 3,94 | 10,04 |
| Riesgo medio/Alta Tickets claro sobre fondo compuesto | 11 px / 600 | 4,37 | 6,17 |
| Nota operativa de alerta Tickets claro | 12 px / 400 | 4,46 | >=4,5 |
| Llegada/Salida Reservas móvil claro | 11 px / 600 | 3,67 | >=7,79 |
| Llegada/Salida Reservas móvil oscuro | 11 px / 600 | 3,87 | >=6,46 |
| Sin conversación todavía, Reservas oscuro | 14 px / 400 | 2,28 | >=6,98 |
| Secure access login oscuro | 12 px / 600 | 3,96 | 10,58 |
| Botón Login claro | 14 px / 600 | 3,70 | 4,82 |
| Placeholder login claro / oscuro | 14 px / 400 | 2,56 / 2,35 | 6,06 / 9,08 |
| Borde campo PMS claro / oscuro | control | 1,34 / <3 | 4,76 / 6,40 (interior), 4,76 / 6,96 (exterior) |
| Foco campo PMS claro / oscuro | control | insuficiente en claro | 5,00 / 12,50 |
| Borde buscador Inbox claro / oscuro | control | tenue | >=4,55 / >=6,38 |
| Marca de navegación seleccionada claro / oscuro | estado | tenue en claro | 5,21 / 11,05 |

Inbox público anterior: placeholder 2,54; contexto administrativo 4,41; ayuda vacía 3,86. En oscuro, retorno a Platform 2,80. Correcciones con variables de texto y fondo; sus valores públicos posteriores se documentarán tras el despliegue. Asistencia IA se prueba en ambos temas, con alerta operativa y diálogo opaco.

Los textos normales en las ocho pantallas sintéticas pasan; mínimo observado 4,82:1. Se excluyen únicamente elementos ocultos/aria-hidden, iconos decorativos duplicados y controles realmente deshabilitados, no información operativa. Se prueba el control activo de login tras finalizar la consulta de sesión. Esta revisión acotada no acredita toda la accesibilidad ni todos los estados posibles de Staynex.

## Regresiones y comprobaciones

- `test:theme-browser`: 14 pruebas sobre build de producción; matriz 4 combinaciones, 8 pantallas a 1366 y 390, formularios, diálogos PMS/Asistencia IA, fallo de guardado sintético, menú de idioma, teclado, Escape y restitución del foco, bordes/foco/estado seleccionado. API de escritura y proveedores bloqueados.
- CI: paso **Production theme and contrast regressions** del job **Dashboard build**, después del build real. Evidencia exclusivamente sintética en artefacto de siete días. Se conservan los jobs Critical y PostgreSQL y todas sus expectativas.
- Local: build real final PASS, build sintético PASS, 14 casos PASS, 11 grupos de carga progresiva PASS, sintaxis (381 archivos) PASS y `git diff --check` PASS.
- `ci:critical` local recorre las regresiones existentes y termina en el fallo heredado de HTTP Security: una búsqueda estática espera LF en `.delete()\n...eq` y este checkout usa CRLF. No se cambia la prueba ni se declara PASS local. El checkout Linux de CI debe confirmar el resultado real.
- El primer intento de build encontró EINVAL de OneDrive al leer una caché `.next` existente; el build final usa un directorio de salida nuevo. Windows requirió cerrar el proceso local de prueba después de terminar los casos; no se detuvo ningún servicio desplegado.

## Publicación y comprobación pendiente

Publicar únicamente esta rama, verificar los tres jobs y los logs de las 14 regresiones para su SHA, revisar bloqueos y hacer merge normal. Sin migraciones, variables ni cambios de permisos. Verificar CI de main y SHA activo en Vercel Production y Railway.

La comprobación pública será autenticada y exclusivamente de lectura, navegación y selector reversible. Preferencia inicial: claro. Verificar ambos temas, recarga, navegación y pantallas accesibles en 1366/390, restaurar claro. Las cuatro preferencias de sistema se emulan únicamente en el laboratorio; no se cambiará el sistema operativo. Login se prueba anónimamente en laboratorio: visitar login con una sesión pública puede resolver invitaciones y queda fuera de la comprobación pública de lectura.

Contrastar las huellas privadas antes/después de la demo, configuración y accesos: 42 mensajes, 15 conversaciones pobladas y 5 vacías, 6 respuestas de presentación, hotel técnico lifecycle archivado, Guest Memory OFF y SEND_AUTOMATIONS=false.

Estado de cierre en este commit: corrección y pruebas locales terminadas; publicación y lectura pública aún pendientes. El punto 4 solo se marcará verificado después de esa fase. No se declara accesibilidad completa.
