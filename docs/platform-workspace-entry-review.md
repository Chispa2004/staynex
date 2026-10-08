# Entrada desde Platform al workspace del hotel

Base comprobada: `a03649439900412db0d033bc89486850475924ba` (origin/main, PR #50/#51). Rama aislada `codex/platform-workspace-entry`. Organizaciones y los informes/inventarios previos no forman parte del diff.

## Causa y corrección

`getCurrentHotelForRequest` devuelve deliberadamente `workspace_required`, hotel nulo y capacidades hoteleras vacías para el contexto mínimo de Platform. Ese resultado conserva la autorización interna de Platform; no es una denegación del hotel seleccionado. `AppShell` no volvía a resolver el contexto cuando la ruta cambiaba de Platform a Dashboard. Además, sus guardas podían interpretar el resultado anterior antes de comenzar la nueva carga. El evento de selección seguido de la navegación asíncrona reproducía el retorno inmediato a `/platform/hotels`.

La regresión ejecuta los hooks reales de AppShell y falla sobre la implementación base: esperaba `/dashboard` y recibía `/platform/hotels`. Con la corrección, la validez del contexto está ligada al tipo de espacio (Platform/hotel), se invalida antes de las guardas y se consulta de nuevo al cruzar ese límite. Las respuestas anteriores se descartan mediante la generación y la cancelación existentes. Atrás entre identificadores explícitos de hotel también invalida la selección operativa.

Los tres controles (directorio, detalle, consola) reutilizan la entrada de soporte existente, con timeout de 15 segundos, validación del identificador devuelto y readonly, rechazo de respuestas obsoletas, bloqueo del doble clic y error recuperable. Persisten únicamente el hotel y la sesión de soporte confirmados. No se crean asignaciones ni se cambian roles. Las dos rutas de soporte resuelven identidad en modo de lectura para no aceptar invitaciones como efecto lateral de entrar. Conservan las auditorías de soporte existentes.

El archivo confirmado mantiene su salida a Platform, sin esperar ni recuperar el contexto operativo retirado; posteriores revalidaciones conservan la comprobación de identidad del servidor. No se modifica la política de onboarding, archivo, escritura, live ni envíos. La etiqueta de soporte en sessionStorage no concede autorización: los endpoints siguen comprobándola en servidor.

## Evidencia local

- Regresión real de AppShell: Platform → hotel, respuesta de Platform tardía, retorno/Atrás, cambio de hotel, historial con identificadores, no exposición del hotel anterior.
- Hook compartido: doble clic, intentos fuera de orden, selección desde otro control, unmount, respuesta de hotel incorrecto, 401/403/503, timeout y recuperación.
- Handlers reales de soporte con resolver real y transportes sintéticos: administrador interno sin asignación al hotel destino permitido; administrador hotelero ordinario/sesión ausente/caducada rechazados; auditoría y resolución sin escrituras en asignaciones.
- Se conservan las regresiones previas de autenticación, navegación de onboarding, carga progresiva, aislamiento y archivo.
- Navegador con build optimizado y transportes sintéticos bloqueados al exterior: botón original a 1366 y 390 px, recarga, Inbox, vuelta a Platform, segundo hotel, onboarding pendiente y error/reintento visible. Las capturas y logs se conservan fuera de Git.

## Publicación y límites

No hay migraciones, cambios de variables ni nuevas dependencias de datos. Publicación por PR, tres jobs CI para el SHA final, merge normal y despliegues habituales. Los nuevos grupos de comportamiento se ejecutan en `test:workspace-progressive-loading` y `test:auth-hotel-context`; las cuatro pruebas de navegador tienen un paso explícito en el job Dashboard.

Al iniciar esta entrega las pestañas públicas disponibles redirigían a Login. Se solicitó únicamente iniciar sesión. Pendiente acreditar con esa sesión los permisos efectivos y la petición/respuesta del botón original, comparar detalle/consola, completar Dashboard/Inbox/Platform, recarga y segundo hotel activo a tamaños reales. El ensayo sintético no acredita esos recorridos públicos ni cambios en el inventario remoto. No se han realizado escrituras operativas, consultas de proveedor, SQL, cambios de flags ni alteraciones de la demo.

Resultados finales de CI, PR, despliegues y comprobación pública: se actualizarán con sus evidencias, sin equiparar un despliegue correcto con verificación funcional autenticada.

Comprobación local: build optimizado y cuatro recorridos de navegador aprobados. CI crítico llegó hasta HTTP Security; su aserción heredada de texto exige LF y falla con el checkout CRLF de Windows. Se normaliza únicamente el salto de línea local de `dashboard/lib/demo.js` (sin diff de contenido ni cambio de expectativas) y se repite ese control. El checkout Linux del CI debe acreditarlo de nuevo.
