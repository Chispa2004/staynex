# Intervención Vercel exclusiva: preparación de PR y plan de ejecución

2026-10-15. Complementa y conserva íntegros `vercel-server-target-diagnostic-review.md`
y `vercel-server-target-diagnostic-pr-draft.md`. Esta fase permite push/PR draft/CI,
no permite ejecutar la intervención, promover dominios ni probar el runtime remoto.
Base sigue f627f8b441b1107c229a0daf7a5cb3ce95fd3d27; candidato anterior 65d5d370a95a585e1f6950629114dec0a7c3a24b.
El nuevo commit añade únicamente prueba de transporte SDK y este plan. El código funcional
del diagnóstico sigue siendo el de 1491d8df0efb299b3142eb6b6496349f1e126ab6.

## Antes del push: efectos comprobados

- Vercel, proyecto staynex, equipo staynex-s-projects: Production Branch Tracking = main,
  Auto-assign Custom Production Domains ON. Esta rama no coincide. Un push suyo puede generar
  Preview, no Production. System Environment Variables ON. Require Log In ON / Standard Protection.
  No hay excepciones de dominios ni bypass automático configurado en el panel consultado.
- Railway, producción, servicio staynex: rama main, autodeploy ON, Wait for CI OFF, Watch Paths vacío,
  sin cron, predeploy ni teardown personalizado. Publicar otra rama no sustituye este servicio.
  Un merge a main sí lo desplegaría: NO hacer merge ni usar esa vía para la intervención.
- Único workflow versionado: .github/workflows/ci.yml, disparado por push/PR/manual; tres jobs,
  checkout sin credenciales persistentes, npm ci --ignore-scripts, runner con entorno saneado y
  bloqueo de .env/red externa. PostgreSQL 17.10 desechable; no credenciales ni SQL remoto.
- package.json/dashboard/package.json: sin scripts automáticos de migración. Build es next build;
  arranque backend es src/server.js. El diff no toca arranque, SQL, workflows de despliegue ni flags.
- PR #55 conserva b6a224f, draft, autoMergeRequest=null. Onboarding local 2e8f6f6 intacto.
  Main y ambos deployments publicados siguen los inventariados en el informe anterior.

## Dictamen de lectura: recorrido completo

La petición elegida es GET /api/current-hotel, con Bearer válido, hotel existente autorizado y
x-staynex-workspace-path=/dashboard. Sin x-staynex-context-only, cuerpo ni navegación SPA.

| Tramo | Código/evidencia | Efectos alcanzables en esta petición |
|---|---|---|
| Entrada Vercel | Protección de deployment del proyecto; no se altera | Control perimetral, logs de infraestructura; no bypass |
| Middleware Next | No middleware/proxy/instrumentation versionados para Dashboard; middleware-manifest del build vacío | Ningún middleware de aplicación ejecuta negocio; headers() de next.config solo añade no-store |
| GET | dashboard/app/api/current-hotel/route.js: GET | readOnly:true explícito; sin auditoría de cambio de hotel, cookie o POST |
| Cliente | dashboard/lib/supabase.js:getSupabaseAdmin | Cliente real con persistSession:false y autoRefreshToken:false |
| Auth | current-hotel.js:resolveCurrentHotelForRequest → auth.getUser(token) | SDK real hace GET /auth/v1/user con JWT explícito; no refresh ni login |
| Asignaciones | user-invitations.js:getUserHotelAssignments | SELECT hotel_users con relaciones hotels, filtros de estado/identidad y orden |
| Resolución | chooseHotelAssignment/getHotelById/resolveTenantAccess/getAllHotelWorkspaces | Cálculos locales y SELECT hotels; directorio según permisos actuales |
| Recuperación legacy | getLegacyAssignmentForUser, si falta esquema | SELECT hotel_users por user_id y SELECT hotels; no inicializa filas |
| Escritores existentes excluidos | resolvePendingInvitationsForUser; attachUserToHotelInvitation; UPDATE directo user_id en current-hotel | Ambos caminos condicionados a !readOnly; no se alcanzan, incluso active sin user_id o invitación pendiente |
| Archivo y permisos | getCurrentHotelForRequest, isArchivedHotel y canAccess | Filtra/deniega en memoria; sin cambio persistido |
| Gate opcional | getOnboardingState | No alcanzado en la petición elegida. Si UI lo pide, solo SELECT hotel_onboarding_state, sin crear estado |
| Diagnóstico y salida | helper server-only; NextResponse.json | Cinco campos privados después de autorización; respuesta original no-store; no RPC ni escrituras |

El middleware de Express en src/middleware pertenece a Railway, no a esta API Next. No hay proxy
a Railway en este recorrido. Helpers importados por la ruta no lanzan escritores al importar.
Los RPC de guardado de onboarding y writeEnterpriseAuditLog existen para otros handlers, no GET.

Se mantiene una distinción: el diagnóstico no escribe BD; además la petición concreta no alcanza
escritores de aplicación. Auth/hosting pueden generar registros técnicos propios de acceso, que
no equivalen a crear hoteles, conceder accesos o actualizar datos de negocio. No se certifica el
catálogo remoto ni efectos de políticas SELECT personalizadas aún desconocidas por el preflight.
El acceso legacy por correo sigue siendo la política publicada; esta lectura no lo transforma,
no vincula user_id ni acepta invitaciones. No se afirma haber corregido esa política en esta PR.

Prueba ampliada: handler, contexto, resolutor y métodos del SDK reales, fetch sustituido por
transporte sintético cerrado. Observa GET Auth y SELECT REST; rechaza todo método no GET y ruta
inesperada. Cubre active, active sin UUID, invited y disabled. Control negativo: el resolutor sin
readOnly intenta PATCH y el observador lo detecta/bloquea. Cero peticiones de red, RPC, proveedores
o datos reales. Se conserva la regresión de JSON/status/headers, errores y no filtración.
La modalidad --built comprueba también middleware vacío y ausencia del marcador en browser bundles.

## Mecanismo de publicación: ninguna acción ejecutada

Convenciones: D0 = deployment público inventariado; D1 = candidato temporal; D2 = retirada.
Proyecto/equipo existentes, entorno Production. No crear otro proyecto ni cambiar su configuración.
Preparar checkout limpio del SHA aprobado; solo archivos Git revisados y manifests necesarios,
sin .env, inventarios, archivos privados, node_modules enlazados ni salida .next local.
Vincular al proyecto existente sin descargar variables. Una copia de fuentes necesita manifest
de rutas/hashes comparado con Git; --meta no sustituye prueba del contenido enviado.

Comandos propuestos (NO ejecutados; ID/URL de D1/D2 se obtienen, no se inventan):

```text
vercel deploy --prod --skip-domain --scope staynex-s-projects
vercel inspect <D1-ID-o-URL> --scope staynex-s-projects
vercel promote <D1-ID-o-URL> --scope staynex-s-projects
vercel promote status staynex --scope staynex-s-projects
```

Build remoto con configuración Production. No --env/--build-env, env pull, bypass secreto,
--public, merge ni push a main. No CLI Railway ni hooks manuales. El comando deploy sube código
a Vercel; promote cambia su enrutamiento y no actualiza Git. La conexión Railway observada
escucha main, no la promoción Vercel. Verificar después deployment/replica Railway sin cambio;
no inferirlo solamente de que no se haya ejecutado railway deploy.

Fuentes oficiales consultadas el 2026-10-15:
- [Deploy / skip-domain](https://vercel.com/docs/cli/deploy#skip-domain): producción sin asignación automática de dominios.
- [Promote](https://vercel.com/docs/cli/promote): promover un deployment Production existente; Preview puede generar otro build. No promover el Preview de esta PR.
- [Variables](https://vercel.com/docs/environment-variables): cambios de variables afectan deployments nuevos, no los anteriores.
- [Protección](https://vercel.com/docs/deployment-protection): Standard Protection conserva controles sobre URLs de deployment; comprobar alcance exacto del candidato antes de usarlo.
- [Instant Rollback](https://vercel.com/docs/instant-rollback): conserva build/variables anteriores y puede desactivar autoasignación de dominios. No usarlo silenciosamente como si solo cambiara un alias.

D1 puede resolver variables distintas de D0 aunque se llame Production: configuración actual frente
a snapshot anterior, variables compartidas/por entorno, versión de Node/SDK y ajustes de build.
NEXT_PUBLIC queda incorporado al build; dotenv local podría sobreescribir SUPABASE_URL si se
subieran archivos ajenos. Por eso el checkout limpio y comparación de settings son obligatorios.
No mostrar valores Secret; metadatos Updated/Added no prueban por sí solos igualdad de sus valores.

Promover D1 cambia tráfico Vercel, no drena Railway ni acredita ausencia de trabajos en vuelo.
En este diff no cambia contrato de negocio/BD entre D0/D1; no se elimina ningún deployment viejo,
no se cancela trabajo ni se reintentan operaciones. La transición de escritores incompatibles de
PR #55 sigue pendiente. Si la promoción/configuración prevista implica terminar procesos o hay
operaciones inciertas afectadas, detenerse: ninguna espera fija acredita drenaje. La no sustitución
de Railway resuelve ese efecto concreto; no es prueba general de cero operaciones concurrentes.

## Plan exacto de ejecución posterior

| Paso | Acción exacta | Efecto esperado | Evidencia requerida | Continuar solo si | Recuperación/fallo |
|---|---|---|---|---|---|
| 0. Inventario | Leer deployment D0, domains/aliases, SHA, entorno, protección, build settings, variables solo metadatos; Railway deployment/replica/SHA; main | Ningún cambio | IDs y asociación staynex-chi.vercel.app → D0; configuración/versión de partida | No hay avance ajeno y existe plan de retirada aprobado | Detener y actualizar plan, no sobrescribir trabajo ajeno |
| 1. Fuentes | Checkout limpio del SHA con CI aprobado y diff limitado; revisar proyecto vinculado, runtime y manifests | Paquete exacto sin archivos privados | SHA y manifest; sin .env/inventarios/artefactos locales | No onboarding, SQL ni cambios de flags | No subir un paquete dudoso |
| 2. Publicación aislada | deploy --prod --skip-domain en Vercel existente | D1 nuevo Production; D0 público y Railway intactos | Ready, SHA/contenido, ID, entorno, protección, lista de alias | Dominios no reasignados; sin migraciones/hooks | No promover; conservar D0. No cambiar settings para forzar Ready |
| 3. Metadatos | inspect D1 y panel de deployment; NO visitar SPA/API | Sin consumo del intento diagnóstico | Identidad D1 y configuración actual del build; protección existente | Compatible con fuentes revisadas; recuperación viable | Si otro SHA/entorno, detener |
| 4. Promoción temporal | promote D1, sin redeploy/merge/alias manual adicional | D1 sirve dominios de Production | Current Domains + Production current = D1; promote status terminado | Mismo ID D1, sin otro build; Railway sin nuevo deployment | Timeout no cancela promoción: consultar estado, no repetir. Si falla, D0 sigue o se restaura por acción autorizada |
| 5. Una lectura | GET https://staynex-chi.vercel.app/api/current-hotel con sesión y hotel ya autorizados, sin body/context-only | Solo Auth user y SELECT; evento privado una vez por módulo | HTTP 200 autorizado; no set-cookie; sin abrir otras APIs | Sesión válida, dominio acreditado D1 | 401/denegación: parar; no cambiar roles ni refrescar/crear cuentas para forzar prueba |
| 6. Logs | Runtime Logs del ID D1, ruta current-hotel, ventana de la petición | Evidencia limitada a cinco campos | event/client exactos; environment production; deployment coincide D1/SHA | El evento procede de la lectura al dominio público, no de Preview/build | Ausencia o intento ya consumido: no concluyente, no reinicios/redeploys automáticos |
| 7. Destino | Comparar projectRef con vblxmnqbatqrynfaasmf | Acredita D1 público en esa versión/momento | Evento privado y asociación pública D1 | Coincidencia exacta y cliente previsto | Otro ref/unknown: detener, conservar evidencia; nunca corregir variables automáticamente |
| 8. Retirada | Preparar D2 con eliminación exclusiva del diagnóstico, build/tests y deploy --prod --skip-domain; verificar condiciones de continuidad de abajo; promover D2 solo con autorización | Código temporal retirado, Railway intacto | Diff de retirada, hashes, entorno/cliente, evidencia de configuración efectiva D2 | Retirada aprobada y criterio de destino final satisfecho | Sin evidencia efectiva D2, retirar según opción autorizada pero mantener bloqueo de acreditación abierto |
| 9. Cierre | Leer Current Domains/ID/SHA final y Railway deployment/replica; comprobar marcador ausente del artefacto D2 | Versión final conocida | D2 público o D0 restaurado, Railway idéntico, resultado epistemológico explícito | Nada implica permiso para SQL/Auth | Documentar cualquier diferencia; preflight permanece separado |

La única petición de negocio propuesta es la del paso 5, por el DOMINIO PÚBLICO, no por URL
inmutable. No consumir antes el evento con una prueba staged. En un módulo ya utilizado el evento
puede faltar: su ausencia no demuestra nada. Cold starts pueden generar más eventos; no es límite global.

Sesión: usar el Bearer ya disponible de una cuenta con acceso dashboard a un hotel existente,
manteniéndolo solo en memoria. No introducir service-role ni pegar tokens en comandos/chat/logs.
Para evitar los efectos de la SPA, la ejecución posterior puede usar una pestaña del mismo origen
en un recurso estático (icon.svg), con la sesión previa disponible, y una petición controlada que
no ejecute login/refresh ni siga redirecciones a otra API. Verificar caducidad localmente antes;
si no hay sesión utilizable, parar. Cabeceras exactas: Authorization: Bearer <en memoria>,
x-staynex-hotel-id: <hotel ya autorizado>, x-staynex-workspace-path: /dashboard; cache no-store,
redirect error, sin reintento automático. Descartar cuerpo operativo sin guardarlo ni mostrarlo.
No abrir Dashboard/Platform completos para obtener el evento: pueden disparar otros handlers legacy.

## Retirada: qué queda acreditado

| Alternativa | Qué conserva | Qué NO acredita |
|---|---|---|
| Restaurar D0 existente | Build, entorno y código publicados antes; se retira el código temporal del dominio | El destino D0 sigue sin evento de runtime. Reabre el bloqueo; el evento D1 no se transfiere retroactivamente |
| D2 equivalente sin helper/llamada | Cadena de commits/manifest y mismo constructor, sin onboarding ni SQL; configuración Production puede compararse | Un build nuevo resuelve su propio entorno. Mismo nombre de entorno, código o metadatos de variables no prueba por sí solo igual destino efectivo |

Recomendación mínima para continuidad: **D2 que solo retire el diagnóstico**, publicado por Vercel
sin tocar main/Railway. Conservar D1/SHA/evento, diff exacto D1→D2, cliente/fuentes/SDK sin cambios,
manifests del build y snapshots de configuración verificables por deployment. Hace falta acreditar
la igualdad de SUPABASE_URL efectivamente suministrada a D2 (o leer su destino efectivo por una
superficie privada del proveedor), sin revelar secretos. La igualdad del valor de claves no es
necesaria para identificar projectRef, pero sus cambios afectan la validación de acceso y deben
registrarse como configuración distinta, no ocultarse.

**Límite concreto disponible hoy:** Vercel muestra SUPABASE_URL como Secret write-only y no se ha
obtenido una atestación del valor efectivo de D2 ni un vínculo inmutable de configuración entre builds.
No prometer cierre duradero solo porque nadie en esta sesión cambió variables. La información mínima
que falta es evidencia del proveedor, vinculada al ID final, del projectRef efectivo o de igualdad
del snapshot de destino con D1. No requiere revelar la URL completa ni la clave. Si no existe ese
mecanismo, hace falta revisar una comprobación privada del nuevo runtime antes de poder declarar
el bloqueo resuelto; no añadirla, mantener instrumentación permanente ni ampliar permisos por defecto.

Sin esa evidencia, las opciones honestas son retirar y dejar el destino final pendiente, o aplazar
la intervención hasta acordar una retirada verificable. Restaurar D0 es recuperación de servicio,
no solución duradera del bloqueo. Instant Rollback tiene el efecto adicional sobre autoasignación
documentado: si recuperamos por promote de un D0 Production aún disponible, confirmar ID y ausencia
de rebuild; si la plataforma requiere rebuild o cambia settings, detener para revisión concreta.

## Validación y siguiente autorización

Local: diez grupos del diagnóstico --built PASS, incluidos SDK completo y control negativo;
sin cambios de aplicación respecto al build ya verificado. Regresiones anteriores se conservan.
CI remoto de la punta que se publique debe completar critical (incluye prueba nueva), dashboard
(build + prueba --built + regresiones visuales) y postgres desechable. Resultados/URLs/SHA exactos
se entregan en el cierre y cuerpo de PR, sin atribuir a la punta resultados de otro SHA.
El fallo adicional de permisos PMS Academy está documentado y reproducido en main; no se debilita.

Autorización futura concreta, NO concedida en esta fase: subir solo las fuentes revisadas a Vercel
staynex/Production staged, promover el ID resultante al dominio público, una GET autenticada de
lectura y consultar/conservar su evento privado; después la retirada D2 revisada o recuperación D0
elegida expresamente, con los límites anteriores. No merge, Railway, SQL, Auth, variables, permisos,
usuarios, correos, PMS, IA ni flags. Antes de esa autorización debe concretarse cómo acreditar D2
si se exige cierre duradero. El preflight remoto permanece posterior y condicionado.
