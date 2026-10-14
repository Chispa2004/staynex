# Integración de atención IA — revisión local del 14 de octubre de 2026

## Dictamen y referencias

**Listo con condiciones para preparar una PR; no publicado.** Las regresiones operativas afectadas pasan localmente, incluida la matriz de versiones. Faltan CI remoto completo, revisión del catálogo efectivo y autorización de publicación/migración. La calidad y naturalidad de las generaciones reales siguen sin acreditarse: esta fase no las evalúa ni las cierra.

- Rama conservada: `codex/guest-service-quality-evaluation`.
- Entrada: `b35655a6a72e6429c215b8f9cb76484176853443`.
- `origin/main` actualizado por fetch y ancestro común: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`.
- Se revisaron los **siete commits acumulados** desde main, no solo D11. Main no avanzó: no se hizo merge, rebase ni reescritura. Un checkout separado y limpio de ese main sirve para la reproducción comparativa.
- El commit que contiene este informe fija el candidato final local. Su SHA completo se entrega al cerrar la revisión; el manifiesto conserva huellas del código y las evidencias.
- Ubikos permanece en `bf1492ec5b704f55de8064eed1998388380dfaac`, sin cambios. El checkout principal conserva el informe de Daniel y el inventario privado sin seguimiento.

## Cambios que entrarían

| Área | Archivos / comportamiento |
|---|---|
| Intención y hechos | `shared/guest-service/{operational-request,ticket-context,information-evidence,turn-replies}.js`: último turno, cantidades, estado real, tema informativo, contradicciones, revisión ante necesidades múltiples. |
| Llegada | `arrival-booking.js`, `arrival-details.js`: fechas ES/EN, víspera del aviso previo, edificio frente a habitación; ninguna garantía de acceso o disponibilidad por deducción. |
| Respuesta acreditada | `quality.js`, `receipt-reply.js`, `item-quantity.js`, `incident-correction.js`: recibo, relectura, cantidad y objeto; no equiparar registro, ejecución, entrega o cancelación. |
| Recuperación | `failed-request-context.js`, `src/services/operational-request.service.js`, `supabase.service.js`: marcador del servidor, fuentes por identificador y ámbito, transacción y relectura. |
| Rutas | Prompt principal, Concierge, búsqueda de Knowledge y detección de ayuda humana. Inbox consume los módulos compartidos y sigue generando borradores sin herramientas. |
| Integración de esta revisión | Correcciones acotadas en detector comercial y clasificación; prueba del tramo real con su alternativa comercial; matriz SQL con el ciclo de vida publicado. |
| Entrega técnica | Migración aditiva, preflight de catálogo de solo lectura, tests/CI, informes y evidencia sintética comprimida. La lista exacta de archivos queda en el manifiesto. |

No entran Ubikos, organizaciones, cambios visuales, branding, demo, flags, permisos de aplicación, datos remotos, inventarios, respaldos, claves ni scripts temporales de reproducción. `scripts/configure-development-evaluation.ps1` es una herramienta versionada anterior, no un secreto ni una tarea de CI/arranque: no se ejecutó ni habilita gasto. Los planes antiguos de evaluación son históricos y están aplazados expresamente.

## Defectos reproducidos y corregidos

1. **Ruta alternativa no cubierta por el arnés anterior.** Este fijaba `upsellInterest=null`. En el tramo real, «Mi reserva empieza el 12 de noviembre» no pide una operación, pero el detector comercial encontraba «reserva», elegía incluso un tipo por defecto y alcanzaba `createUpsellInterestTicket`. El nuevo test reproduce una escritura antes y cero después. Se excluyen consultas informativas, llegada/reserva y cierres sociales; se elimina la aceptación por mera aparición de «reserva». Se conservan «Reserva el spa», «Me interesa el spa» y «Yes, book it». No se ejecutan conversiones, reservas ni proveedores en el ensayo.
2. **Regresión nueva: estancia confundida con segunda solicitud.** La prueba PostgreSQL existente «Could we have another pillow for our next stay?» fallaba con `needs_review`; main guarda una sola solicitud. `independentRequestTopics` distingue contexto de estancia de una nueva reserva expresamente solicitada. Se conserva la barrera para peticiones independientes reales.
3. **Regresión nueva: coincidencia de “ruido” dentro de “obstruido”.** La prueba existente de ducha obstruida era rechazada como múltiples necesidades. Se delimitan las palabras de ruido; ducha obstruida + ruido de una fiesta siguen siendo dos asuntos. No se cambia ninguna expectativa de los 16 grupos SQL existentes.

No se ha hecho una ronda nueva de estilo. Los resultados desfavorables iniciales se conservan en la evidencia. La antigua aserción de Guest AI y la sensibilidad CRLF de HTTP Security no se “corrigen” debilitando tests.

## Recorridos y límites de integración

Principal y Concierge desembocan en `processGuestMessage` → `recordOperationalRequest` → relectura → composición del acuse → `finalizeServiceReply` → mensaje IA con metadata de calidad. Se probaron las dos generaciones con SDK sustituido y SQL real, y el bloque productivo de finalización. No es un ensayo integral de Twilio ni una evaluación del modelo.

`getRecentMessages` ahora carga solamente `metadata->service_quality`; el prompt sigue usando rol/contenido, sin volcar esa metadata. Las funciones de contexto y las regresiones de Guest Memory OFF mantienen fuera perfiles y memorias personales; esto no implica que la conversación y los datos operativos autorizados nunca lleguen al proveedor en el producto real.

`buildConversationCopilot` reutiliza hechos y planes; no llama la RPC de recuperación. El modo `staff_draft` tampoco puede escribir. `createTicketFromAiResponse` y `createOperationalTicketForConciergeRisk` no tienen llamadas en el recorrido actual revisado. Los flujos comerciales genuinos y experiencias siguen siendo contratos independientes; esta revisión evita la entrada falsa informativa, **no acredita atomicidad global de tickets comerciales + conversiones + proveedores** ni amplía sus capacidades.

Habitación y estancia siguen viniendo del contexto autorizado existente; no se incorporan el importador ni asociaciones nuevas por teléfono/nombre de Ubikos. La recuperación exige una única fuente verificable y el mismo hotel, huésped, conversación, reserva, habitación y fase. Ventana actual: ocho mensajes; fuentes que faltan, intervención de personal, cambio de estancia, retiro, varias solicitudes o correcciones no interpretables pasan a revisión. No se reconstruye por coincidencia temática.

Cancelación efectiva y gestión automática de varias solicitudes independientes siguen sin implementar. Registrar un desistimiento no cancela. La clasificación lingüística es acotada; las pruebas sintéticas no garantizan todas las paráfrasis ni idiomas.

## Migración revisada

Archivo **`supabase/sql/recover_failed_operational_request.sql`**.
SHA-256 exacto de los bytes LF propuestos y del blob Git:
`36a73e3c8759c7c51ccdf2bec9e39c02753a3452bcf734e203c6cfca9c5faa47`.
No se cambió el SQL del commit anterior. El archivo local se normalizó a esos mismos bytes LF; evitar aplicar una copia distinta sin volver a verificar su hash.

Dependencias: `add_operational_request_receipts.sql` → `guard_operational_request_clarification.sql`; se comprueba también convivencia con `add_attention_ticket_lifecycle.sql` publicado. No reaplicar indiscriminadamente las dependencias ya instaladas.

- Añade/reemplaza **solo** `public.recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb) RETURNS jsonb`.
- `SECURITY INVOKER`, `search_path=pg_catalog,public`, objetos de datos cualificados. Revoca EXECUTE de PUBLIC, anon y authenticated; concede EXECUTE a service_role. No cambia privilegios de tablas ni RLS.
- No añade tablas, columnas, índices, triggers, cron, backfills, defaults, borrados ni cambios de estado. `NOTIFY pgrst` solicita refrescar el catálogo, no ejecuta una petición operativa.
- Valida 2–8 fuentes únicas, identidad del último mensaje y orden temporal. La RPC existente conserva las guardas hotel/huésped/conversación/reserva y los bloqueos hotel → conversación → estado IA/ticket. El wrapper retiene esos bloqueos hasta el commit de todos los recibos.
- El primer recibo se reproduce si ya existe; los siguientes exigen el ticket exacto. Un fallo intermedio revierte toda la transacción. Un recibo antiguo no se borra ni se reutiliza para otro ticket.
- La prioridad se calcula con las fuentes originales y correcciones admitidas. Un ticket ya guardado conserva la prioridad vigente del personal; la continuación no restaura una prioridad histórica. Una finalización humana no se reabre. El trigger de versiones existente avanza la revisión al añadir detalle, y los recibos forman un único grupo de atención en Inbox.
- El consumidor relee el ticket por cuatro identificadores, estancia, contenido y último mensaje antes de confirmar. La RPC ausente o la relectura fallida dejan un resultado no confirmado; no hay fallback no atómico.

La transacción de instalación es breve, pero requiere locks de catálogo y permisos del instalador. Antes de instalar, comprobar que cualquier función homónima existente corresponde al contrato revisado; `CREATE OR REPLACE` no debe usarse para sobrescribir un cuerpo desconocido.

## Matriz local de código y esquema

“Esquema actual” significa **reconstrucción local de dependencias versionadas relevantes**, incluidos los triggers de recibos y ciclo de vida; no una copia íntegra ni una consulta del catálogo remoto de hoy.

| Consumidor | Catálogo desechable | Resultado |
|---|---|---|
| Main `f627f8b` real, checkout limpio | Contrato anterior | PASS alta, relectura y reintento sin duplicación; no se atribuye al código antiguo la corrección D11. |
| Mismo main | Más wrapper nuevo | PASS mismo recorrido y recibos. Instalación y repetición conservan tickets, recibos, mensajes y hoteles ya poblados. |
| Código nuevo | Más wrapper nuevo | PASS D11 íntegro y prioridad alta, rollback del segundo recibo, cinco consumidores concurrentes, aislamiento, control humano, prioridad del personal, cierre humano y agrupación Inbox. |
| Código nuevo | Sin wrapper | PASS de seguridad: fallo real de función ausente, cero ticket/recibo parcial, sin acuse falso. Instalar y reintentar la **misma** operación recupera una sola solicitud. No es disponibilidad funcional completa hasta instalar. |

El parámetro local `TEST_SERVICE_BASELINE_CHECKOUT` obliga a SHA exacto y checkout limpio para las dos combinaciones antiguas; CI ejecuta siempre las combinaciones del consumidor nuevo. No se agrega una copia de main al repositorio. PostgreSQL 17.10 nativo, temporal, loopback, sin base remota; fsync desactivado en fixtures: no se acredita durabilidad frente a caída física.

## Pruebas y evidencia

- `ci:critical`: **48 comandos PASS**, incluida sintaxis de **458 archivos**; job local con LF en `dashboard/lib/demo.js`, como GitHub/Linux. Byte original restaurado al terminar. Incluye sintaxis y la nueva `test:service-integration`, además de contexto fallido, recibos, precisión, llegada, operación, control humano, Inbox, Guest Memory OFF y aislamiento.
- `test:failed-request-recovery-postgres`: **22 grupos PASS**, incluida matriz y preflight read-only. `test:operational-requests-postgres`: **16 grupos PASS** tras corregir las dos regresiones; main también pasa 16 usando un adaptador de transporte local excluido de Git. `test:attention-lifecycle-postgres`: **10 grupos PASS**.
- Estos dos tests existentes admiten ahora el runtime nativo explícito ya usado por recuperación. Su alternativa Docker de CI y sus aserciones se conservan; los booleanos SQL se proyectan como texto portable.
- `test:fresh-service-postgres`: siete conjuntos históricos, **252 turnos de ruta**, **358 generaciones del doble**, cero propiedades fallidas. Son 45 ejecuciones de casos, con solapamiento entre conjuntos, no 45 conversaciones independientes. Principal, Concierge e Inbox comprobados. Se ejecutaron antes de los dos ajustes finales de clasificación; las regresiones afectadas de operación/integración y el job crítico se repiten después. No se interpreta este resultado como calidad del modelo.
- Build aislado final del Dashboard y `git diff --check`: **PASS**. Sin pruebas visuales nuevas: no hay cambios de interfaz.
- CI versionado: tres jobs en `.github/workflows/ci.yml`. El job crítico incluye todas las regresiones nuevas de comportamiento del motor. El job PostgreSQL llama recuperación y los siete conjuntos; no ejecuta `arrival-naturalness-real-reserve.json`. Las utilidades de diagnóstico y configuración de desarrollo no son tests de producto requeridos en CI.
- Docker no tiene endpoint local disponible. **No se declara PASS del job PostgreSQL completo ni de los jobs remotos**; quedan por ejecutar en GitHub Linux todos los grupos de otras áreas y las baterías de navegador del job Dashboard. No se omiten ni cambian comandos del workflow.
- **Fallo preexistente**: `test:guest-ai-tenant-isolation` falla tanto en main como en la rama por exigir la consulta textual directa `withHotel(supabase.from('ai_logs'))` en el Dashboard, ahora delegada. No está en `ci:critical` actual; no bloquea ese job, pero sí una política de aprobación que lo exigiera. Sigue FAIL y separado.
- **Diferencia de entorno**: HTTP Security falla en ambos checkouts CRLF y pasa en ambos con LF, sin alterar expectativas. GitHub usa LF; el job crítico original CRLF queda registrado como FAIL, no reinterpretado como PASS.

La reserva **`arrival-naturalness-real-reserve.json`** sigue sin ejecutar ni modificar. SHA-256 LF `329223069d3a7565fecfa703c989da9a07a2e5be0ae406296970bc95b95af939`. Los conjuntos R/N/F históricos ejecutados son otros archivos, ya consumidos en fases anteriores.

Evidencia y fallos: `docs/evidence/service-integration-review/manifest.json` y logs comprimidos. **0 llamadas externas, 0 tokens reales, 0 gasto de API**. No se buscaron credenciales. Las generaciones antiguas de otros informes se releen como evidencia histórica, no como llamadas de esta fase.

## Catálogo y transición futura

No se accedió a Supabase, Vercel ni Railway en esta fase. Se reutilizan la revisión de recibos del **2 de octubre** y la del ciclo de vida del **8 de octubre** (`operational-requests-inbox-stability-review.md`, `attention-lifecycle-review.md`); acreditan lo observado entonces, no el estado de hoy. Falta comprobar catálogo y destino efectivos en el momento de publicar.

Preflight preparado: `supabase/sql/preflight_failed_operational_request_recovery.sql`, `BEGIN TRANSACTION READ ONLY`/`ROLLBACK`; solo catálogo, sin filas de huéspedes ni invocar RPC operativas. Ensayado localmente. Revisar tipos/defaults, cuerpos de funciones, propietarios, ACL efectivos, RLS, índices, constraints y triggers. Comparar los cuerpos con las dependencias versionadas; una firma idéntica no acredita el mismo contrato. El nombre de base no acredita projectRef: comprobar por separado el cliente de servidor de backend y Dashboard, sin exponer claves.

Orden propuesto (ninguno ejecutado):
1. Autorizar publicación y el SQL exacto; PR/CI/revisión del SHA final. Inventario privado de versiones y puntos de entrada; mantener flags. Previews no deben mutar producción por estar Ready o ser borradores.
2. Lectura de destino y catálogo efectivo; si difiere, detener instalación y concretar incompatibilidad. Comprobar exposición PostgREST mediante catálogo/OpenAPI con acceso de servidor autorizado, nunca reclamando mensajes reales.
3. Aplicar **solo** el wrapper tras verificar dependencias y huella; verificar cuerpo, permisos (anon/authenticated sin EXECUTE), `search_path` y recarga de esquema. El main anterior puede seguir usando su RPC sin cambios.
4. Para habilitar de forma uniforme la corrección D11, inventariar todas las réplicas y entradas a `processGuestMessage`: `/webhooks/whatsapp`, controlador de pruebas si estuviera habilitado, reintentos y consumidores externos configurados. El repositorio no demuestra el inventario desplegado. Drenar/bloquear temporalmente solo el procesamiento afectado o usar una transición sin convivencia de consumidores, conservando las identidades y el orden de los mensajes pendientes. `SEND_AUTOMATIONS=false` por sí solo no acredita drenaje del circuito de atención.
5. Desplegar backend nuevo, verificar SHA y salud de todas las réplicas y retirar consumidores antiguos. Durante convivencia, los antiguos ignoran marcadores nuevos y pueden volver a crear un seguimiento genérico; que el SQL sea compatible no implica que toda la flota tenga D11 corregido. No habilitar el recorrido nuevo como garantizado hasta retirar esa convivencia.
6. Desplegar Dashboard del mismo candidato: sus borradores comparten reglas, sin escrituras nuevas. Verificar versión Production por metadatos efectivos, no por otro Preview. Mantener la disponibilidad de Dashboard/Inbox durante el drenaje cuando sea posible.
7. Lectura pública autorizada: Dashboard, Inbox y Salud, contexto/hotel, estados, borradores, sin enviar ni modificar tickets. Cualquier prueba de escritura/timeout/recuperación debe tener hotel técnico e identidades sintéticas autorizados por separado; no usar demo ni huéspedes. Verificar recibos y prioridad por lectura, nunca fabricar fallos remotos de permisos o datos.

Build/arranque versionados no aplican esta migración ni lanzan limpieza; el nuevo wrapper solo se invoca en el recorrido de recuperación. La programación externa desplegada no se inspeccionó y no se presume ausente.

## Recuperación y decisión de publicación

Antes de usar el wrapper, una instalación fallida revierte su transacción; el consumidor anterior conserva su contrato. Tras usarlo, conservar tickets, recibos, fuentes, marcadores y versiones. Ante un resultado incierto, inspeccionar/reintentar por las mismas identidades; nunca borrar recibos, reencolar con IDs nuevos ni reemplazar datos con un respaldo antiguo. Si no se acredita el contrato, mantener bloqueado el consumidor afectado y corregir hacia delante.

Volver al código anterior conserva compatibilidad SQL aditiva, pero **pierde la recuperación D11 y las guardas nuevas**; no es restauración funcional segura. No retirar la RPC mientras alguna versión la use. No eliminar triggers de ciclo de vida ni modificar prioridad/estado para forzar éxito.

Recomendación: preparar una PR operativa del conjunto revisado con sus dependencias compartidas y pruebas, indicando que naturalidad real sigue aplazada. No dividir los commits mediante cherry-pick ciego: D11 importa interpretación/selección de turnos y cantidades de fases anteriores. Si se exige posponer también toda redacción, habría que preparar otra rama desde main con el cierre transitivo `operational-request`, `ticket-context`, contexto fallido, SQL, consumidor y metadata, y rehacer sus acuses/tests; esa separación **no está acreditada** en esta entrega. Los presupuestos, scripts de evaluación y evidencia editorial pueden revisarse como anexos independientes, sin afirmar que el motor reducido ya esté validado.

No hay defecto operativo reproducido pendiente en los casos afectados tras los ajustes. Condiciones concretas restantes: CI completo Linux y revisiones; preflight real autorizado; publicación y retirada de versiones; posterior evaluación real/revisión humana para afirmar naturalidad. La cancelación, varias solicitudes y atomicidad comercial global son límites funcionales explícitos, no mejoras de redacción pendientes de “activar”.

Producción, demo, permisos, datos, Guest Memory OFF y SEND_AUTOMATIONS=false no se han modificado. Sin push, PR remota, merge, despliegue, SQL remoto ni envíos.
