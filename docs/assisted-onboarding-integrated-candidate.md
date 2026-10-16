# Alta asistida: candidato integrado, 16 de octubre de 2026

Estado: **preparado con condiciones para una publicación controlada; no publicado**.
Este documento sustituye las conclusiones de preparación anteriores, conservadas como
historial. No vuelve a abrir la acreditación del destino. Los resultados del SHA final
y enlaces de CI se registran en la PR de integración y en su comentario de cierre.

## Referencias y límites

- Rama aislada: `codex/assisted-onboarding-publication-candidate`.
- Integra el onboarding local `2e8f6f61a37797231a7e66f584250c310d85c695` con la
  observabilidad publicada `e324bd1ea715c1017082b9cc10367a73effb3e9d` y las correcciones
  de esta revisión. Las ramas originales y PR #55/#56 permanecen en borrador, sin auto-merge.
- Main comprobado: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`.
- Vercel Production: `dpl_CyVWvZfehTzGNnWbTFYHsBNnDBsn`, SHA `e324bd1`, READY.
- Railway: `407f5c24-c260-4c1d-add6-9d7df095073a`, réplica
  `8a806cf9-fe83-4706-a566-d64c24b6a186`. La interfaz confirma main automático,
  una réplica, sin cron/predeploy, Wait for CI OFF y healthcheck `/health`.
- Destino acreditado reutilizado: `vblxmnqbatqrynfaasmf`; no inferido del cliente público.
- Solo lecturas de metadatos y siete definiciones de funciones del catálogo en esta
  fase. Ninguna migración, operación Auth, cambio de variable, pausa, envío o alta remota.
  Cero llamadas reales a IA/PMS/correo/WhatsApp y cero gasto de API generado por pruebas.
- El push activa CI y Preview de Vercel. Production se mantiene en main. El workflow no
  despliega ni contiene secretos; npm ci usa `--ignore-scripts`. Build, arranque y scripts
  de aplicación no aplican SQL. Preview se consulta exclusivamente por metadatos, nunca
  mediante navegación funcional: pertenecer a una PR en borrador no lo aísla de Supabase.

## Correcciones integradas

### Auth y aceptación

`AccessInvitationClient` quitaba el fragmento de la URL antes de inicializar Supabase,
perdiendo la sesión devuelta por la confirmación. `initializeInvitationSession` espera
`getSession()` y valida el usuario mediante `getUser()` antes de limpiar la URL. Durante
esa espera las acciones quedan deshabilitadas. No se registran fragmentos ni credenciales.
El alta de Auth sin sesión ya no se representa como usuario autenticado.

El SDK real de Supabase se ensaya en navegador con un transporte sintético: retorno
implicit en la misma pestaña, en otra pestaña y enlace Auth expirado. No es una prueba de
entrega de correo real ni de configuración remota de Auth. En otra pestaña/dispositivo
sin el token de invitación se pide abrir el enlace original; no se recupera una invitación
por correo. No hay aceptación por GET, callback ni inicio de sesión.

El token permanece solo en sessionStorage hasta elegir entrar al hotel, permitiendo
recargar y consultar explícitamente el recibo. El servidor devuelve el mismo hotel y rol
en un reintento aceptado, pero niega un destinatario distinto, un token revocado/sustituido,
una invitación caducada o una asignación posteriormente deshabilitada. El cliente valida
la respuesta antes de seleccionar el hotel. Un fallo conserva token y correo para reintentar.

### Identidad y consumidores antiguos

El código nuevo ya no utiliza `resolvePendingInvitationsForUser` para conceder acceso ni
lee asignaciones por coincidencia de email. El backend exige `user_id`.

La revisión confirmó que instalar las tres migraciones anteriores no impedía el UPDATE
del consumidor antiguo. Se añade `guard_explicit_invitation_acceptance.sql`: un trigger
diferido comprueba, al commit, que una vinculación de identidad/activación de invitación
corresponde al recibo explícito, destinatario verificado, hotel, rol y marca temporal exactos.
La aceptación y el recibo se escriben en la misma transacción existente. El service_role
puede leer el recibo, pero no fabricarlo por INSERT/UPDATE directo. No hay GUC de bypass.
Una transacción ya terminada antes de instalar la guarda no se deshace: el drenaje previo
sigue siendo necesario. Tampoco es una defensa frente al propietario de la base o SQL
administrativo arbitrario; cubre los consumidores de aplicación identificados.

La lectura acotada encontró email fallback en cuatro funciones RLS. Se añade
`require_assignment_identity.sql`, que sustituye solamente esa alternativa por
`hu.user_id = auth.uid()` en `staynex_is_platform_admin`, `staynex_is_platform_operator`,
`staynex_can_read_hotel` y `staynex_can_write_hotel`. Conserva firmas, roles permitidos,
semántica de estado, ACL y políticas. Exige que las funciones ya existan. No cambia filas,
no promueve usuarios y no añade permisos. El helper de email se conserva para no romper
dependencias ajenas; estas cuatro funciones dejan de utilizarlo.

Las once asignaciones activas verificadas, la deshabilitada y las dos invitaciones sin
UUID se conservan. En una fase autorizada cada invitación antigua puede emitirse por su
fila existente mediante la acción explícita; no se acepta ni convierte masivamente.

### PMS pendiente y alta administrativa

La tarjeta compartida indica «Pendiente de revisión de conexión», explica que Staynex
debe acreditar propiedad y entorno y mantiene visibles los históricos. Deshabilita prueba
e importación sin vínculo válido. El sincronizador valida antes de descifrar la credencial,
consultar al proveedor o escribir huéspedes/reservas. La guarda SQL de reservas permanece.

Las cuatro conexiones legacy y las cien reservas históricas no se rellenan por suposición.
No se conectó Apaleo ni se cambió ninguna credencial. La restricción global de identificadores
externos queda pendiente PMS: no impide crear hotel, aceptar invitación, revisar información
y finalizar la configuración administrativa con servicios pendientes.

## Auth: propuesta remota exacta, NO aplicada

Estado observado previamente, sin cambio comunicado: Site URL `http://localhost:3000`,
Redirect URLs vacías, signup/email/confirmación habilitados, SMTP personalizado deshabilitado
y plantilla de confirmación estándar con `{{ .ConfirmationURL }}`.

1. Guardar privadamente los valores actuales antes de una futura modificación.
2. Site URL: `https://staynex-chi.vercel.app`.
3. Añadir únicamente `https://staynex-chi.vercel.app/invite` a Redirect URLs. No comodines
   de Preview, dominios de terceros ni callback de organizaciones. Las pruebas locales usan
   Auth sintético y no necesitan una excepción localhost en el proyecto de producción.
4. Conservar confirmación de correo y plantilla `{{ .ConfirmationURL }}`. El cliente envía
   `emailRedirectTo: origin + '/invite'`; el SDK procesa el retorno implicit. No hace falta
   reemplazar la plantilla ni crear un callback de canje de código para este flujo.
5. Primer ensayo: falta únicamente identificar el buzón técnico controlado por nosotros y
   comprobar que YA es destinatario permitido por el servicio incorporado. No añadirlo al
   equipo del proyecto para eludir la restricción. Si no es elegible, usar SMTP propio antes
   de probar; no lanzar el correo para averiguar si falla.

El servicio incorporado solo permite destinatarios del equipo del proyecto, actualmente
limita a dos mensajes/hora y no tiene SLA: no es transporte de invitaciones a clientes.
Para clientes se necesita proveedor SMTP aprobado, remitente/dominio controlados, verificación
de dominio (SPF/DKIM según proveedor), host/puerto/TLS y credencial específica guardada solo
en Supabase Auth, junto con límites y tratamiento de rebotes. Resend en Railway no configura
Auth automáticamente. No se copiaron claves ni se contrató nada.

Fuentes: [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp),
[redirecciones](https://supabase.com/docs/guides/auth/redirect-urls),
[flujo implicit](https://supabase.com/docs/guides/auth/sessions/implicit-flow).
La entrega real, remitente y retorno con el buzón técnico siguen pendientes del ensayo autorizado.
Recuperación de Auth: detener nuevas emisiones, restaurar exclusivamente los valores capturados
si corresponde, conservar cuentas, recibos y pertenencias ya aceptadas. No reenviar en bucle.

## Transición: mecanismo preparado y límite del primer relevo

El nuevo backend incorpora `transition-control.js`. Protege el handler final de los routers
registrados, cuenta hasta que termina su promesa —no hasta cerrar el socket— y expone
GET `/internal/transition` con el token interno existente. Devuelve deployment/revisión,
réplica, modo, activos por grupo, completados y fallidos, sin payloads ni identidades de huéspedes.
POST al mismo endpoint acepta solo `{ "mode": "pms" }` o `{ "mode": "all" }` para restringir;
no permite relajar un modo cerrado. `pms` bloquea mutaciones de integraciones/PMS y mantiene
lecturas; `all` bloquea todos los handlers operativos instrumentados. `/health` sigue disponible.

`TRANSITION_ADMISSION_MODE=open|pms|all` fija el modo inicial (ausente: open). Una futura
ventana debe iniciar el candidato con `all`, conservando ese cierre en reinicios, hasta
acreditar contratos y versiones. Ninguna variable se ha cambiado. SIGTERM restringe admisión
y cierra HTTP sin resetear claims, reencolar ni forzar exit. El timeout de la plataforma puede
interrumpir trabajo: un log de cierre HTTP no equivale a drenaje. `failed > 0` obliga a conciliar
resultados; no significa que nada se haya guardado o enviado.

**El primer relevo sigue condicionado.** El proceso publicado no tiene estos contadores.
No se puede instalar el contador retroactivamente ni acreditar su drenaje a partir de cero
en una réplica recién arrancada. Claims de WhatsApp no constituyen una cola recuperable.

Evidencia indispensable ANTES de sustituir ese proceso:

- Responsable de cada ingreso acredita que puede detener nuevas entregas conservando los
  eventos pendientes y sus identificadores. En particular falta acreditar la retención/reintento
  real configurado de Twilio/WhatsApp y Apaleo durante la ventana. Un 503 sin esa garantía puede
  perder eventos; un 200 ficticio también. Si el emisor no ofrece retención acreditable, se
  necesita primero un ingreso duradero externo revisado (persistir antes de reconocer, conservar
  firma/identidad, replay idempotente autorizado). Este candidato NO implementa esa cola.
- Inventario efectivo de callers directos, jobs/manuales y reintentos, además de las rutas:
  incluir scripts Apaleo y ejecutores fuera del repositorio. Confirmar parada/admisión cerrada;
  no interpretar ausencia en Railway como ausencia global.
- Tras cierre de admisión, correlacionar peticiones antiguas con finalización de handlers,
  recibos y consultas pendientes, por deployment/réplica. Si los registros existentes no permiten
  demostrar cero en curso y resolver inciertos, NO reiniciar ni migrar; falta instrumentación
  externa de ese proceso o una ventana acreditada por el operador, no una espera arbitraria.
- El primer reemplazo solo se autoriza cuando lo anterior esté acreditado. El control nuevo
  servirá para relevos posteriores, no como prueba del primero.

## Secuencia futura y recuperación

1. Congelar SHA aprobado y referencias de destino ya acreditadas; repetir únicamente evidencias
   que hayan cambiado. Confirmar el buzón técnico elegible y preparar/restaurar Auth como arriba.
2. Aplicar controles de admisión autorizados: matriz de 50 rutas/métodos de
   `scripts/fixtures/assisted-transition-route-scope.json` en el Vercel público durante transición;
   bloquear API de **todos** los deployments/aliases antiguos tras sustituirlo, no solo el alias
   principal. El servidor antiguo con service_role podría seguir autorizando por email aunque
   la RLS nueva lo niegue. Mantener los lectores conocidos de Dashboard/Inbox cuando sea seguro.
3. Controlar los siete grupos PMS de la matriz en entradas públicas y privadas de Railway,
   tareas y acceso directo. Antes del reemplazo de todo el backend, incluir WhatsApp y demás
   handlers: retención del emisor y conciliación descritas arriba. No usar un CAPTCHA general.
   No basta el WAF de Vercel ni `SEND_AUTOMATIONS=false`.
4. Acreditar drenaje antiguo y resultados inciertos; conservarlos sin replay automático.
   Tomar inventario privado mínimo y respaldo del contrato/configuración, no una copia pública.
5. Aplicar, una transacción exacta por archivo, en este orden:
   `add_hotel_access_invitations.sql` → `guard_explicit_invitation_acceptance.sql` →
   `require_assignment_identity.sql` → `add_hotel_information_review.sql` →
   `add_pms_connection_evidence.sql`. Los dos primeros contratos originales son aditivos;
   las guardas nuevas y PMS rechazan consumidores antiguos y requieren el cierre previo.
6. Verificar definiciones, propietarios, ACL, triggers habilitados y RLS por catálogo; comparar
   inventarios preservados. Comprobar recarga de PostgREST mediante lectura de su contrato y
   disponibilidad de firmas, sin invocar RPC de negocio ni modificar mensajes para probar.
   Si falta un contrato, el nuevo consumidor debe permanecer cerrado; no usar fallback por email.
7. Merge normal únicamente en la fase autorizada. Vercel y Railway reaccionan a main de forma
   independiente, y Railway no espera CI: conservar controles externos y modo inicial cerrado
   durante toda convivencia. Verificar SHA de ambos, todas las réplicas y ausencia de procesos
   antiguos, más observabilidad privada del cliente servidor conservada.
8. Abrir solo rutas nuevas de alta/invitación/configuración cuando estén acreditadas. Mantener
   bloqueados los escritores PMS legacy hasta revisión independiente, sin tocar sus credenciales.
   Para reabrir el backend se requiere cambio de modo inicial revisado y nuevo relevo drenado;
   el POST de control no reabre. Revalidar todas las réplicas y cerrar definitivamente APIs antiguas.
9. Ensayo técnico descrito abajo. Mantener Guest Memory OFF, SEND_AUTOMATIONS=false y los demás
   controles operativos. Ningún paso de configuración administrativa autoriza operación live.

Fallo antes de SQL: mantener puertas cerradas y resolver evidencia. Fallo entre archivos: conservar
los contratos aplicados y completar hacia delante; no borrar tablas/recibos/índices ni filas.
Fallo de deploy: mantener cierre y corregir sobre un consumidor compatible. No restaurar
autoasignación por email ni quitar las guardas para que funcione un binario antiguo. Un rollback
de Auth no revoca ni elimina una aceptación ya persistida. No resetear intentos inciertos.

## SQL exacto y efectos

Hashes SHA-256 del contenido Git con LF; no del checkout CRLF:

| Archivo | SHA-256 |
|---|---|
| add_hotel_access_invitations.sql | `847c76923da372186d1c74e4b863eda267c8a2d5f4cd8bfcce5d4fcd1b83f3c3` |
| add_hotel_information_review.sql | `a6f96329a08070c1a75a8e2d6b30353e59a33c7d2e8e0d771dcd2347e4dbae14` |
| add_pms_connection_evidence.sql | `2687195c4e63fcc881f4db8900c645061afd236eebf616f3e1f4f0aff1bb360f` |
| guard_explicit_invitation_acceptance.sql | `9a2cde2faee4f61abf839a8f781ddc1e53dbfebf208467eeea59ac8da26364c3` |
| require_assignment_identity.sql | `1b81de4c2b12a135cc524aa0a2db554efc87f778baa2e1d5b48b7d890a55296d` |

Los tres originales no cambian. La cuarta crea una función sin EXECUTE para clientes/service_role
y un trigger constraint diferido sobre UPDATE de hotel_users; ninguna tabla, columna o backfill.
La quinta reemplaza cuatro helpers existentes conservando ACL; no recrea políticas ni índices.
Los efectos de las tres originales siguen documentados en el informe previo: recibos privados
de invitación/revisión y revisión/evidencia PMS con nuevas columnas nullable en reservas. No hay
reasignación de históricos. La unicidad global externa no se altera.

## Pruebas y alcance de la evidencia

- SDK Auth real con transporte sustituido: misma/otra pestaña y retorno expirado.
- PostgreSQL desechable: aceptación concurrente y perdida, sustitución/caducidad/revocación,
  cuentas no verificadas y ajenas, aislamiento, archivado y hold tras restaurar con triggers reales.
- Políticas reales: negativo legacy por email, positivo por UUID, roles y ACL conservados,
  deshabilitado/pendiente denegados, recibo no falsificable por service_role, revocación efectiva.
- Matriz de compatibilidad: antiguo/antiguo reproduce el riesgo; nuevo/sin contrato da 503 sin
  conceder; instalación parcial falla cerrada; antiguo/nuevo rechaza UPDATE antiguo y escrituras
  Apaleo; nuevo/nuevo acepta explícitamente. Repetición conserva datos.
- Reproducción local ampliada de 151 definiciones de columnas, 28 restricciones y 45 índices
  observados, ocho políticas y helpers pertinentes, guardas lifecycle contrastadas y cinco
  migraciones dos veces. Cinco grupos PASS. No es un clon íntegro del proyecto ni del servicio Auth.
- Pruebas de admisión reales con Express: no confundir HTTP terminado con promesa terminada,
  cierre selectivo, reintento rechazado, fallo visible, prohibición de reapertura por API.
- Navegador con handlers reales y transportes Auth/DB de laboratorio: cuenta existente/nueva,
  pérdida de respuesta, recarga, hotel correcto, guardar/revisar/finalizar y Salud con servicios
  pendientes; 1366/390, claro/oscuro y teclado. No entrega real de correo ni proveedor real.
- CI incluye catorce suites PostgreSQL, suite crítica/sintaxis, build con prueba de observabilidad
  solo servidor y regresiones visuales existentes, y job independiente de alta asistida/SDK.
  Se comprueban logs del SHA final; un Preview READY no equivale a verificación funcional.

Las evidencias e inventarios privados permanecen fuera de Git. El negativo de observabilidad
usa una copia explícita del helper legacy f627f8b solo como fixture: el helper actual ya no escribe.
No se debilitan sus expectativas para simular que el escritor antiguo desapareció del ensayo.

Comprobación local: build y observabilidad construida PASS; recorrido de navegador PASS;
la suite crítica llega a HTTP Security, que conserva su fallo heredado de comparación literal
LF frente al checkout CRLF de Windows (`dashboard/lib/demo.js`, línea de `.delete()`).
No se cambia la prueba ni sus expectativas. El resultado Linux del SHA final se acreditará
en CI y se distinguirá expresamente de este fallo local. Los demás límites heredados de
los informes anteriores permanecen documentados; no se declaran resueltos por este candidato.

## Ensayo real posterior y única lista de autorización pendiente

La siguiente fase necesitará autorización conjunta, condicionada a la evidencia del primer relevo:

1. Configurar Site URL y redirect exactos de Auth; conservar plantilla/confirmación. Si el buzón
   técnico no es elegible, configurar SMTP específico previamente aprobado, sin contratarlo aquí.
2. Establecer los controles temporales de rutas/hosts e ingresos/ejecutores identificados,
   con retención acreditada; pausar y drenar consumidores afectados, conservando inciertos.
3. Aplicar los cinco archivos SQL y hashes anteriores, en el orden indicado, con sus comprobaciones
   de catálogo/permisos/PostgREST. No incluye backfills ni cambios a conexiones históricas.
4. Integrar por merge normal y desplegar el SHA final en Vercel/Railway; fijar temporalmente
   admisión cerrada, comprobar versiones, retirar consumidores antiguos y reabrir solo lo compatible.
5. Crear UN hotel técnico y emitir UN enlace al correo técnico controlado, crear cuenta si no existe,
   recibir verificación real y aceptar por interfaz. Guardar perfil e información sintética, revisar,
   finalizar y llegar a Salud en el hotel correcto, dejando PMS/WhatsApp pendientes y live OFF.
   Comprobar aislamiento por lectura/denegación y revocar el acceso técnico al terminar. No demo,
   huéspedes, correos de Checkin, proveedores ni automatizaciones.

Falta identificar ese correo técnico, además de acreditar los mecanismos externos y drenaje
del primer relevo. No hace falta mapa comercial de hoteles ni esperar a Ubikos.

En lenguaje sencillo: Staynex creará el hotel y entregará un enlace. El responsable verificará
su propio correo, aceptará el acceso, completará y revisará la información y terminará en Salud.
Verá qué servicios faltan y quién debe resolverlos. Eso no conectará el PMS, WhatsApp ni activará IA.
