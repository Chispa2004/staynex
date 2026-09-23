# Onboarding utilizable: navegación y preparación del hotel

Entrega local del 23/09/2026. Rama `codex/onboarding-readiness-navigation`, creada desde `origin/main` actualizado: `0dfefb31778d958fd7d98590927ac5731999c7d4`. Sin PR, push, despliegue, SQL o datos remotos. Salud, retención y flags se conservan; organizaciones/PR #11 y Ubikos no se incorporan.

## Causa y corrección

C4 se reprodujo con AppShell de main en el navegador del laboratorio: la acción «Gestionar usuarios» navegaba a `/dashboard/settings/users` y la guarda de onboarding la devolvía al asistente. La guarda se ejecutaba tanto tras cargar el estado como al cambiar de ruta.

`dashboard/lib/onboarding-navigation.js` define cinco destinos exactos: asistente, Usuarios, PMS, Knowledge y Salud. `AppShell` los permite solo cuando el rol ya tiene acceso a la ruta; las comprobaciones de autorización de servidor y ámbito hotelario permanecen intactas. No se permiten subrutas arbitrarias ni se abre todo el Dashboard. Platform conserva su propia autorización y no queda atrapado en la guarda hotelaria.

Se muestra «Volver al asistente» en el contenido de las pantallas permitidas, también en móvil. Al regresar se consulta de nuevo `/api/onboarding/state`; la evaluación usa los datos persistidos. Abrir Usuarios o crear una asignación invitada no acredita un usuario activo. Un error de guardado mantiene el requisito pendiente y el formulario conserva su entrada para reintentar.

Se separa la suscripción a `staynex:onboarding-updated` del efecto de carga, cuyo retorno temprano la retiraba. Solo acepta eventos del hotel actual. Navegar por pasos de un hotel ya completado conserva su marca de finalización.

`OnboardingWizard` obtiene acciones por permiso efectivo: manager no recibe una acción de gestión de Usuarios ni de edición PMS, y soporte/fallback no recibe acciones de escritura. Hotel y WhatsApp reutilizan `StepHotelSetup`; WhatsApp enfoca su campo. Los requisitos técnicos explican responsable y dependencia; «Consultar Salud» no aparenta resolverlos.

C7: el detalle Platform enlaza a sus formularios/secciones existentes de perfil, WhatsApp, asignaciones y PMS, con retorno a preparación. Los requisitos sin operación disponible explican quién debe intervenir. Se sustituyen recomendaciones genéricas redundantes por esos siguientes pasos contextuales. No se altera el cálculo ni el handler de activación live.

Los textos nuevos y las acciones del recorrido usan el traductor existente. Usuarios explica que su mecanismo actual guarda asignaciones invitadas pero no envía correo. La tarjeta PMS distingue configuración guardada de funcionamiento verificado; no se llama al proveedor por abrirla.

## Requisitos del asistente

| Requisito | Acción y destino | Permiso o dependencia |
| --- | --- | --- |
| Perfil/ubicación/zona horaria | Configurar hotel → formulario Hotel del asistente | Roles de configuración existentes; sin permiso, administrador del hotel. |
| Usuarios | Gestionar usuarios → `/dashboard/settings/users` | `user_management`; se exige usuario activo según la regla existente. |
| PMS | Configurar PMS → `/dashboard/settings/pms` | `pms_connections_manage`; acceso/documentación/activación dependen de Staynex y proveedor. |
| WhatsApp | Configurar WhatsApp → campo `onboarding-whatsapp_number` | Misma autorización de perfil. Guardar número no acredita verificación. |
| Información del hotel | Configurar información → `/dashboard/knowledge` | `knowledge_base_manage`; contenido persistido por el formulario existente. |
| Guest Memory OFF | Consultar Salud → `/dashboard/health` | Equipo técnico; no se cambia el flag desde el asistente. |
| Envíos automáticos OFF | Consultar Salud | Equipo técnico; completar configuración no activa envíos. |
| Seguridad | Consultar Salud + dependencia explícita | Staynex debe verificar y registrar evidencia; no se ofrece un botón de aprobación. |
| Atención humana | Consultar Salud + dependencia explícita | Verificación técnica de atención humana y protección en servidor. |
| Control de respuestas IA | Consultar Salud | No exige activar respuestas para completar configuración. |
| Información operativa | Consultar Salud | Si no carga, intervención técnica; abrirla no convierte fallo en éxito. |
| Ensayo de fallos | Consultar Salud + dependencia explícita | Staynex y responsable del hotel deben realizar y documentar ensayo autorizado. |

## Lista de preparación de Platform

Los identificadores son los del contrato existente; no se añaden requisitos.

| Requisito | Acción o siguiente paso |
| --- | --- |
| hotel_location_timezone_integrity | Perfil existente `#hotel-profile`; guardar y verificar ubicación/zona. |
| whatsapp_connected | Campo existente `#hotel-whatsapp`; guardar no verifica proveedor. |
| users_configured | Asignaciones existentes `#hotel-users`; altas desde Usuarios por administrador del hotel. |
| roles_configured | Asignaciones existentes `#hotel-users`; mantener permisos autorizados. |
| pms_connected | Conexiones existentes `#hotel-pms`; configuración por administrador del hotel. |
| pms_sync_healthy | `#hotel-pms`; proveedor/Staynex deben verificar sincronización. |
| pms_intelligence_active | `#hotel-pms`; revisar datos disponibles y dependencia del conector. |
| whatsapp_business_verified | Staynex/proveedor deben confirmar verificación Business. |
| webhook_healthy | Equipo técnico; ensayo autorizado de recepción, sin generar mensajes desde la lista. |
| ai_concierge_active | Revisión técnica de disponibilidad; no activar IA para superar la lista. |
| translation_active | Revisión técnica del servicio si falta disponibilidad. |
| guest_intelligence_active | Revisar ausencia de señales, sin fabricar datos ni activar Guest Memory. |
| revenue_ai_active | Administrador del hotel revisa contenido y catálogo en su espacio. |
| automations_preview_ready | Mantener prueba y envíos desactivados; responsable técnico. |
| provider_email_ready | Staynex/proveedor de correo revisan configuración y errores. |
| resend_domain_verified | Responsable de dominio/Staynex confirman verificación. |
| google_sheets_sync | Revisión técnica de integración de informes; no se sincroniza desde la lista. |
| gdpr_cleanup_ready | Responsable de privacidad confirma reglas; limpieza con revisión y autorización separadas. |
| academy_completed | Formación existente en Academia; coordinación con Staynex para acreditar evidencia. |
| no_critical_errors | Equipo hotelario resuelve incidencias desde Tickets. |
| copilot_active | Revisión técnica de Copilot sin activar envíos. |
| marketplace_ready | Administrador revisa experiencias/información local; proveedores requieren coordinación. |

## Pruebas y evidencia

Nueva regresión `test:onboarding-readiness-navigation`, incorporada a `ci:critical`: ejecuta funciones de navegación, handlers reales de Usuarios y Hotel, GET real de onboarding con su cargador/evaluador, y render React real de acciones, lista Platform y tarjeta PMS. Base en memoria desechable con dos hoteles, identidad sintética y red externa bloqueada. Comprueba: destinos exactos/directos, permisos admin/manager/recepción/bloqueado/soporte/fallback, manipulación de hotel e ID de asignación, lectura sin completar, fallo/reintento, persistencia y requisito actualizado, flags/live intactos y explicaciones sin CTA engañoso. No es una prueba de autenticación remota ni de RLS/PostgREST.

Laboratorio privado: `.npm-cache/onboarding-readiness/lab`, `http://127.0.0.1:3347/dashboard/onboarding`. Código de componentes de esta rama; se sustituye únicamente identidad/transporte por el almacén sintético para los recorridos del asistente. Los handlers de Usuarios, Hotel y estado/evaluador son reales. Platform usa respuesta sintética calculada por su evaluador real para inspección de la UI. El montaje no se versiona. Proveedores bloqueados en servidor y navegador, sin secretos; `SEND_AUTOMATIONS=false`, Guest Memory OFF.

Navegador: antes/después del bucle; administrador entra, guarda y vuelve; fallo de alta conserva correo para reintento; cambio persistido de asignación invitada a activa actualiza Usuarios a COMPLETADO; entrada directa a Usuarios y recarga; manager no puede acceder a Usuarios y recibe explicación; PMS se abre en lectura con controles deshabilitados para manager. Revisión 1366 px y 390 px, tema claro, teclado Tab/Enter en campos y acciones, retorno visible sin abrir menú móvil, ancho/scrollWidth 390 y sin desbordamiento en el contenido inspeccionado. No se pulsan controles de proveedor.

También se guardó información de desayuno mediante el formulario/handler real de Knowledge y se volvió al asistente: requisito COMPLETADO. Se guardó un número sintético desde el campo enfocado de WhatsApp: configuración disponible lista, demo/live aún pendientes. Se finalizó la configuración disponible y se abrió Salud y Dashboard sin retorno involuntario al asistente. Salud mantuvo WhatsApp «Sin verificar» y respuestas IA apagadas. Los indicadores del Dashboard no se usan como evidencia funcional: su transporte no forma parte de este ensayo.

En Platform se probaron enlaces PMS y asignaciones y sus retornos a preparación, con foco en el destino. Capturas del navegador a 1366 y 390 px: textos, estados y acciones del panel legibles, ancho de documento 390/390 en móvil. El control live permaneció deshabilitado. La inspección de Platform es de navegación/presentación; no se ejecutaron sus mutaciones ni operaciones de soporte/proveedor. Las capturas muestran solo registros sintéticos y se entregaron en la sesión; no se incorporan a Git.

### Resultado de comprobaciones locales

- `npm run ci:critical`: PASS, incluida la nueva regresión de navegación/handlers/renderizado, sintaxis y regresiones existentes de Salud, retención, aislamiento y seguridad. La nueva regresión está añadida al job **Critical tests and syntax** mediante `scripts/ci/run.cjs`; no se ha ejecutado GitHub CI porque esta entrega no autoriza push.
- `npm run ci:dashboard`: PASS (build de producción).
- `test:pilot-onboarding`, `test:pilot-journeys`, `test:pilot-failure-rehearsal`, `test:platform-management` y `test:dashboard-i18n`: PASS.
- `git diff --check`: PASS.
- No se requieren cambios de esquema para esta corrección. La nueva prueba usa un almacén desechable en memoria con handlers reales; no se presenta como una prueba PostgreSQL, autenticación remota o RLS.

Fallos adicionales heredados, reproducidos por separado en una copia exacta de `origin/main` (`0dfefb3`), sin cambiar ni debilitar sus aserciones:

| Prueba | Fallo en base y rama | Alcance |
| --- | --- | --- |
| `test:hotel-location-timezone-integrity` | Aserción estática en `scripts/test-hotel-location-timezone-integrity.js:607` busca `canManageHotelSetup`, identificador que ya no está en el asistente de main. | Desfase de prueba estática; no se renombra código solo para satisfacerla. |
| `test:golive-readiness` | `scripts/test-golive-readiness.js:60` espera `ready_for_live=true`; su fixture no acredita la integridad de ubicación exigida por el contrato actual. | Fixture heredado incompatible; no se relajan los controles live. |

Los logs del ensayo y copias de comparación quedan en `.npm-cache/onboarding-readiness`, fuera de Git. Las ramas previas, informe local `40a3696`, inventarios y archivos de otros trabajos no se alteran.

## Límites y seguimiento

El cierre es técnico y local: bucle C4 y siguientes pasos contextuales de C7. No equivale a hotel listo para live, a integraciones verificadas ni a publicación. No se cambian condiciones de elegibilidad, concesiones ni flags.

Para el punto 5 queda registrado un problema de validación ya presente: PATCH de `/api/onboarding/state` acepta la marca de completado enviada por un actor autorizado sin recalcular los requisitos antes de persistirla. Esta tarea no amplía ese contrato ni lo usa para acreditar readiness; la UI sigue usando datos persistidos para cada requisito y la activación live mantiene su verificación propia. La atomicidad/idempotencia del alta C2 y la aceptación de invitaciones quedan fuera. Tampoco se redefine el mínimo semántico de Knowledge C5 ni el contrato general de verificación PMS C6.

Dependencias reales: administrador cuando el usuario carece de permiso; aceptación del acceso mediante el mecanismo actual; evidencias técnicas/externas para conexiones, seguridad, ensayos y controles. No se inventan botones que resuelvan esas dependencias.

Publicación siguiente: revisar diff/commit local, autorizar push/PR; ejecutar los jobs para el SHA final (la nueva regresión va en Critical); integrar solo tras CI/revisión; verificar en Preview aislado y después web autenticada el recorrido y roles. No precisa migración, variables, activaciones ni ejecución de limpieza. Recuperación del cambio de presentación: conservar datos y permisos; volver al código anterior reintroduciría el bucle y no es una solución operativa definitiva.
