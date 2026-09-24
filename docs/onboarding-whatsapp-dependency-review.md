# WhatsApp: dependencia externa y cierre de onboarding

Fecha: 24/09/2026. Rama `codex/onboarding-whatsapp-dependency`, base `origin/main` `ef45eff26e56daf2aa947c341413f946a2ee1a1d`. Se conserva el informe anterior en `b0a6cb1` y los worktrees aparcados. Alcance exclusivo: cerrar la carencia de interfaz que impedía probar la finalización sin un canal de envío.

## Contrato y autorización

`evaluatePilotWhatsapp` ya reconoce `waiting_external`, `pending_staynex` y `pending_twilio` en `hotel.whatsapp_setup_status` o `hotel.metadata.whatsapp_setup_status`. El esquema remoto acreditado utiliza metadata jsonb. No exige nota libre ni datos de proveedor: el selector pide la actuación pendiente mediante esos mismos valores. No se añaden campos, tablas, SQL, permisos ni flags.

Nueva acción `save_whatsapp_dependency` en PATCH `/api/onboarding/hotel`, bajo la autorización existente: owner/admin/manager o platform_admin/super_admin/internal_only, usuario autenticado, hotel efectivo coincidente, sin fallback y excluyendo support. Lista cerrada de propiedades y estados; peticiones con número, metadata arbitraria, flags, estado conectado/verificado o finalización son rechazadas antes de escribir.

Solo se modifica `metadata.whatsapp_setup_status`. Se conserva el resto de metadata mediante comparación del snapshot previo y del número antes de actualizar: cambios concurrentes producen 409 sin sobrescribirlos. Si existe número o un estado de columna autoritativo, se pide revisión, sin falsear la configuración existente. Se confirma hotel y estado persistidos; errores de almacenamiento 503, datos inválidos 422, permisos/otro hotel 403. Auditoría limitada al estado de dependencia y actor reales.

## Interfaz y estados

El bloque WhatsApp del onboarding permite registrar y actualizar la actuación externa. Muestra selección persistida, error accesible y reintento sin perderla. Cambios sin guardar bloquean finalizar; guardar un perfil pendiente debe preceder al registro de dependencia. Se usa el traductor existente, tema claro y controles nativos etiquetados.

La dependencia no concede conexión/verificación ni registra remitentes. La preparación interna se calcula con el contrato original y todos los demás requisitos. `readyForGoLive` de WhatsApp sigue false; no se alteran condiciones demo/live. Salud muestra responsable/dependencia pendiente y explica que WhatsApp no está conectado ni verificado. Los flags permanecen iguales.

## Pruebas y evidencias

- Nueva `test:onboarding-whatsapp-dependency`: 6 grupos de comportamiento PASS usando handlers y callbacks reales: inválidos/manipulados; autorización/otro hotel; persistencia/actualización/fallo y recuperación; concurrencia de metadata/número; finalización solo con demás requisitos, sin live y Salud pendiente; selección UI conservada, reintento y rechazo de respuesta de otro hotel.
- `test:onboarding-validation` conserva los 8 grupos, incluida confirmación y redirección solo tras éxito persistido del hotel correcto, rechazo de respuestas incompletas y fallos.
- `npm run ci:critical`: PASS, incluida sintaxis, navegación C4/C7, Salud y nuevas regresiones. La primera ejecución local tropezó con CRLF en el cargador de Inbox; se normalizaron los bytes locales a LF sin alterar la aserción ni añadir cambios ajenos al diff. Ejecución completa posterior PASS.
- `npm run ci:dashboard`: PASS. `test:pilot-onboarding`: PASS.
- Siguen separados los fallos heredados de `test:hotel-location-timezone-integrity` y `test:golive-readiness`, ya reproducidos en la base anterior; no cuentan como PASS ni se debilitan.
- Laboratorio privado `127.0.0.1:3350`: componentes y handlers de esta rama, sesión/almacenamiento sintéticos, proveedores y salidas externas bloqueados. Ensayo de selección obligatoria, actualización fallida, conservación del borrador, reintento mediante Enter y recarga. No es prueba de autenticación remota ni de PostgREST remoto. Capturas/logs fuera de Git.

La nueva suite está incluida en **Critical tests and syntax**. PostgreSQL y build mantienen sus jobs. No hay migración que aplicar o repetir.

## Publicación y verificación pública

Publicar rama y PR, comprobar SHA final y ejecución real de tests, integrar mediante merge normal con CI y revisiones sin bloqueos. Comprobar main CI, Vercel y Railway. Reutilizar destino servidor ya acreditado `vblxmnqbatqrynfaasmf` si no cambia la configuración; sin editar secretos ni flags.

Usar exclusivamente el hotel técnico existente **Staynex QA técnico onboarding PR16 20260924**, UUID **881b7cd7-f9b6-4f80-a186-f03d24b4cc89**, con la misma cuenta auténtica autorizada. Registrar desde UI `pending_staynex` (requiere actuación externa de Staynex, sin canal), recargar, finalizar normalmente y comprobar confirmación, redirección a Salud/contexto correcto y servicios pendientes. No crear hoteles, números, conectores, invitados, mensajes ni estados de finalización por SQL/API manual.

Recuperación: la escritura es idempotente para el mismo estado; ante incertidumbre recargar antes de reintentar. Conservar el estado persistido y corregir hacia delante; no borrar metadata ni activar servicios para resolver un bloqueo. Hasta completar el recorrido público, el punto 5 no se marca cerrado. El punto 2/C4–C7 conserva la verificación pública ya realizada.

Ensayo local final: dependencia guardada y actualizada, recarga persistente a 390 px sin desbordamiento, botón Finalizar normal, confirmación visible y redirección automática a Salud del hotel sintético. Salud mantiene WhatsApp pendiente y restricciones live. Capturas privadas conservadas.
