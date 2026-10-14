# Preparación de PR en borrador y CI Linux

Revisión de 2026-10-14. Partida e83c416616c02ca6d41943de82ad85572366f561; origin/main actualizado f627f8b441b1107c229a0daf7a5cb3ce95fd3d27, ancestro de la rama. Checkout inicial limpio. No se incorpora el worktree PMS/Ubikos ni los inventarios ajenos.

## Efectos del push comprobados antes de ejecutarlo

- GitHub: único workflow versionado Staynex CI, eventos push/pull_request/workflow_dispatch, tres jobs Ubuntu 24.04. No SQL remoto, secretos de producción, deploy ni llamadas de IA. npm ci ignora scripts; runner sanea entorno, bloquea archivos .env y conexiones externas de Node. PostgreSQL 17.10 en Docker local, red none y almacenamiento tmpfs; fixtures sintéticos, clientes dobles. Las descargas de dependencias e imagen no son tráfico de proveedores operativos.
- Railway, sesión autenticada: proyecto virtuous-possibility, servicio staynex, único entorno production; fuente Chispa2004/staynex, rama main, autodeploy habilitado. PR Environments deshabilitado (acción disponible Enable PR Environments). Una réplica; deployment activo 407f5c24-c260-4c1d-add6-9d7df095073a, correspondiente a main revisado según estado GitHub. Sin custom build/start, predeploy ni cron configurados; /health no escribe. Este push de rama no sustituye Production.
- Vercel, sesión autenticada: proyecto staynex, Production sigue main; Preview Branch Tracking habilitado para otras ramas. Root dashboard, Next.js, comandos por defecto, ningún hook de migración en build/inicio, sin cron configurado (feature habilitada pero pantalla Get Started, ninguna tarea). Variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY y BACKEND_URL con ámbito Production and Preview. No se revelan valores ni se acredita aquí projectRef efectivo. Preview se considera compartido y NO aislado; solo se consultarán metadatos de despliegue. No se abrirán rutas de la aplicación para pruebas.
- package.json raíz/dashboard sin hooks install/build que migren o operen datos. next build compila; rutas/API dinámicas no se invocan. src/server.js valida entorno, registra handlers y escucha; no agenda importaciones ni jobs. No archivos railway/vercel/config cron versionados que añadan acciones al push.

## Alcance y CI

Diff de 151 archivos iniciales: lógica de servicio/recuperación, pruebas, documentación y evidencias sintéticas. Sin cambios de dashboard visual, PMS, Ubikos, marca o demo. Revisión de archivos Git y evidencia gzip descomprimida: sin patrones de claves/JWT/cadenas PostgreSQL con credencial. No se suben archivos temporales, inventarios ni evidencia remota privada.

Ajuste de esta fase limitado al CI: checkout adicional del SHA main anterior en .npm-cache/service-baseline; se transmite solo al job PostgreSQL. El test comprueba SHA exacto y checkout limpio antes de importar el consumidor antiguo. Antes CI ejecutaba 20 grupos; con los dos casos main+SQL antiguo y main+SQL nuevo ejecuta los 22. Sin cambiar expectativas. Pruebas locales afectadas: test:ci-guards PASS; sintaxis de runner/test PASS; diff --check PASS. CI remoto aún pendiente al crear este documento.

HTTP Security: fallo estático con CRLF reproducido en main y rama; PASS con LF local, expectativas intactas, se verificará checkout Linux. Guest AI tenant static: FAIL heredado en main y rama (assert antiguo sobre consulta directa tras delegación), fuera de ci:critical; no se declara aprobado. Evidencias originales en docs/evidence/service-integration-review.

## SQL y siguiente fase

Archivo exacto supabase/sql/recover_failed_operational_request.sql, SHA-256 de bytes Git LF: 36a73e3c8759c7c51ccdf2bec9e39c02753a3452bcf734e203c6cfca9c5faa47. Sin cambios en esta fase; NO aplicado remotamente. Wrapper SECURITY INVOKER, search_path fijo, EXECUTE solo service_role; llama contrato existente dentro de una transacción. Sin tablas, columnas, índices, triggers, backfill ni cambios de filas durante instalación. Requiere recibos y guardia de aclaraciones existentes.

Preflight preparado: supabase/sql/preflight_failed_operational_request_recovery.sql, BEGIN READ ONLY, timeout 15s, catálogos y permisos, ROLLBACK; no mensajes/datos personales ni invocación RPC de negocio. NO ejecutado remotamente. Acceso futuro: sesión autenticada de SQL Editor del proyecto o conexión PostgreSQL administrativa autorizada de solo lectura. Destino histórico previsto vblxmnqbatqrynfaasmf; acreditar por separado configuración efectiva del cliente servidor de backend y Dashboard antes de ejecutar. Nombre de base/organización o Preview no son prueba suficiente.

Detener si destino difiere, faltan funciones/columnas/índices/restricciones, contratos/grants/RLS/triggers difieren de los ensayados o hay consumidores incompatibles. Revisar definiciones exactas contra add_operational_request_receipts.sql, guard_operational_request_clarification.sql y add_attention_ticket_lifecycle.sql. No reparar permisos automáticamente. Procedimiento detallado y matriz: docs/guest-service-integration-review.md.

La siguiente autorización deberá cubrir preflight remoto de lectura en el proyecto acreditado; después, solo si compatible, SQL exacto, transición SQL → backend → Dashboard, merge normal/despliegues y verificación autorizada. Preservar mensajes, recibos e identidades ante resultado incierto; no borrar objetos ni reencolar ni asumir retorno seguro a consumidor antiguo. No activar flags.

Cero llamadas, tokens y gasto de API de IA en esta fase. No se ejecuta la reserva de evaluación real. Naturalidad, revisión humana, cancelación efectiva y varias solicitudes automáticas siguen pendientes; CI sintético no los acredita. No publicación ni verificación funcional en producción.
