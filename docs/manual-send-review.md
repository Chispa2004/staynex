# Envío manual de Inbox: validación y resultado verificable

Revisión local del 10 de septiembre de 2026. Rama `codex/reception-message-dashboard`, base `43763d836f45c3163bf48596f7dd81ea2c7d4e06`. Árbol inicialmente limpio. Alcance limitado al envío manual; sin cambios remotos ni automatizaciones activadas.

## Hallazgos y correcciones

El flujo es `InboxClient` → API del dashboard `/api/messages/send` → backend `/messages/send` (autenticación interna existente) → servicio de mensajes → Twilio → persistencia → respuesta/recarga de Inbox.

- La API ya resolvía sesión, contexto autorizado, permiso Inbox y restricción de soporte. Se conservan. El backend verificaba el hotel de la conversación después de leerla, pero no comprobaba que su huésped perteneciera al mismo hotel. Ahora ambas consultas incluyen el hotel autorizado; el destinatario se obtiene únicamente del huésped de esa conversación. Campos de hotel o destinatario manipulados por el cliente no se propagan desde el dashboard.
- Faltaba un contrato estricto de texto y longitud. Se rechazan objetos, arrays, texto vacío y solicitudes inválidas antes del proveedor. Se conserva texto Unicode y multilínea. Se valida un máximo conservador de 1600 unidades UTF-16, también sobre el texto final traducido, conforme al límite de Body de [Twilio 21617](https://www.twilio.com/docs/api/errors/21617). No había un límite equivalente en la aplicación.
- Antes se persistía el mensaje sin un resultado de envío durable; la UI mostraba un check en todos los mensajes de personal y los errores quedaban en consola. Ahora hay resultados explícitos y textos seguros, sin exponer errores del proveedor o de la BD.
- El UUID del intento es también la clave primaria del mensaje. Se guarda un estado incierto antes de llamar al proveedor. Repetir el mismo intento, incluso concurrentemente, devuelve el estado existente sin otro envío. La compatibilidad con columnas antiguas puede omitir campos de traducción, pero nunca metadata ni filtros de hotel.
- Se conserva el comportamiento existente de respuesta manual respecto de Human Takeover y Kill Switch. El adaptador exclusivo de envío manual configura timeout de 15 segundos y desactiva reintentos automáticos; no modifica el adaptador de automatizaciones.

## Resultados y recuperación

| Evidencia | Resultado visible | Recuperación |
| --- | --- | --- |
| Petición en curso | En proceso | Bloqueo síncrono de doble clic; borrador conservado antes de enviar. |
| SID válido y aceptación del proveedor | Aceptado por el proveedor; entrega no confirmada | Se limpia únicamente el borrador enviado, preservando ediciones posteriores. |
| SID válido y estado `delivered`/`read` del proveedor | Entregado | Check únicamente con esa evidencia. |
| Rechazo definitivo o fallo anterior al envío | Fallido con explicación segura | Texto conservado; botón Reintentar para fallos recuperables (p. ej., 429 o preparación temporal). Otros requieren corregir el texto/destinatario o intervención administrativa. |
| Timeout, transporte ambiguo o respuesta no verificable | Resultado sin confirmar | Texto conservado; Revisar estado recarga el historial. Sin reintentos automáticos ni repetición del mismo texto desde ese intento. |
| Aceptación seguida de fallo al guardar la confirmación | Aceptado; aviso de que no se guardó la confirmación | No se invita a repetir. La fila durable queda incierta si no se pudo actualizar. |

Los estados se conservan en `messages.metadata.manual_send`. Una fila histórica sin este contrato muestra que su estado de envío no está disponible. Reabrir el chat recupera los estados persistidos y permite recuperar su texto sin enviar nada. El recibo local se guarda en sessionStorage por usuario, hotel y conversación; restaurarlo nunca ejecuta un envío. Si no puede guardarse el recibo antes del envío, se rechaza localmente sin contactar al backend.

La prevención de duplicados cubre el mismo UUID de operación y el doble clic de este compositor. No es una deduplicación universal entre distintos operadores, pestañas o UUID. Los clientes antiguos que omitan el UUID reciben uno nuevo del servidor. El almacenamiento local dura la sesión de la pestaña; si se cierra y no existe fila persistida, esa recuperación no está garantizada.

## Verificación local

Fuente copiada sin archivos de entorno a `.npm-cache/manual-send/publishable`, con manifiesto SHA-256. Pruebas con BD simulada y proveedor simulado, bloqueo de red externa y lectura de archivos .env; `SEND_AUTOMATIONS=false`, `USE_MOCK_AI=true`. Sin mensajes reales ni llamadas a IA.

- `npm run test:manual-send`: PASS, 14 grupos. Incluye validación, conversación y huésped de otro hotel, rol/sesión, cuerpo manipulado, aceptación, rechazo, timeout, aceptación seguida de fallo de persistencia, contención del mismo UUID, recuperación tras recarga, almacenamiento local fallido y ejecución del manejador real del compositor con dependencias simuladas.
- `npm run test:inbox`: PASS.
- `npm run test:auth-hotel-context`: PASS.
- `npm run test:messages-tenant-isolation`: PASS.
- `npm run test:pilot-human-safety`: PASS.
- `npm run test:translation-knowledge-isolation`: PASS.
- `npm run dashboard:build`: PASS, 69 segundos.
- `git diff --check`: PASS antes del commit.

Evidencia local ignorada por Git: `.npm-cache/manual-send/test-*.log`, `dashboard-build.log`, `source-manifest.json`. Las pruebas ejercitan fuentes reales con adaptadores simulados; no sustituyen una prueba visual en navegador, una ejecución contra PostgreSQL real ni una validación con Twilio real. No se reclama ninguna de esas tres comprobaciones.

## Dependencias y pendientes

No se introduce SQL ni se modifica el esquema. Se reutilizan la clave primaria de `messages.id` y `messages.metadata`, presentes en el contrato del repositorio; la migración existente `supabase/sql/add_multilanguage_translation_layer.sql` contiene metadata. Su presencia efectiva en Supabase de demo sigue sin verificarse. Si falta metadata, el nuevo flujo rechaza el envío antes del proveedor; no degrada a un envío sin registro. No aplicar una migración antigua completa sin revisar el catálogo remoto.

No se encontró un callback de estados salientes; el webhook existente procesa mensajes entrantes. La aceptación síncrona no demuestra entrega, según el [contrato de estados de Twilio](https://www.twilio.com/docs/messaging/api/message-resource). Queda pendiente integrar y validar callbacks firmados o reconciliación autorizada para conocer entregas y fallos posteriores. Revisar estado consulta únicamente el historial persistido, no Twilio. Un timeout que no pueda reconciliarse requiere comprobación operativa; no se convierte en un fallo seguro.

Para utilizar este bloque hacen falta despliegues coordinados de backend y dashboard y comprobación del esquema existente. Desplegar primero backend y luego dashboard; una UI nueva con una respuesta antigua sin estado reconoce incertidumbre. La transición con UI antigua no constituye la validación final. Las actuaciones remotas de traducción y hotel_knowledge continúan pendientes y no se consideran resueltas por este cambio.

Los dos puntos de Badar quedan corregidos localmente respecto de validación del envío manual y comunicación/recuperación de los resultados de la petición. El seguimiento asíncrono de entrega/fallo y su comprobación en demo permanecen abiertos. La protección completa de automatizaciones frente a concurrencia y reintentos queda fuera del alcance.

## Archivos del commit

```text
dashboard/app/api/inbox/route.js
dashboard/app/api/messages/send/route.js
dashboard/components/InboxClient.js
dashboard/lib/manual-send-client.js
docs/manual-send-review.md
package.json
scripts/test-auth-hotel-context.js
scripts/test-manual-send.js
scripts/test-messages-tenant-isolation.js
shared/manual-send/contract.js
src/controllers/messages.controller.js
src/services/message.service.js
src/services/twilio.service.js
```

Commit exclusivamente local. Sin push, despliegue, modificaciones remotas ni activación de automatizaciones.
