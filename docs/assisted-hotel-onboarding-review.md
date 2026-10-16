> Estado vigente del candidato integrado: [revision del 16 de octubre de 2026](assisted-onboarding-integrated-candidate.md). Este informe conserva las evidencias y conclusiones historicas de su SHA.

# Alta asistida y contrato PMS — revisión local (15 de octubre de 2026)

## Alcance y base

Rama `codex/assisted-hotel-onboarding`, worktree `.npm-cache/assisted-hotel-onboarding/worktree`.
Base de origin/main comprobada: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`.
Se consultó la auditoría documental `5122848eaefb016971832307a85919fb386af835`.
No se han integrado organizaciones, PR #54/calidad IA, economía ni `codex/pms-read-context-foundation`.
Los inventarios, el informe local de Daniel y los otros worktrees se conservan.

Commits: `a854633` (invitaciones), `4052918` (configuración/revisión), `d10a1ca`
(endurecimiento y recuperación de invitaciones); el bloque PMS y el laboratorio acompañan este informe.
No hay push, PR, publicación, SQL remoto, altas reales, correos, cambios de permisos/configuración
remotos, limpieza, llamadas a modelos o proveedores. Guest Memory OFF y SEND_AUTOMATIONS=false
se fuerzan únicamente en los procesos de prueba; las variables desplegadas no se han tocado.

## Acceso y recorrido

Se reutiliza `create_hotel_onboarding_v1`: hotel, asignación pendiente y onboarding atómicos,
con la idempotencia anterior. Aceptar una invitación nunca crea un segundo hotel.

Se elige un enlace de aplicación unido a Supabase Auth, en lugar de usar la apertura del
correo Auth como concesión hotelaria. Auth mantiene registro, contraseña, sesión y confirmación
del correo; la aplicación necesita aceptación explícita, revocación y recuperación propias.
Fuentes oficiales: [signUp](https://supabase.com/docs/reference/javascript/auth-signup),
[contraseñas](https://supabase.com/docs/guides/auth/passwords),
[confirmación de correo](https://supabase.com/docs/guides/auth/general-configuration).

El secreto aleatorio tiene 256 bits; SQL guarda SHA-256. Viaja en fragmento, se retira de la
barra y permanece en sessionStorage solo mientras se incorpora el usuario. Se borra al
confirmar el acceso. Nunca se guarda en tablas, logs o DTO de consulta en claro. Solo se
entrega en la respuesta de generación y se copia mientras esté en memoria. Sustituirlo
revoca el anterior. Caduca en siete días (vida del enlace, no regla de conservación de datos).
GET no acepta ni consume. POST de inspección tampoco concede. POST de aceptación comprueba
correo confirmado coincidente, identidad no bloqueada, hotel, rol y asignación vigentes.
SQL bloquea hotel → asignación → invitación. La aceptación repetida solo confirma el mismo
acceso activo: no reactiva accesos deshabilitados ni hoteles archivados/retenidos. No concede
roles internos. El administrador que genera/revoca también requiere identidad verificada.

La sesión incorrecta puede cambiar de cuenta sin perder el enlace. Una pérdida de respuesta
tras aceptar se recupera consultando de nuevo: se reconoce la aceptación y se selecciona el
hotel acreditado. Los enlaces inválidos explícitos no reutilizan un token anterior de sesión.
Revocar una invitación ya aceptada no sustituye deshabilitar el acceso desde el equipo.

Se elimina la concesión automática por coincidencia de correo. Los usuarios con UUID Auth
válido mantienen su asignación. Las filas históricas pendientes no se promocionan. Las filas
legacy `active` sin identidad ya no obtienen acceso por correo: necesitan revisión y aceptación
explícita. Es una dependencia concreta de transición, sin backfill ni cambio remoto en esta fase.
Platform, onboarding y preparación del backend requieren evidencia de identidad de la asignación.
Una fila active sola, un total estadístico o una invitación no acreditan equipo incorporado.
El navegador no recibe el directorio Auth; la RPC solo devuelve IDs de asignaciones de ese hotel.

## Estados y responsables

| Estado/capacidad | Evidencia | Responsable y acción permitida |
|---|---|---|
| Hotel creado, responsable pendiente | Alta persistida, asignación invited | Staynex genera, copia, reemplaza o revoca enlace en el detalle de Platform. |
| Responsable incorporado | Auth confirmado + aceptación atómica + asignación activa | Responsable entra en ese hotel; accesos deshabilitados no cuentan. |
| Datos básicos pendientes/completos | Campos persistidos y zona horaria confirmada | Hotel guarda contactos, horarios, datos e información conocida; puede retomar. |
| Información guardada, pendiente de revisión | Contenido existente sin atestación vigente | Hotel revisa información y confirma expresamente; una edición invalida la revisión. |
| Información revisada | Hash del contenido vigente y actor autorizado | Hotel puede revisar otra vez cuando cambie. No es una certificación externa del contenido. |
| PMS sin seleccionar/configurado | Configuración guardada, nunca una conexión implícita | Staynex prepara proveedor, entorno, cuenta y propiedad. Hotel consulta y coordina. |
| Acceso PMS comprobado | Recibo reciente, misma propiedad/entorno/revisión | Staynex realiza la comprobación autorizada; una cuenta de pruebas no habilita live. |
| Sincronización/cobertura | Recibo de ejecución con cobertura | Actual importador: desconocida o parcial. No se acredita completa por filas o HTTP 200. |
| WhatsApp pendiente | Dependencia externa persistida | Hotel registra la dependencia existente; Staynex/proveedor la resuelven después. |
| Configuración básica completada | Validación del servidor y estado persistido | Responsable finaliza y llega a Salud, conservando su hotel. |
| Atención automática/live | Controles independientes existentes | Continúan bloqueados; finalizar no activa PMS, WhatsApp, IA ni envíos. |

El asistente conserva los seis pasos/rutas y añade tres etapas legibles. No solicita reservas,
habitaciones, UUID, SQL ni credenciales PMS al responsable. Se reutilizan Información del hotel,
Usuarios y el formulario de perfil. PMS se gestiona exclusivamente con rol interno autorizado.
La falta de PMS permite cerrar la configuración básica, sin marcar preparada la operación live.
La información se revisa mediante un hash de hotel_knowledge/local_knowledge_items; guardar no
acredita revisión. El endpoint knowledge-starter solo admite la demo explícita identificada por
UUID y slug reservados: no siembra información ficticia en un hotel ordinario.

## Contrato PMS y límites de importación

`shared/pms/connection-contract.js` es la fuente común para evidencia vigente. Se vincula a
hotel, conexión, proveedor, entorno declarado, propiedad y revisión. Guarda tipo, inicio,
fecha, resultado y cobertura. La vigencia de 48 horas reutiliza el criterio anterior de Salud.
Cambiar credenciales (incluido webhook), ámbito, destino, modo o habilitación incrementa la
revisión e invalida evidencia actual. El último éxito queda separado como histórico. Una
respuesta tardía de otra revisión o anterior al último intento no puede volver a poner verde.
Deshabilitar no conserva estado positivo. Las tarjetas, onboarding, Platform y Salud leen esta
evidencia; reservas antiguas y sync_status legado no acreditan conexión.

Apaleo: cuenta y propiedad son campos diferentes. Se exige propiedad explícita y entorno
`test`/`production`; ambos usan el host oficial, no dominios inventados por entorno.
[Booking Swagger oficial](https://api.apaleo.com/swagger/booking-v1/swagger.json) documenta
`propertyIds` y `reservation.property.id`; [Inventory Swagger oficial](https://api.apaleo.com/swagger/inventory-v1/swagger.json)
documenta la lectura de la propiedad. El listado envía propertyIds y valida cada registro;
detalle y webhook vuelven a validar propiedad, incluso con transportes inyectados.
Ausencia/contradicción/propiedad ajena fallan. No se infiere una cancelación si falta el detalle.
La entrada genérica de importación no puede introducir Apaleo sin el contrato específico.
También el adaptador de registro comprueba la propiedad; su healthCheck no confunde registro
con conexión verificada.

Destinos permitidos: HTTPS api.apaleo.com, puerto estándar, sin credenciales de URL, con rutas
GET limitadas a booking/v1/reservations[/id] e inventory/v1/properties/id. OAuth mantiene el
endpoint fijo existente de identity.apaleo.com. Se valida antes del token, se prohíben redirects
en API y OAuth, no se siguen next-links externos. El paginador existente usa números de página.
La caché incluye hotel/conexión/revisión/entorno/propiedad/cuenta/credenciales. No devuelve
payloads del proveedor en errores. Los DTO siguen saneando secretos.

SQL valida el vínculo de cada reserva Apaleo y serializa con cambios de conexión. Cambiar
hotel/proveedor/cuenta/propiedad/entorno con reservas o snapshots derivados existentes exige
revisión específica. No se reasigna el histórico. Los registros antiguos no reciben vínculos
inventados. Los escritores antiguos sin vínculo fallan cerrados: esto requiere una transición
coordinada antes de publicar.

No hay atomicidad global del importador: el listado se valida antes de iniciar su lote, pero
si falla la persistencia después de filas válidas, estas pueden quedar guardadas. El pipeline
heredado puede haber creado datos derivados de huésped antes de que la guarda SQL rechace la
reserva si cambia la revisión concurrentemente. Los intentos fallidos/parciales se registran;
no se anuncia completitud. Checkpoints, recuperación exhaustiva, borrados y efectos derivados
seguros pertenecen al trabajo pendiente de importación, que no se ha integrado aquí.

Ubikos: todos los métodos fallan como no disponibles fuera de una composición sintética
explícita. Un flag JSON o credencial del cliente no abre sandbox. Los fixtures requieren una
capacidad Symbol no serializable, además de enabled y sandbox explícitos en el proceso local.
getRoomStatus no devuelve hotel_status ficticio fuera de ese ámbito. Otros proveedores siguen
pendientes; no se han inventado endpoints, scopes, estados ni mapeos Ubikos.

## Migraciones locales y transición propuesta

Orden, tras las migraciones existentes de alta atómica:
1. add_hotel_access_invitations.sql: tabla privada RLS, índice del hash único, RPC de emisión/
   revocación/aceptación y evidencia de identidad; ejecución solo service_role. No backfill.
2. add_hotel_information_review.sql: tabla privada RLS y RPC de consulta/atestación limitada
   por actor/hotel; solo service_role. Sin promociones ni contenido sembrado.
3. add_pms_connection_evidence.sql: config_revision (default 1), evidence (default {}),
   last_success_evidence, cuatro columnas nullable de vínculo en reservations, FK a conexión,
   dos triggers/funciones de guarda y RPC de evidencia solo service_role. Sin backfill de
   reservas, sin nuevos permisos cliente ni índices sobre datos operativos. Los registros
   preexistentes reciben revisión 1/evidencia vacía; eso no es una prueba de conexión.

Se ensayaron aplicación repetida, transacciones, permisos y concurrencia en PostgreSQL 17.10
desechable sin red/volúmenes/puertos publicados. No se ha comprobado ni modificado el catálogo
remoto. Antes de publicación: contrastar tipos/defaults, constraints, ACL/RLS, propietarios de
RPC, triggers previos, columnas disponibles y versiones activas; IF NOT EXISTS no demuestra
compatibilidad de una columna ya existente. Confirmar el destino efectivo antes de SQL.

Durante la futura transición, drenar importadores, cron, webhooks, reintentos y réplicas viejas
que escriban reservas/conexiones; no basta SEND_AUTOMATIONS=false. Aplicar migraciones y
actualizar backend/dashboard coordinadamente antes de rehabilitar importación. Mantener los
flags, revisar legacy active sin identidad y propiedad/entorno de conexiones existentes.
No aceptar links legacy automáticamente ni reinterpretar histórico como evidencia.
Verificar PostgREST y nueva versión en todas las réplicas antes de operaciones PMS.
Recuperación segura: conservar datos/tablas/recibos, detener escritores incompatibles y
corregir hacia delante. No retirar las guardas ni volver sin más a código viejo que acepta
usuarios por correo o escribe Apaleo sin vínculo. No se ha ejecutado este procedimiento.

Auth de producción debe confirmar correos realmente: un timestamp auto-confirmado por tener
Confirm email desactivado no demuestra entrega. Configurar el redirect /invite y el transporte
Auth autorizado, sin incluir el token hotelario en ese redirect. Excluir cuerpos de la API de
invitaciones, fragmentos y sessionStorage de registros/analítica. Probar entrega real solo en
una fase autorizada; esta entrega no acredita correo ni Auth remotos.

### Huellas SQL

SHA-256 del contenido versionado con saltos LF:
| Archivo | SHA-256 LF |
|---|---|
| `add_hotel_access_invitations.sql` | `847c76923da372186d1c74e4b863eda267c8a2d5f4cd8bfcce5d4fcd1b83f3c3` |
| `add_hotel_information_review.sql` | `a6f96329a08070c1a75a8e2d6b30353e59a33c7d2e8e0d771dcd2347e4dbae14` |
| `add_pms_connection_evidence.sql` | `7dd8dfb69cffb2f740d5d1bfdce8ac4bfd507347969fc69b391c17aa0ef017f2` |

Las copias Windows pueden tener CRLF; las pruebas leen el SQL completo y PostgreSQL acepta
ambos. Para aplicar en otra fase, fijar el blob Git revisado y su huella, no un archivo temporal.

## Pruebas y evidencia local

- Invitaciones/revisión: 10 grupos PostgreSQL/API PASS; identidad nueva/existente, correo
  incorrecto/no confirmado, inválido/caducado/revocado, inspección sin concesión, seis
  aceptaciones concurrentes, revocación concurrente, pérdida de respuesta, manipulación,
  hotel retenido, identidad inválida/deshabilitada y revisión obsoleta.
- PMS SQL: 6 grupos PASS; migración repetible, permisos, giro de credencial, respuesta vieja,
  último fallo, separación hotel/propiedad, escritor sin vínculo, histórico derivado y disabled.
- Contrato PMS: 6 grupos PASS; URLs rechazadas antes de credenciales, redirects, dos propiedades,
  ausencia/contradicción, listado/detalle, segunda página fallida, caché, estados comunes,
  preparación con identidad real y todos los métodos Ubikos fuera de sandbox.
- Webhooks/tenant: 44 comprobaciones PASS. Ubikos sintético PASS.
- PMS onboarding: 11 grupos PASS. Validación de alta: 8 grupos PASS. WhatsApp: 6 grupos PASS.
  Navegación, Auth-context, Salud veraz y aislamiento de Knowledge/demo PASS.
- Batería critical ejecutada localmente: todas las tareas previas a HTTP Security pasan,
  tras actualizar el fixture de phase2a2 con propiedad/entorno/revisión y repetir esa prueba.
  No se han cambiado sus expectativas. No se ha ejecutado CI remoto.
- HTTP Security NO PASS en checkout Windows: aserción literal de LF en testDemoRouteBlockingFixes
  (línea 540) frente a CRLF. Script y bloque comprobado no modificados; fallo heredado separado.
  Un primer intento aislado además no pudo abrir su socket local; la repetición autorizada
  alcanzó la aserción CRLF. No se ha debilitado la prueba.
- Otros estáticos heredados identificados al iniciar: PMS secrets (CRLF y literal antiguo),
  permissions (CRLF/regex de hooks), pilot-onboarding (wrapper antiguo), location integrity
  (literal canManage) y golive-readiness (fixture sin ubicación válida). No son PASS ni se
  han relajado; las nuevas regresiones de comportamiento cubren los contratos modificados.
- Build de Dashboard y laboratorio PASS. Sintaxis y diff --check PASS.

Los ensayos de navegador usan Edge/Playwright, 1366 y 390 px, ambos temas, etiquetas accesibles,
aceptación/finalización con Enter y menú móvil/Escape. Auth y entrega de verificación son
transportes simulados; los formularios, handlers de invitación/perfil/estado/Knowledge y SQL
son reales. Salud lee el mismo contexto sintético y hotel creado. No es una prueba de Auth
remoto ni de lector de pantalla. Datos de otras pantallas fuera de este recorrido pueden ser
fixtures de presentación; no se usan para acreditar funcionamiento de producto.

Capturas y logs se conservan fuera de Git en `.npm-cache/assisted-onboarding-evidence/` y
`.npm-cache/assisted-*.log`. Incluyen invitación y PMS a ambos anchos/temas, aceptación y Salud.
Los estados de sesión sintéticos también quedan excluidos de Git. No contienen huéspedes reales.

## Laboratorio reproducible

Requisitos: Node 24.19.0, dependencias del proyecto, Edge y Docker local con postgres:17.10
previamente descargado. El script no descarga imágenes ni hereda credenciales o .env.

```powershell
node scripts/assisted-onboarding-lab.cjs build
node scripts/assisted-onboarding-lab.cjs start
# En otra terminal, desde el mismo worktree:
node scripts/test-assisted-onboarding-browser.cjs
node scripts/test-assisted-onboarding-completion.cjs
node scripts/test-assisted-onboarding-browser.cjs --new-account
node scripts/test-assisted-onboarding-completion.cjs --new-account
```

URL: http://127.0.0.1:3380/lab. El puente de datos/Auth escucha solo en 127.0.0.1:3381.
Ctrl+C retira únicamente su contenedor temporal; reiniciar crea un escenario vacío.
En la pantalla inicial, «Usar cuenta Staynex sintética» permite el alta. La cuenta existente
owner@example.invalid ya está verificada en el laboratorio; una contraseña sintética basta
(el adaptador no almacena contraseñas). Para la cuenta nueva, el test automatiza signup y la
entrega simulada de verificación. Esto nunca sustituye a Supabase Auth en el código publicado.
La UI no expone secretos PMS ni operaciones remotas. Las pruebas bloquean cualquier host externo.

## Pendientes concretos

Ubikos: contrato de autenticación/endpoints, identidad de hotel/propiedad, ejemplos, paginación,
versionado/cambios, estados y relaciones oficiales; cliente y mapeo real todavía inexistentes.
Importación: coordinar sin integrar ahora la rama foundation, checkpoint/reanudación, orden de
versiones, cobertura completa y contención de todos los efectos derivados antes de piloto real.
Piloto: preflight remoto y revisión de accesos legacy, entrega Auth, credenciales autorizadas,
validación de propiedad/entorno con el hotel y ensayo independiente de capacidades live.
Nada en esta entrega acredita PMS real conectado ni hotel listo para atención automática.

## Procedimiento sin jerga

**Para Staynex:** crea el hotel con sus datos básicos y correo del responsable. Abre su detalle,
genera el enlace y entrégalo en privado. Si se pierde o caduca, genera otro. Comprueba que el
responsable se incorpora. Coordina y verifica el PMS más adelante; no actives atención automática
por haber terminado el alta.

**Para el responsable:** abre el enlace, crea tu cuenta o inicia sesión con ese mismo correo y
verifícalo. Acepta la invitación. Revisa los datos del hotel, guarda la información conocida y
confirma su revisión. Puedes salir y volver. Finaliza la configuración disponible y consulta
Salud: las conexiones pendientes seguirán indicadas con su responsable y siguiente paso.
