# Onboarding: validación, alta y finalización (Daniel C1–C3)

Fecha: 2026-09-23. Rama local: `codex/onboarding-validation-completion`. Base contrastada con `origin/main`: `b755ed61cd60211bcf65a1c63d018b4514673aa4` (incluye PR #15). Implementación y ensayo locales; no publicado ni aplicado en producción. Se reutilizan C1–C3 de la auditoría y `docs/onboarding-readiness-navigation-review.md`, sin una nueva auditoría general.

## Defecto y corrección

Las altas de Platform y del selector realizaban escrituras separadas de hotel, estado y asignación. Un fallo podía dejar un resultado parcial; el reintento no identificaba la operación original. El perfil aceptaba coerciones/vacíos y el endpoint de progreso confiaba en `onboarding_completed` enviado por el navegador. La ausencia del esquema podía aparecer como onboarding completado.

Los dos POST usan ahora validación compartida y una única función transaccional. PATCH de perfil valida antes de escribir. PATCH de estado recalcula los requisitos desde datos persistidos, rechaza dependencias no disponibles y confirma el resultado persistido. GET de estado es de lectura: sin fila devuelve pendiente virtual; sin tabla devuelve `schemaReady=false`, nunca completado.

La autorización existente sigue siendo previa a las operaciones: Platform para sus altas, contexto hotelario para workspace/perfil y roles protegidos para finalizar. El identificador solicitado debe corresponder al contexto autorizado. No se modifica la lista limitada de navegación de PR #15 ni se añaden permisos.

## Contrato de campos

Contrato único en `shared/onboarding/hotel-fields.js`, utilizado por formularios y handlers. Reutiliza la validación existente de ubicación y zona IANA. Su función de zona se extrae a `shared/time/timezone-validation.js` sin cambiar su semántica, para compartirla con el navegador sin importar `node:crypto`.

| Campo | Alta inicial | Formato y límites |
| --- | --- | --- |
| Nombre | Obligatorio | Texto recortado, 1–120 caracteres; no identifica por sí solo una operación. |
| País, ciudad, zona horaria | Obligatorios | Código de dos letras conforme al validador existente, ciudad 1–120, zona IANA válida hasta 100. La zona nace sin verificar. |
| Correo administrador | Obligatorio solo en Platform | Correo válido hasta 254. Se guarda invitación con el mecanismo actual; no se acredita aceptación ni entrega de correo. Workspace usa la identidad autenticada como propietario. |
| Marca | Posterior | Hasta 120; por defecto nombre en alta. |
| Idioma | Predeterminado ES | es/en/fr/de; hasta 5. |
| Teléfonos | Posteriores | Hasta 32; dígitos y separadores, mínimo cinco dígitos. WhatsApp: + y 7–15 dígitos. |
| Correo de soporte | Posterior | Correo válido hasta 254. |
| Dirección y descripción | Posteriores | Hasta 500 y 2000. |
| Check-in/check-out | Posteriores | HH:MM válido de 24 horas. |
| Slugs | Opcionales, se generan | Minúsculas, números y guiones; hasta 48. |
| Colores y URLs | Posteriores | #RRGGBB; URL HTTP(S) sin credenciales, hasta 2048. |
| Plan | Contrato existente | Lista de planes actuales; workspace conserva `workspace_trial`. No cambia suscripción ni facturación. |

Se rechazan tipos incorrectos, cadenas vacías/espacios, caracteres de control y valores inválidos. Un campo opcional puede omitirse o borrarse mediante null cuando procede; los controles vacíos se normalizan antes de enviar. JSON inválido/identificador de operación inválido: 400; campos inválidos/requisitos pendientes: 422; permiso: 403; conflicto de operación: 409; persistencia o dependencia no confirmada: 503. Los errores llevan campos y mensajes corregibles, con resumen accesible y anclas al campo en el perfil. Se conserva el borrador tras fallo.

No son obligatorias conexiones PMS/WhatsApp activas para crear un hotel. Crear, completar configuración y autorizar live continúan separados. Los campos desconocidos no se convierten en configuración ni permiten introducir flags/metadata.

## Duplicados y fallos parciales

Migración incremental: `supabase/sql/add_atomic_hotel_onboarding.sql`.

- `create_hotel_onboarding_v1`: clave UUID de operación por actor, payload canónico y bloqueo transaccional. La misma clave/datos devuelve hotel, asignación y estado originales; datos diferentes con la misma clave producen conflicto. Nombres iguales con claves distintas pueden crear hoteles distintos.
- Hotel, estado pendiente, asignación inicial y registro de operación se insertan en una sola transacción. Fallos en cualquiera revierten todo. Las restricciones existentes siguen protegiendo slugs frente a otros escritores.
- Platform crea invitación admin; workspace crea propietario activo. El reintento devuelve el estado actual y no reactiva una asignación revocada. Si el resultado se eliminó, conserva la clave como referencia y rechaza recrearlo.
- Los nuevos hoteles fuerzan IA automática=false, live=false y metadata vacía, incluso ante defaults inseguros. No se crean proveedores ni se modifican flags globales.
- El navegador conserva clave y datos de la operación pendiente en sessionStorage por actor y modalidad. Doble clic se bloquea también en UI; tras error, pérdida de respuesta o recarga ofrece recuperar la operación. Solo éxito confirmado o rechazo 422 sin escritura libera la clave. No se promete deduplicar operaciones independientes con claves distintas, otro dispositivo o almacenamiento eliminado.
- La tabla nueva no es accesible directamente por anon/authenticated/service_role; RLS y revocaciones explícitas. Las dos RPC solo se conceden a service_role; el servidor mantiene la autorización real del actor. El registro contiene datos del formulario y correo: queda restringido, no se inventa una caducidad que pueda romper los reintentos. No se programa limpieza.

`save_hotel_onboarding_v1` conserva la primera fecha de finalización y evita que un progreso tardío revierta un completado. El progreso no vuelve a afirmar un completado leído previamente: la base conserva el estado actual. El reset administrativo explícito existente permanece separado.

## Finalización

El servidor vuelve a leer perfil, usuarios, PMS, Knowledge y cobertura de Salud. Una consulta fallida o fuente no disponible impide confirmar. Se conservan los criterios actuales de `canCompleteConfiguration`: perfil/ubicación verificados, usuario operativo, configuración o dependencia externa admitida, información del hotel y guardas de piloto. No se relajan los requisitos de demo/live. Los límites de consulta existentes no se presentan como censos completos ni se crean requisitos nuevos.

El cliente no puede completar mediante `completed_steps` inventados. Campos del perfil sin guardar deshabilitan finalizar/verificar zona y muestran el siguiente paso. Tras respuesta persistida completa del mismo hotel, muestra «Configuración guardada y completada. No se han activado proveedores ni envíos.» y abre `/dashboard/health`, conservando el contexto. Una respuesta incompleta, de otro hotel, un fallo o una dependencia ausente mantiene el asistente y permite reintentar. El estado de configuración no es una autorización de envío ni prueba de conexión.

## Evidencia local

| Comprobación | Resultado |
| --- | --- |
| `npm run ci:critical` | PASS: sintaxis y suites críticas, incluyendo navegación PR #15 y nueva `test:onboarding-validation`. |
| Nueva regresión de comportamiento | 8 grupos PASS: handlers reales, validación directa sin escritura, autorización/otro hotel, persistencia, dependencias, reintentos/respuesta perdida, callbacks reales del asistente y conservación de borrador al fallar. |
| `npm run ci:postgres` | PASS: nueva suite de alta/finalización, Knowledge, exclusión de automatizaciones y retención; todas con proveedores bloqueados y bases desechables. |
| Nueva regresión PostgreSQL | 8 grupos PASS: permisos, migración repetida, persistencia, 8 solicitudes concurrentes, reintento, fallo en cada escritura y rollback/recuperación, revocación, eliminación del resultado y progreso concurrente. Defaults de IA/live intencionadamente inseguros en fixture para verificar contención. |
| `npm run ci:dashboard` | PASS, build de producción. |
| `test:pilot-onboarding`, `test:pms-intelligence` | PASS. |
| `git diff --check` | PASS. |

CI queda conectado mediante `scripts/ci/run.cjs`: nueva regresión en **Critical tests and syntax** y PostgreSQL en **PostgreSQL knowledge and automation dispatch**. **Dashboard build** conserva el build. No se ha ejecutado GitHub CI porque no se ha subido la rama.

Dos comprobaciones adicionales siguen fallando, sin debilitar sus aserciones: `test:hotel-location-timezone-integrity` busca estáticamente `canManageHotelSetup` (línea 607); `test:golive-readiness` espera live=true sin acreditar ubicación (línea 60). Son los mismos fallos heredados cuya reproducción en main `0dfefb3` está documentada en el informe de navegación. Se volvieron a observar aquí; no cuentan como PASS.

Navegador real a 1920, 1366 y 390 px: errores por campo, foco mediante teclado/Enter al enlace de error, guardar fallido conserva valores, reintento y recarga conservan lo persistido; finalización fallida conserva asistente y el reintento abre Salud con confirmación. Formulario Platform inválido y alta inicial válida sin PMS; error de alta, recarga y recuperación sin UUID manual. Alta desde selector crea propietario y abre el hotel nuevo pendiente; cambio posterior al hotel anterior conserva contexto. Móvil sin desbordamiento horizontal (390/390); se corrigió el desplazamiento al campo bajo la cabecera fija. Textos de alta y errores en ES, tema claro.

Laboratorio privado en `http://127.0.0.1:3348/dashboard/onboarding`: componentes y handlers de la rama, identidad y transporte de base sintéticos, salidas externas bloqueadas, Guest Memory OFF y SEND_AUTOMATIONS=false. No es autenticación remota, PostgREST remoto ni PostgreSQL dentro del navegador: la garantía SQL se prueba separadamente con PostgreSQL 17 desechable, sin red/puertos ni volúmenes de datos reales. Capturas y logs están en `.npm-cache/onboarding-validation`, fuera de Git.

## Publicación y recuperación pendientes

1. Revisar diff/commit y autorizar publicación. Contrastar mediante lectura el proyecto efectivo y catálogo: tipos/columnas de hotels y hotel_users, user_id nullable para invitaciones, unicidad hotel_id en estado, restricciones de slugs, propietario/ACL de las funciones y ausencia de un contrato incompatible preexistente con esos nombres. No se ha contrastado el catálogo remoto en esta entrega.
2. Con autorización posterior, aplicar **solo** `add_atomic_hotel_onboarding.sql` antes del código. Requiere esquema actual de hoteles/usuarios, `create_hotel_onboarding.sql`, campos de identidad/localización, metadata y controles IA/live ya existentes. No hay backfill ni modificación de hoteles/asignaciones actuales. Verificar firma, permisos y disponibilidad PostgREST.
3. Publicar código con CI del SHA final. La migración es aditiva y no rompe lecturas antiguas; los handlers antiguos siguen sin garantizar atomicidad/idempotencia. La transición debe dirigir las altas al código nuevo y retirar las rutas/despliegues antiguos capaces de crearlas. Pestañas antiguas sin clave reciben 400 sin escritura y deben recargarse. No hay fallback a inserciones separadas si falta RPC: 503.
4. Verificar versiones, flags inalterados y recorrido autenticado autorizado. No fabricar un caso pendiente alterando producción. Proveedores y operación live requieren su procedimiento independiente.
5. Recuperación: conservar migración y registro de operaciones; ante incertidumbre recuperar con la misma clave, nunca generar otra para forzar el alta. Corregir hacia delante; no considerar seguro volver al creador antiguo de escrituras separadas. Una pausa de altas/configuración si fuera necesaria requerirá el alcance de publicación correspondiente; no se pausa nada aquí.

**Estado de auditoría:** corrección técnica local de C1–C3/punto 5 implementada y probada. Falta revisar/aplicar la migración, publicar y verificar el recorrido pertinente en producción para cerrar el punto. PR #15 y sus destinos se conservan; la comprobación pública completa C4/C7 con administrador de un hotel pendiente **sigue abierta**. No se incorporan organizaciones/PR #11, Ubikos, retención, inventarios ni datos de laboratorio. Sin push, SQL remoto, cambios de configuración, limpieza ni envíos.

## Preparación de publicación autorizada

Migración exacta del commit aprobado `71d803e6a2081d18d645267b0f8a99264874c181`: `supabase/sql/add_atomic_hotel_onboarding.sql`. SHA-256 de los bytes LF versionados y del fichero a aplicar: `ba4e0e5b7bd457a33bcc611a0789fe9bf3d33b856f2a9154a912e08473b52af3`. Su contenido no se modifica durante esta revisión.

Origin/main actualizado sigue en `b755ed61cd60211bcf65a1c63d018b4514673aa4`. La revisión confirma transacción única, clave por actor/operación y RPC reservadas a service_role detrás de autorización de servidor. La tabla nueva no tiene acceso directo de clientes. No se activan proveedores ni se modifican flags al crear/finalizar. La aplicación remota queda condicionada al preflight, al CI del SHA final y a la ausencia de incompatibilidades. Las evidencias de catálogo y recuperación se conservarán fuera de Git.
