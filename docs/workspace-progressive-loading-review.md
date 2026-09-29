# Punto 8 de Daniel: carga del workspace

Base comprobada: `origin/main 874390f38a4f395bc6fb9073c710ab29aebceb81`. Rama: `codex/workspace-progressive-loading`. Alcance: arranque, autorización y cargas secundarias del shell. No migración, modificación de permisos, flags, PMS, datos ni proveedores.

## Causa acreditada

`AppShellContent` esperaba sesión → `GET /api/current-hotel` → `GET /api/onboarding/state` antes de montar toda la interfaz. La última lectura calculaba `getPilotOnboardingSummaryForContext` (usuarios, PMS, Knowledge y Salud) aunque el shell solo necesitaba el booleano persistido de finalización. El directorio interno completo también se consultaba dentro de `resolveCurrentHotelForRequest`, antes de devolver el hotel autorizado. Estos trabajos secundarios bloqueaban estructura y contenido.

El límite de sesión de 7 s redirigía a login ante una espera, sin evidencia de sesión inválida. Onboarding no tenía límite. Focus/pageshow podían reiniciar una resolución pendiente; AppShell y LoginClient consultaban la sesión en login. El contador de urgentes y la persistencia del cambio de workspace tenían ventanas para respuestas tardías.

No se ha demostrado que el bundle, un proveedor concreto o una consulta SQL determinada cause los timeouts públicos. Tampoco se reproduce ni se atribuye al arranque la restauración anterior de 22,85 s.

## Corrección y contratos

- Estructura neutral inicial en español, sin nombre de hotel, datos ni acciones operativas antes de autorización.
- Contexto obligatorio: sesión, validación de usuario en servidor, asignaciones/permisos y hotel seleccionado. `x-staynex-context-only: 1` omite el catálogo interno; el GET usa contexto de solo lectura. No resuelve invitaciones ni vincula asignaciones al reintentar. El login conserva su mecanismo explícito existente.
- `/api/workspace-directory` actualiza el selector de forma independiente, con autorización repetida, límite y reintento propio. Nunca sustituye permisos por una respuesta secundaria; un cambio de autorización invalida el contexto. Las asignaciones que ya vienen en la consulta autorizada permanecen disponibles.
- El gate de onboarding usa el endpoint existente con `x-staynex-onboarding-gate: 1`: solo hotel y estado persistido. No calcula Salud/PMS/Knowledge. El endpoint normal y la finalización mantienen todas sus comprobaciones. Un esquema ausente o una respuesta incompleta no completa onboarding.
- Tras autorizar el contexto se muestra navegación. El gate pendiente solo retiene rutas que lo requieren; Salud y destinos de corrección permitidos conservan su acceso. Platform no depende de la preparación de un hotel.
- Se conservan 7 s como límite de los pasos; no se alarga la espera para ocultar el fallo. Error de red es reintentable; solo ausencia/caducidad acreditada conduce a login. Denegación y archivo mantienen sus mensajes y no seleccionan otro hotel.
- Generación, revisión de archivo, actor, hotel, cancelación y desmontaje descartan respuestas anteriores. Cambio de identidad elimina el contexto; storage entre pestañas invalida el hotel. El helper de cambio verifica vigencia antes de persistir. No hay caché nueva de permisos ni reenvío automático de mutaciones.

## Medición anterior y posterior

Build Next de producción en el mismo equipo/puerto, componentes/CSS reales, autenticación y API sintéticas, red externa bloqueada. Se conservó el AppShell de la base antes de modificarlo. Igual escenario: contexto 200 ms, resumen completo/directorio 2000 ms, gate mínimo 200 ms, contenido 200 ms. Estos retrasos son artificiales; el montaje mide la dependencia de interfaz, no la latencia de Supabase.

Marcadores DOM con reloj monotónico del documento. Estructura = estructura neutral útil o navegación; contexto visible = navegación autorizada; contenido = marcador de contenido autorizado. Una primera petición tras arrancar el proceso y tres recargas posteriores por versión; la caché del navegador no se vació, por tanto no se denomina arranque de navegador completamente frío.

| Muestra (ms) | Antes estructura/contexto/contenido | Después estructura/contexto/contenido |
| --- | --- | --- |
| Primera petición del proceso | 2440 / 2440 / 2671 | 230 / 492 / 949 |
| Recarga 1 | 2321 / 2321 / 2546 | 96 / 317 / 777 |
| Recarga 2 | 2314 / 2314 / 2533 | 82 / 319 / 750 |
| Recarga 3 | 2303 / 2303 / 2530 | 85 / 302 / 745 |

Media de tres recargas: contenido 2536 → 757 ms. El selector seguía cargando cuando ya se mostraba contenido. No se extrapola esa reducción a producción.

Antes del cambio, producción autenticada, mismo hotel técnico de onboarding, solo lectura: dos recargas observadas con shell y primer contenido juntos a 4098 y 4007 ms; una muestra inicial con observación demasiado espaciada solo permite acotar entre 463 y 6529 ms. Navegación interna a Salud: shell a 148 ms y respuesta visible a 1759 ms. Son tiempos de observación DOM desde la automatización, con sondeo de 500 ms y transporte incluido, no trazas de servidor. No se dispone de desglose acreditado navegador/servidor/Supabase. Entrada con sesión restaurada; no se realiza login con nuevas credenciales ni resolución de invitaciones públicas para fabricar una muestra.

## Regresiones y revisión

`test:workspace-progressive-loading` está en `ci:critical`: once grupos con hooks/render del AppShell y handlers reales. Incluye estructura sin datos protegidos, contexto y secundarios independientes, fallos/timeouts, retry de lecturas, sesión ausente/caducada, denegación, archivo, pestañas, cambio de usuario/hotel/logout, respuestas fuera de ámbito, gate pendiente, Platform, esquema incompatible y contrato mínimo sin resumen de Salud.

La prueba de autorización ejecuta el resolvedor real con transporte simulado y acredita ausencia de escrituras de invitación/asignación y del escaneo de catálogo en el bootstrap. Las fixtures de JWT inválido incorporan HTTP 401, distinguiéndolo de errores de red/503; no se cambian las expectativas de aislamiento. Se conservan las siete regresiones de navegación lifecycle.

Laboratorio a 1366 y 390 px: textos legibles, sin overflow horizontal; estados de estructura neutral, preparación y contenido; navegación móvil mediante Enter en apertura y Salud. Traducciones mediante el sistema existente. Capturas y datos sintéticos permanecen fuera de Git.

Build final y sintaxis PASS. El runner crítico local ejecuta sus suites hasta HTTP Security: allí falla una expectativa literal LF sobre un archivo CRLF, ya documentada en la base. La misma prueba con lectura LF (sin cambiar expectativas) pasa; el checkout Linux de CI será la evidencia de publicación. La nueva suite, autorización, navegación lifecycle, onboarding, Salud, traducciones/aislamiento y demás suites anteriores a ese último paso pasan.

Dos comprobaciones estáticas adicionales, fuera del runner crítico, fallan igual en una extracción de la base exacta: `test-post-login-routing.js:130` busca una expresión de selección sustituida anteriormente; `test-permissions.js:156` espera PMS Academy no visible para recepción. No se modifican esas expectativas ni se presentan como PASS. `test-dashboard-i18n.js` pasa.

## Publicación y límites

Publicar rama/PR, confirmar logs de las once regresiones y tres jobs para su SHA final, merge normal sin bloqueos, CI de main, Vercel Production y Railway. Verificación pública de lectura: Dashboard, Inbox, Salud y onboarding sin guardar ni operar proveedores. No se requieren cambios de base, permisos o configuración.

Recuperación: al no cambiar esquema ni datos, una reversión de este código requiere el CI habitual; no ejecutar operaciones de archivo/restauración ni repetir mutaciones inciertas. Los GET anteriores completos siguen soportados para convivencia de versiones.

Pendiente de completar aquí la evidencia de PR, versiones y verificación pública. No se declara todavía publicado ni cerrado. Incluso tras verificar, el cierre debe limitarse al bloqueo global por cargas secundarias y su recuperación, no a todo el rendimiento de Staynex. La latencia de autorización y de cada página sigue dependiendo de su servicio.
