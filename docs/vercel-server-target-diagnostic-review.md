# Diagnóstico privado del destino Supabase del servidor

> HISTÓRICO: la decisión del 16 de octubre sustituye la retirada obligatoria por
> observabilidad privada permanente. El procedimiento vigente es
> `vercel-server-target-permanent-observability.md`; las instrucciones temporales
> siguientes se conservan como historial, no son condiciones actuales de publicación.

Fecha: 2026-10-15. Estado: implementado y probado localmente, NO publicado.

## Conservación y base

- Trabajo de onboarding conservado exclusivamente en `codex/assisted-hotel-onboarding`,
  commit `2e8f6f61a37797231a7e66f584250c310d85c695`: documentación, preflight de lectura,
  ensayo de transición, matriz sintética de rutas y ensayo de drenaje. Worktree limpio.
  No contiene inventarios privados. Esas pruebas siguen siendo evidencia local de la fase anterior.
- PR #55 sigue OPEN, draft, autoMergeRequest=null, SHA remoto
  `b6a224fbb46764a71c3ad407da4c6b0fe9d8d981`. No editada ni subida en esta fase.
- Fetch de main: `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`.
- Rama independiente `codex/vercel-server-target-diagnostic`, desde ese main exacto.
  Worktree `.npm-cache/vercel-server-target-diagnostic/worktree`.
- Candidato funcional exacto: `1491d8df0efb299b3142eb6b6496349f1e126ab6`.
  El commit posterior añade este informe, borrador y adaptación del fixture CI; el SHA final
  de la rama se entrega junto al informe. No contiene código ni migraciones de PR #55.

## Metadatos comprobados, sin ejecutar la aplicación remota

Vercel: deployment `7x7sWTVs12a9tyQLF2pQa4senG7C`, Ready, Production, main f627f8b completo.
El panel muestra Current Domains: `staynex-chi.vercel.app`, alias git-main y URL inmutable
`staynex-nsr2rvwqm-staynex-s-projects.vercel.app`. No se abrió la web ni se invocó su API.
Detalle: https://vercel.com/staynex-s-projects/staynex/7x7sWTVs12a9tyQLF2pQa4senG7C

Railway: deployment ACTIVE `407f5c24-c260-4c1d-add6-9d7df095073a`, PR #53, una réplica,
sin cambio respecto a la evidencia anterior que acreditó f627f8b, destino previsto y flags OFF.
Se reutiliza aquella evidencia del mismo deployment; aquí no se vuelve a leer configuración secreta.
Settings: autodeploy de main ON, Wait for CI OFF, Watch Paths vacío, sin predeploy/cron,
sin teardown personalizado. Un merge a main puede desplegar **Vercel y Railway**, aunque
el parche solo afecte al Dashboard. No hay evidencia de un drenaje operativo del primer relevo.

## Cambio funcional exacto

| Archivo | Líneas del candidato funcional | Efecto |
|---|---|---|
| dashboard/app/api/current-hotel/route.js | 5, 59–61 | Importa el helper y lo llama con el mismo cliente, solo después de contexto autorizado, usuario/hotel presentes, sin fallback y permiso dashboard |
| dashboard/lib/server-target-diagnostic.js | 1–36 | Barrera server-only, extracción estricta, log privado y límite por módulo |
| scripts/test-server-target-diagnostic.js | 1–183 | Nueve grupos sintéticos, incluido artefacto compilado |
| scripts/test-workspace-progressive-loading.js | 160 | Doble sin efecto del nuevo import en el ensayo existente; expectativas intactas |
| package.json | 8–9 | Comandos de regresión normal y posterior al build |
| scripts/ci/run.cjs | 8–9 | Ejecuta la regresión en critical y la inspección del artefacto en dashboard |
| scripts/test-ci-guards.cjs | 26–30 | Fixture con ambos comandos dashboard y comprobación de aislamiento de los dos |

No cambia POST, cookies, permisos, selección, respuesta ni campos del JSON. No hay nuevo endpoint,
migración, dependencia, variable o flag. El helper no ejecuta red, queries ni operaciones de negocio.

`GET /api/current-hotel` ya llama `getCurrentHotelForRequest(...,{readOnly:true,...})`.
En `dashboard/lib/current-hotel.js`, esto evita tanto resolver invitaciones como vincular filas
active sin user_id. Autenticación `auth.getUser` y consultas SELECT conservan su comportamiento.
El gate opcional usa `getOnboardingState`, también SELECT sin inicializar filas. La acción propuesta
abajo omite ese gate. No se reutiliza GET Platform/Salud/Knowledge: sus wrappers antiguos pueden
resolver invitaciones. No se corrige ni disimula ese comportamiento pendiente de PR #55.

### Clientes y precedencia

| Cliente real | Configuración | Evidencia obtenible |
|---|---|---|
| dashboard/lib/supabase.js:getSupabaseAdmin | SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, sin fallback público; nuevo cliente por llamada | El helper lee `supabase.supabaseUrl` de la instancia que autenticó y resolvió el hotel |
| dashboard/lib/supabase-browser.js | NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, singleton navegador | No instrumentado; no demuestra destino del servidor |
| src/services/supabase.service.js:getSupabase | SUPABASE_URL/service-role, singleton del backend | Independiente; la prueba comprueba destinos distintos. Reutilizar evidencia Railway, no atribuirle este evento |

El código actual de contexto, Platform/alta y resolución de invitaciones utiliza la primera
factoría; no crea otro cliente de servidor con URL alternativa. Sus futuras instancias no se
ejecutan para este diagnóstico: el evento acredita directamente GET current-hotel y su deployment,
no una operación de alta/aceptación. PR #55 debe revalidar este enlace al cambiar versión.

`next.config.mjs`: dotenv ../.env sin override, .env.local con override=true; después fallback
SUPABASE_URL hacia NEXT_PUBLIC solo si falta este último. El test ejecuta esa configuración
con contenidos sintéticos y `dotenv.populate` real. Nunca lee .env locales. La instancia construida
es la fuente, incluso si process.env cambia después. No se deduce igualdad con el bundle público
ni con otra función/deployment/entorno. No se ha acreditado todavía el destino efectivo Vercel.

### Contenido y límites del evento

Cinco campos, sin extensiones desde request/configuración:

```json
{
  "event": "staynex_server_supabase_target_v1",
  "client": "dashboard.getSupabaseAdmin.GET_current_hotel",
  "environment": "production",
  "deployment": "<SHA de 40 hex o dpl_ validado>",
  "projectRef": "vblxmnqbatqrynfaasmf"
}
```

El JSON anterior es el resultado ESPERADO, no una observación remota. URL admitida únicamente
https:// + 20 letras ASCII minúsculas + .supabase.co y barra final opcional; luego se parsea URL.
Otro host, puerto, credencial, path, query o fragmento produce `not_accredited`, sin imprimirlo.
Entorno solo production/preview/development; otro valor da unknown. SHA inválido intenta ID
`dpl_` de 20–40 caracteres alfanuméricos; sin ambos, unavailable. Nunca imprimir errores.

Un intento por instancia de módulo, incluso ante fallo del logger; no hay contador global ni
garantía de una sola emisión entre cold starts, regiones o despliegues. Una petición anterior
autorizada puede haber consumido el intento. No forzar reinicios/redeploys para recuperar un log
sin autorización. Getter/logger fallidos no alteran la lectura. Ausencia del evento no acredita
ningún destino. El evento no certifica permisos SQL, disponibilidad PostgREST ni compatibilidad
del catálogo: eso corresponde al preflight posterior.

## Pruebas realizadas

- Nueve grupos PASS del test nuevo, sobre el build final: constructor SDK real, precedencia con
  fixtures, URL ausente/malformada/host desconocido, sanitización de metadatos, fallo de logger,
  dos factorías de servidor, ruta/contexto/resolutor reales con transportes controlados, accesos
  denegados, fila legacy sin vinculación, GET sin escrituras y artefactos de navegador sin evento.
  Cero llamadas externas del ensayo. Misma respuesta/status/headers/SELECT que la ruta sin parche.
- `test-workspace-progressive-loading.js` PASS, incluidos gate, Platform, historial, selección,
  cancelación y entrada de soporte. `test-auth-hotel-context.js` PASS.
- `test-permissions.js` FALLA en línea 156: «PMS Academy module must not be receptionist-facing».
  Reproducido idéntico en checkout f627f8b. No se cambian permisos ni expectativas para ocultarlo.
  Es adicional al conjunto crítico existente; no se afirma CI completo remoto aprobado.
- Sintaxis PASS: 437 archivos; comprobación individual repetida tras ajuste final del ID.
- Next 15.5.18 build PASS, 65 páginas generadas, rutas API dinámicas. Primer intento limitado por
  EPERM al crear .next; repetido con permiso local y el mismo aislamiento. No es fallo de producto.
- `git diff --check` PASS. Prueba nueva conectada a CI, todavía NO ejecutada en GitHub.
- El ensayo de guardas detectó que su fixture solo declaraba dashboard:build. Se añadió el
  comando posterior al fixture y se exige observar aislamiento en ambos; repetición PASS,
  sin relajar el test. No se mezclan este fallo corregido y el fallo heredado de permisos.

Ejecución local con runner ya conservado de onboarding, fuera del diff: elimina credenciales
heredadas, bloquea lectura .env y transportes externos mediante isolate.cjs; SEND_AUTOMATIONS=false,
Guest Memory=false, IA mock. El test además prohíbe fetch y cualquier método mutante de la BD.
No PostgreSQL necesario: no hay SQL ni persistencia modificados. No ensayo remoto ni datos reales.

## Publicación futura y primera sustitución de procesos

Un push futuro de la rama activaría CI y potencial Preview; no autoriza el contrato PR #55.
Un merge normal a main activaría ambos despliegues según los controles observados. Aunque no cambia
el contrato funcional/SQL, no acredita que las operaciones admitidas terminen antes de reemplazar
procesos. No recomendar ese merge como un despliegue seguro sin drenaje por ser «solo logs».

Alternativa acotada propuesta, NO ejecutada: Vercel permite `vercel deploy --prod --skip-domain`
para construir con entorno Production sin asignar los dominios activos. Preparar desde un checkout
limpio del SHA aprobado, vinculado al proyecto staynex existente, sin subir .env, inventarios,
evidencias, node_modules enlazados ni archivos privados; build remoto, sin copiar secretos localmente.
Verificar protección efectiva del deployment antes de la lectura; no debilitarla ni darla por hecha.
No hacer merge, promote, alias ni deploy Railway. No modificar variables con --env/--build-env.
Verificar después que todos los alias activos y el deployment Railway siguen exactamente iguales.
Fuente oficial: https://vercel.com/docs/cli/deploy#skip-domain

Esto evita provocar el relevo por main: permite acreditar **el candidato staged de entorno
Production**, no el deployment público anterior. No desbloquea por sí solo el preflight que exige
el destino del Dashboard activo. Para cambiar el alias público o integrar main, hace falta resolver
el control de admisión/drenaje del primer relevo y autorizar esa transición separadamente. No
presuponer cancelación de trabajo por cierre HTTP, timeout, rollback o ausencia de logs.

### Única lectura propuesta, después de autorización de publicación

1. Registrar SHA exacto, ID inmutable y entorno del deployment destino en Vercel. Exigir que el
   origen corresponda al candidato revisado; un --meta manual no prueba por sí mismo qué se subió.
   Si SHA no está disponible en runtime, correlacionar deployment ID y manifiesto de archivos del
   checkout revisado con metadatos del build. No fabricar variables de versión para obtener PASS.
2. Con una sesión auténtica ya disponible y acceso dashboard a un hotel existente autorizado,
   emitir **una sola petición GET `/api/current-hotel`** al host inmutable aprobado. Cabeceras:
   Authorization Bearer de esa sesión, x-staynex-hotel-id del hotel ya autorizado y
   x-staynex-workspace-path=/dashboard. Sin cuerpo, sin x-staynex-context-only, sin POST.
   Usar transporte del operador que mantenga token solo en memoria: no pegarlo en chat, comandos,
   logs o archivos. Esta especificación no exige crear una cuenta ni conceder permisos.
   No cargar la aplicación completa para dispararla: podría ejecutar resolutores antiguos.
   Sin sesión utilizable por ese transporte, detenerse; no sustituirla por service-role.
3. Consultar Vercel → deployment exacto → Runtime Logs, filtrar `/api/current-hotel` y
   `staynex_server_supabase_target_v1` en la ventana temporal. No Build Logs ni consola navegador.
   Registrar solo los cinco campos y metadatos no sensibles de versión; descartar contenido del
   JSON operativo. No capturar cabeceras, sesión, hotel o usuario.
4. Resultado suficiente para ESE deployment: environment=production, deployment coincide con
   SHA/ID acreditado, client/event exactos y projectRef=vblxmnqbatqrynfaasmf. En Preview acredita
   solo Preview. Si el deployment no sirve el dominio activo, no afirmar Production activa.
5. Otro projectRef, unknown, unavailable sin correlación fiable, not_accredited o ausencia del
   evento: detener el preflight/migraciones. Informar discrepancia sin host arbitrario ni secretos;
   no cambiar URL, claves, permisos o datos para que coincidan. Logs limitados por instancia y
   retención pueden dejar la comprobación no concluyente.

## Retirada y autorizaciones pendientes

Tras conservar evidencia mínima, retirar import/llamada y helper; retirar tests/entradas CI
exclusivos y restaurar el mock del test de carga. Repetir contexto/carga/build/diff, comprobar
que el marcador no está ni en server ni en static, y publicar la retirada solo con autorización
y transición de procesos acreditada. Confirmar SHA activo de retirada y una lectura sin evento;
la ausencia del log sola no demuestra retirada. Los logs anteriores conservan la retención del
proveedor; no se borran ni cambian permisos por esta tarea. Un staged no promovido puede retirarse
por el mecanismo normal con autorización, conservando metadatos de evidencia.

Siguiente autorización concreta propuesta: push de esta rama/SHA y PR independiente sin merge;
tras CI/revisión, deployment Vercel Production **staged y protegido, sin promoción de alias**,
con una sola GET autorizada y lectura del evento privado. No incluye Railway, migraciones, Auth,
configuración, invitaciones ni altas. Cualquier posterior promoción/merge requiere resolver el
primer drenaje y acreditar el destino del deployment que quede activo.

Estado final: producción, Auth, permisos, datos, demo y flags intactos; ningún push, PR remota,
deploy, SQL, email, llamada IA o modificación operativa. PR #55 permanece borrador. Preflight
remoto sigue pendiente hasta acreditar ambos destinos requeridos. Los trabajos paralelos se conservan.
