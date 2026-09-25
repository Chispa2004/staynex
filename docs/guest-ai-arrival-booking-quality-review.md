# Llegadas nocturnas, promociones y nuevas reservas

## Alcance y base

Base efectiva: `5237113b98f84116fed39a72a477ab613180e079` (PR20/21). Rama `codex/guest-ai-arrival-booking-quality`. Sin organizaciones, migraciones, cambios de permisos o flags, integración PMS ni motor de reservas. Las conversaciones históricas de la demo no forman parte del diff.

## Causas y correcciones

| Causa observada | Corrección y recorrido |
|---|---|
| La coincidencia de una sola entrada Knowledge dejaba fuera otras políticas necesarias para una llegada. | `src/services/staynex.service.js` recupera las entradas activas del hotel para consultas compuestas. `guestFacingKnowledge` excluye otros hoteles y información restringida. |
| Hora de recepción, acceso al edificio y habitación se confundían; no había reloj local explícito. | `buildArrivalBookingContext` en `shared/guest-service/arrival-booking.js` proyecta zona horaria, fecha/hora de referencia y estancia autorizada, sin inventar una zona ausente. Se aclara la fecha de madrugada y que un aviso previo debe ocurrir antes de llegar. |
| El modelo omitía condiciones o convertía una oferta caducada en “no existen descuentos”. | Se preservan las condiciones documentadas en la presentación; la expiración de una oferta no niega otras. Los límites ISO explícitos se comparan con la fecha local. El texto libre no constituye una nueva regla de elegibilidad. |
| Se pedían fechas y ocupación sin capacidad de gestionar la petición, o se solicitaba tipo de habitación sin necesidad acreditada. | La proyección distingue URL documentada, solicitud interna existente, teléfono documentado y canal pendiente. Solo el flujo de solicitud recoge datos faltantes, sin reutilizar las fechas de la reserva actual. No se añaden herramientas de inventario o reserva. |
| Inbox no tenía el Knowledge del hotel para preparar estos borradores. | `dashboard/lib/inbox.js` carga Knowledge activo y permitido mediante consulta paginada y limitada al hotel autorizado; `dashboard/lib/ai-copilot.js` reutiliza la misma presentación. Sigue siendo un borrador, sin registrar o enviar nada. |
| Las instrucciones no evitan todas las garantías inventadas del modelo. | `finalizeServiceReply` presenta las políticas documentadas en los casos acotados de llegada/promoción y solicitudes sin canal de autoservicio. Conserva las decisiones de control humano, reparación y supresión de ofertas. Las URLs inventadas no llegan al huésped. |

Generación principal y Concierge comparten el contrato de instrucciones y la proyección. No se deduce disponibilidad a partir de conexión PMS o estado de limpieza. El flujo operativo de ticket existente continúa acreditando primero el guardado; un ticket no demuestra notificación, ejecución, entrega ni reserva.

## Evaluación reproducible y resultados

- [Comparación con las respuestas completas](guest-ai-arrival-booking-comparison.md).
- [92 salidas literales, entradas, versiones, hashes y reproducción de presentación](evidence/arrival-booking-quality.json).
- Se mantienen sin cambios las 64 generaciones de `evidence/guest-service-quality-raw.json`.
- Primera ronda: mismas 36 entradas antes/después (72), más cuatro comparaciones Concierge (8). Base 5237113 frente a 2a572d13. Segunda ronda: 12 generaciones focalizadas sobre las instrucciones de fcf2603. Modelo efectivo `gpt-4.1-mini-2025-04-14`, sin errores del proveedor. La presentación final corresponde a 6e0534a; los ajustes posteriores a fcf2603 solo afectan presentación y pruebas, no esas solicitudes al proveedor.
- Generación real en proceso aislado con datos ficticios: transporte permitido únicamente a OpenAI, sin adaptadores de base de datos, PMS, WhatsApp ni otros proveedores operativos. Clave usada en memoria del proceso aislado, sin copia local. No se cambiaron variables desplegadas.
- No se afirma que las 92 salidas sean correctas: las respuestas literales desfavorables siguen en el archivo. La comparación diferencia expresamente generación, reproducción de la presentación y guardado sintético. No es una prueba integral de envío.

## Comprobaciones

- 14 grupos nuevos `test:arrival-booking-quality`: recuperación compuesta real, fechas/zona horaria, aislamiento, información restringida, URLs, ofertas, capacidades, borradores, seguimiento, garantías de habitación, adaptadores principal/Concierge con SDK simulado, decisiones humanas y datos faltantes.
- 15 grupos existentes `test:guest-service-quality`: desayuno, cuna/edad en palabras, habitación conocida, persistencia antes del acuse, fallo de escritura sin respuesta, recuperación, control humano, proveedores independientes y aislamiento.
- `test:inbox`: cargador real, paginación de 121 conversaciones/3121 mensajes y Knowledge activo/permitido por hotel.
- Suite crítica, sintaxis y build; comprobaciones adicionales `test:mock-ai`, `test:natural-conversation`, `test:contextual-revenue` y `test:pms-intelligence` con proveedores bloqueados.
- Heredado: `test:guest-ai-tenant-isolation` sigue fallando en una aserción estática sobre `withHotel(supabase.from('ai_logs'))` en Dashboard, ya documentada/reproducida en la base anterior. No se modifica ni se presenta como PASS. Las pruebas de comportamiento de aislamiento sí se ejecutan.
- Heredado local Windows: `test:http-security` busca una secuencia literal LF en `dashboard/lib/demo.js`; con CRLF falla. La suite se ejecutó normalizando temporalmente ese archivo a LF y restaurando exactamente sus bytes. CI Linux es la comprobación final sin esa adaptación. No se cambia la prueba ni se incluye ese archivo en el diff.
- Las regresiones nuevas forman parte de `Critical tests and syntax` mediante `scripts/ci/run.cjs`; no requieren proveedor ni base remota. PostgreSQL existente se conserva.

## Límites

El conocimiento libre del hotel puede ser incompleto o estar desactualizado. Solo se interpretan automáticamente ventanas ISO explícitas; otras condiciones requieren confirmación. Una URL documentada procede del Knowledge autorizado del hotel; no se valida su disponibilidad externa. Los borradores/presentación nuevos se prueban en ES/EN; no se certifica aquí la misma cobertura en otros idiomas. La recogida determinista reconoce rangos ISO y algunos rangos naturales, no un calendario universal. Ningún modelo recibe una capacidad nueva por una instrucción en Knowledge.

Se conservan los límites observados: alguna respuesta literal sigue repitiendo preguntas o prometiendo acciones. El guardado fallido aborta antes de la respuesta en el cuerpo productivo probado; una solicitud guardada solo autoriza el acuse limitado. La comprobación pública se limitará a lectura de Inbox, sin provocar generaciones o envíos operativos ni modificar conversaciones históricas.

## Publicación

Push y PR autorizados; merge normal únicamente tras checks y revisión sin bloqueos. Después: comprobar SHA de main/CI, Vercel y Railway, salud del backend, Inbox autenticado y conservación de demo/flags. No hay migración o activación. La referencia privada previa contiene 15 conversaciones con mensajes, 42 mensajes, 4 tickets y 6 mensajes programados; no se incorpora a Git. Los identificadores y respaldos privados permanecen fuera del repositorio.

Resultados de publicación y comprobación pública: pendientes al abrir la PR; se documentarán al terminar. No confundir build/despliegue con evaluación funcional del modelo.
