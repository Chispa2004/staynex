# PMS 1.22 — candidato exclusivo del Dashboard

Estado: preparado para PR en borrador, no publicado. No autoriza alta, secretos,
lecturas reales ni merge. La referencia exacta del candidato será el head de la PR;
el cierre privado conserva SHA y enlaces de CI sin exigir otro commit documental.

## Base y alcance

Comprobado el 20 de octubre de 2026:

| Superficie | Versión conservada |
|---|---|
| origin/main actualizado | `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27` |
| Dashboard Production | `e324bd1ea715c1017082b9cc10367a73effb3e9d` |
| Deployment público recuperable | `dpl_CyVWvZfehTzGNnWbTFYHsBNnDBsn` |
| URL del deployment | https://staynex-d5z6v1g06-staynex-s-projects.vercel.app |
| Dominio público | https://staynex-chi.vercel.app |
| Railway activo | `407f5c24-c260-4c1d-add6-9d7df095073a`, SHA `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`, 1 réplica |

Rama nueva `codex/ubikos-dashboard-publication`, creada desde e324bd1. Conserva
exactamente la observabilidad del cliente servidor publicada fuera de main (#56).
Extrae archivos concretos del trabajo 1b5aa647, sin integrar su historial.
Incluye página, handler Next, transporte server-only, proyección parcial, enlace PMS,
excepción exacta de navegación y traducciones. Los módulos puros bajo
`src/services/pms/ubikos` solo son dependencias nuevas del Dashboard: no hay
registro de rutas ni cambio de arranque, consumidor o servicio Express.

Excluidos: migraciones, foundation de snapshots/importación, cambios de persistencia
PMS/backend, organizaciones, alta asistida pendiente, herramientas DPAPI, laboratorios,
credenciales e inventarios. No altera los contratos de alta/PMS existentes.
La prueba que depende del importador completo de la rama foundation se conserva allí;
no se incluye ese importador para poder ejecutarla aquí. Permanecen las pruebas
del carácter parcial, no inferencia y ausencia de escrituras de esta vista.

Correcciones necesarias para la extracción: el handler solicita contexto con `readOnly:true,
includeDirectory:false`, evitando la vinculación legacy de invitaciones durante una
consulta. Regresión comprueba las opciones del resolutor. No amplía permisos.
El Dashboard declara zod 3.25.76 (misma versión/integridad ya fijada en el lock
raíz), requerido por la proyección: Vercel instala desde dashboard, no debe depender
accidentalmente del node_modules raíz del laboratorio. Sin cambio de versión del backend.

## Efectos del push comprobados antes de publicar la rama

- Railway `virtuous-possibility` / production / staynex: source main, autodeploy
  habilitado, PR Environments deshabilitados (UI ofrece «Enable PR Environments»).
  No cambio de esa configuración. Push a la rama nueva y draft PR no reemplazan backend.
- Vercel staynex: Production sigue main; Preview sigue ramas no asignadas.
  No variables UBIKOS en proyecto ni compartidas, filtro All Environments.
  El lector permanece cerrado si cualquiera de sus cuatro ajustes falta.
- Workflow único `ci.yml`: pruebas, build y PostgreSQL Docker desechable; sin hooks
  Railway/Vercel Production ni ejecución de SQL remoto. Build Next no arranca Express,
  ni invoca el lector. No prebuild/postinstall de migración.
- Preview no es aislamiento de base de datos. No abrir recorridos de negocio allí ni
  crear/configurar hoteles. READY acredita construcción, no funcionamiento real.

## Compatibilidad remota: lectura, no ensayo de escritura

Destino servidor: `vblxmnqbatqrynfaasmf`. Se reutiliza evidencia privada del 16/10
`staynex_server_supabase_target_v1`, cliente `dashboard.getSupabaseAdmin.GET_current_hotel`,
environment production, deployment CyVWvZfeh. El deployment sigue siendo Current:
sus metadatos acreditan e324bd1. No se sustituye por NEXT_PUBLIC_SUPABASE_URL, variables
locales o evidencia de otro Preview. El futuro deployment requiere su propia comprobación.

`scripts/preflight-ubikos-dashboard-readonly.sql` ejecutado en ese proyecto, transacciones
READ ONLY con timeout y ROLLBACK. Sin RPC de negocio ni lectura de huéspedes.
Resultado privado fuera de Git:

- `hotels`, `hotel_users`, `hotel_onboarding_state`, `hotel_creation_requests`,
  `hotel_pms_connections`, `enterprise_audit_logs`: columnas requeridas presentes.
- `create_hotel_onboarding_v1(uuid,uuid,text,jsonb,text)` y
  `save_hotel_onboarding_v1(uuid,text,jsonb,boolean)` presentes, security definer,
  search_path pg_catalog/public; EXECUTE service_role, denegado anon/authenticated.
  El alta conserva validación, bloqueo/idempotencia por actor+clave y transacción:
  hotel, estado pendiente, asignación activa al actor en modo workspace y recibo.
- RLS habilitada; ninguna política en las cinco tablas inspeccionadas. service_role
  tiene BYPASSRLS y SELECT/INSERT/UPDATE en las tablas de operación pertinentes.
  `hotel_creation_requests` no permite DML directo al rol; la RPC posee el contrato.
  La autorización por usuario/hotel se aplica en servidor antes del cliente privilegiado.
  No se amplían permisos ni se inventa una política RLS de cliente.
- Unicidad: hotel+provider en conexiones, hotel_id en onboarding, actor+request_key
  en altas, user+hotel y hotel+email en asignaciones; slug/workspace_slug protegidos.
- Triggers de archivo/lifecycle revisados: no impiden el alta de un workspace nuevo
  activo, sí conservan las restricciones de hoteles archivados.
- Búsqueda acotada por nombre Camino/Granada: sin coincidencias; vínculo Ubikos
  account_code/property_id 10318: sin coincidencias. Repetir solo esta comprobación
  justo antes del alta para evitar carreras. No es una reserva de nombre ni garantía
  de inexistencia bajo cualquier alias.

No falta un contrato SQL para este candidato. Esto acredita compatibilidad de catálogo,
no una alta remota ejecutada ni una llamada PostgREST de escritura. No usar el SQL
de alta asistida pendiente para esta fase.

## Validación

- 23 escenarios sintéticos: contexto/IDs/filas parciales; tres operaciones, cabecera,
  autorización, hotel suspendido, vínculo único, inyección, error, aborto, secretos,
  contexto sin escrituras e idempotencia de creación con store simulado.
- Build completo Dashboard (67 páginas) y 11 grupos de observabilidad del artefacto.
- CI conserva las suites críticas, nueve suites PostgreSQL y regresiones de navegador
  de la base pública. Nuevo paso explícito `npm run test:ubikos-dashboard` en Critical.
- HTTP Security tiene el fallo local heredado por comparación literal LF/CRLF en
  `dashboard/lib/demo.js`; no se cambian expectativas. El resultado Linux se informa
  separadamente. No se repiten ensayos visuales del laboratorio como prueba pública.

## Intervención futura: solo Vercel, sin merge

1. Autorizar el SHA final revisado y comprobar que el deployment de recuperación
   y Railway siguen siendo los anteriores. Conservar los cuatro ajustes UBIKOS
   ausentes/deshabilitados durante la primera publicación.
2. Preparar checkout limpio exacto y manifest; excluir .env, cachés, dependencias,
   inventarios y evidencias. Vincular únicamente al proyecto Vercel staynex,
   equipo staynex-s-projects, root Dashboard y configuración existente.
3. Reutilizar CLI oficial y mecanismo ya usado para e324bd1:
   `vercel deploy --prod --skip-domain --scope staynex-s-projects`.
   Build remoto con entorno Production, sin asignación pública inicial.
   No `env pull`, secretos por argumentos, protección debilitada, hook Railway o merge.
4. Verificar ID/SHA de metadatos, READY, entorno Production y logs de build; luego
   `vercel promote <deployment-nuevo> --scope staynex-s-projects`. No promover el
   Preview como si acreditara variables de Production. Comprobar dominio e ID exacto.
5. Con sesión administrativa autorizada, usar la lectura segura de current-hotel
   ya revisada y evento privado para acreditar el cliente servidor del nuevo ID.
   Navegar PMS/Datos de Ubikos sin consulta, verificar deshabilitado, permisos,
   hotel seleccionado, temas y retorno durante onboarding. Nada de proveedores.
   Registrar Railway todavía en su ID/SHA anterior.

Documentación oficial del mecanismo:
[deploy --skip-domain](https://vercel.com/docs/cli/deploy#skip-domain) y
[promote](https://vercel.com/docs/cli/promote).
El relevo pendiente bloquea un merge que dispare Railway, pero no esta publicación
exclusiva de Next sin cambios SQL ni contratos incompatibles.

## Alta y activación posteriores, en la misma intervención autorizada

1. Usuario confirma España (`ES`), Granada y `Europe/Madrid`. Nombre y propiedad
   Ubikos 10318 ya indicados. No pedir dirección, categoría ni responsable inventados.
2. Sesión auténtica de administrador Staynex: comprobar `canCreateWorkspaces` y
   permiso `pms_connections_manage`, sin promocionar cuentas. Consultar duplicados
   mínimos y reutilizar solo un registro cuyo vínculo sea acreditado.
3. Si no existe, selector de workspace → Crear workspace: nombre, país, ciudad,
   zona. Flujo existente POST /api/workspaces con Idempotency-Key persistida.
   Recuperar/reintentar misma operación ante respuesta perdida, nunca crear otra.
   Usa UUID/email de la identidad autenticada y asignación owner activa; no invita
   ni asigna a terceros por coincidencia de correo. Invitación de responsable puede esperar.
   No se declara onboarding completo ni hotel live.
4. En el hotel correcto → Conexiones PMS: Ubikos, property_id/account_code 10318,
   enabled configurado, sin api_key en formulario, sin sincronizar ni probar conexiones,
   webhook deshabilitado y sync_status pending_setup. Guardado por endpoint existente.
   Si se reutiliza un vínculo con webhook activo u otra configuración, detenerse:
   guardar false no basta para sobrescribir un true existente en el contrato legacy.
5. Obtener hotel.id y connection.id del resultado guardado y lectura autorizada;
   conservarlos privadamente y comprobar unicidad. El usuario no debe buscar UUID.
6. Responsable introduce por gestor seguro Vercel, SOLO Production:
   `UBIKOS_MANUAL_READ_API_KEY` (secret), `UBIKOS_MANUAL_READ_HOTEL_ID`,
   `UBIKOS_MANUAL_READ_CONNECTION_ID`, `UBIKOS_MANUAL_READ_ENABLED=true`.
   Nunca NEXT_PUBLIC, chat, Git, almacén DPAPI exportado ni variable Railway.
   Se requiere autorización específica de esta configuración; no se hace aquí.
   Nuevo deployment del MISMO SHA para incorporar variables, staged/inspect/promote.
7. Autorizar una sola lectura manual «Alojados» desde Vercel, no desde PC ni Railway.
   Salida de red Vercel no acreditada todavía; no asumir misma IP que prueba local
   ni contratar IP fija. Mantener 10s/256KiB, destino10318, sin redirect/retry.
   Conservar solo HTTP/resultado técnico/fecha/duración/recuento si el mecanismo
   los acredita, nunca inventarlos a partir de la UI. UI conserva proyección mínima
   de IDs solo en memoria y no-store; no persistir payload, screenshots de filas ni PII.
   No pulsar otra vez ante fallo. Una respuesta válida acredita lectura puntual,
   no cobertura completa, sincronización, identidad ni permiso de comunicaciones.
8. Si falla: deshabilitar el flag específico mediante configuración autorizada y
   redeploy mismo SHA; para retirada inmediata de la superficie pública promover D0
   anterior sin lector. La mera reversión de alias no apaga un deployment antiguo
   con variables habilitadas: retirar ese deployment o revocar la credencial dedicada
   con autorización, conservando protección de Preview y sin tocar Railway.
   No borrar hotel/conexión, no reencolar nada ni ampliar límites.

## Reconciliación y límites

Mantener PR en borrador sin auto-merge. Registrar divergencia deliberada de main.
La integración posterior debe incluir observabilidad e implementación y conservar
el artefacto publicado; requiere el procedimiento/autorización del relevo Railway.
No hacer merge ahora ni modificar sus disparadores como atajo.

Pendientes reales: confirmación geográfica; sesión administrativa efectiva al ejecutar;
autorización de publicación exclusiva, alta/vínculo y secreto/flag específico; acceso
del proveedor desde Vercel por comprobar con esa única lectura. No falta un mapa
comercial, migración ni invitación de un responsable para crear el workspace administrado.
Guest Memory, SEND_AUTOMATIONS, demo, Hospedios y continuidad 1.2 se conservan.
