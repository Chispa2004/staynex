# Carga inicial y paneles del Dashboard

Base comprobada: origin/main aa8668a97f7fb1481c8523abaf83a3bbde6b808d. Rama codex/dashboard-loading-demo-panels. Worktree separado; informe local anterior c689820 y trabajos/inventarios conservados.

## Cambios

El contexto inicial de acceso obtiene la comprobación de onboarding con el mismo cliente autorizado. AppShell conserva una única presentación hasta conocer sesión, hotel, permisos y condición de onboarding; no espera a los bloques secundarios. El Dashboard reutiliza ese hotel y rol, sin «Cargando hotel» intermedio. El contrato anterior y el reintento de onboarding siguen disponibles; ningún cambio omite autorización. Al cambiar de hotel se remonta el contexto operativo, se abortan lecturas anteriores y se descartan respuestas obsoletas. Una actualización válida conserva contenido; los errores se explican y permiten reintentar sin cargador global.

Hotel Demo Checkin se identifica por UUID 1ef60a40-b65f-4bff-9bd3-22654e5029f2 y slug hotel-demo-checkin, ambos requeridos. Es una condición de presentación posterior a la autorización, no una concesión de acceso. Se ocultan exclusivamente sus selectores/explicaciones de origen del Dashboard. Los metadatos no se modifican.

| Elemento | Conjunto y orden |
| --- | --- |
| Recibidos demo | Entradas válidas del huésped, historial disponible, todos los orígenes |
| Resueltos demo | Seguimiento actualmente resuelto acreditado, historial disponible |
| Pendientes | Seguimiento pendiente acreditado ahora |
| Urgentes | Pendientes y alerta urgente vigente según contrato existente |
| Últimos | Cinco mensajes entrantes, fecha descendente e ID estable; no conversaciones ni IA |
| Urgentes, pestaña | Hasta cinco miembros del conjunto urgente, fecha descendente/ID; vacío sin sustitución |
| Tickets | open/pending/in_progress; prioridad efectiva urgente/alta/normal/baja, creación descendente/ID antes de limitar a cinco |

Las cuatro tarjetas y sus destinos Inbox comparten el mismo cálculo y ámbito. La modalidad histórica/todos los orígenes se vuelve a validar en servidor contra el hotel autorizado y su configuración. Otros hoteles conservan sus controles y periodos. Los mensajes sin seguimiento no se declaran pendientes/resueltos. Los enlaces incluyen hotel, conversación y mensaje; Inbox localiza el mensaje sin tomar el foco ni modificar su estado. Los tickets conservan el total, filtros, detalle, colores y transiciones PR #41. Mensajes/Tickets y Servicios mantienen su distribución.

Se retiran del endpoint del Dashboard consultas duplicadas que alimentaban paneles ya no mostrados. Solo se enriquecen las conversaciones de los cinco mensajes seleccionados. No hay migración, nuevas reglas operativas, generación de datos ni llamadas a proveedores.

## Pruebas y evidencia local

Nuevo test de contrato ejecuta el loader real con transporte sintético: identidad/configuración, aislamiento, cuatro conjuntos exactos, historial/orígenes, cinco mensajes frente a dos conversaciones, vacío urgente, fallo y recuperación. Las regresiones existentes de carga prueban contexto, gate pendiente, reintento, autorización, cambio de hotel y respuestas antiguas. Las de tickets conservan el caso de 1.207 registros y orden antes del límite.

Nueve regresiones de navegador aprobadas con build real y handlers actuales, únicamente transporte sintético: 1920×1080, 1366×1080 y 390×844, ambos temas, dimensiones reales, cero desbordamiento, teclado en pestañas, cinco tickets, Servicios único, cuatro enlaces Inbox, localización del mensaje, fallos/reintentos. Las escrituras y proveedores externos están bloqueados. Se incorpora al job Dashboard build; el contrato al job Critical tests and syntax.

Build local y diff --check aprobados. Las pruebas críticas llegan al fallo heredado de HTTP Security que compara una cadena LF con un archivo CRLF en Windows (test-http-security.js:540). Prueba y expectativas intactas; se verificará el resultado del checkout Linux de CI. Inspección de nombres/teclado no equivale a ensayo con lector de pantalla.

## Medición anterior a publicar

Recarga pública autenticada de aa8668: primer cargador observado 415 ms; segunda pantalla 1.425 ms; estructura con «Cargando hotel» 2.268 ms; tickets 3.754 ms; hotel/datos secundarios 4.270 ms. Medición observada desde iniciar reload mediante muestras de navegador, no benchmark ni tiempo exclusivo del servidor. Espera inicial hasta estructura 2,268 s; datos secundarios 4,270 s desde inicio (2,002 s adicionales). Evidencia privada fuera de Git en .npm-cache/dashboard-loading-demo-panels. Comparación posterior pendiente de publicar.

## Publicación

Publicar rama, comprobar los tres jobs y logs de nuevas regresiones, revisar bloqueos y merge normal. Verificar CI main, Vercel y Railway SHA/salud; recorrer públicamente solo lectura y navegación. No aplicar SQL ni cambiar flags. Guest Memory OFF y SEND_AUTOMATIONS=false se conservan. Ningún mensaje, ticket, estado, prioridad o fecha de la demo se modifica. Completar aquí PR/SHA, resultados y comprobaciones públicas al terminar.
