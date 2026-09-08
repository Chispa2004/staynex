# Message Attention — Verificador final y publicación

El usuario confirma preflight y migración aplicados manualmente en Supabase producción, y nueve comprobaciones READ ONLY verdaderas: siete funciones, tabla, inclusión futura, ausencia de trigger bloqueante, ámbito de transición, relación hotel/conversación del Dashboard, RLS y bloqueo anon/authenticated. Esta confirmación autoriza publicar el código validado. No se ha conectado Supabase remoto ni vuelto a ejecutar la migración allí.

## Corrección limitada al verificador

Se elimina md5(prosrc); no se sustituyen hashes por los observados en producción. El nuevo SQL READ ONLY comprueba tabla y columnas, inclusión nullable/default y CHECK, FK compuesta y siete índices, RLS/policies, siete firmas exactas sin sobrecargas, argumentos RPC, resultados, volatility, SECURITY DEFINER, propietario, search_path, timeout y privilegios efectivos. Los helpers no se conceden a service_role; solo las tres RPCs previstas. Comprueba ausencia de dependencia directa atención/auditoría en triggers de messages.

Anclas acotadas del contrato toleran espacios, comentarios y CRLF: filtros antes de bloquear, elegibilidad, validación del lote, expected status/version, actor asignado al hotel, auditoría, relaciones del Dashboard y detección de desactivación. No son un parser ni prueban equivalencia de SQL arbitrariamente reescrito. Llamadas puras con valores sintéticos acreditan histórico sin seguimiento, pendiente inicial y precedencia de transición explícita. El script no lee contenido de huéspedes ni ejecuta transiciones. Las garantías transaccionales y el handler productivo se validan separadamente en PostgreSQL aislado.

## Evidencia del candidato

34 escenarios PostgreSQL PASS. Incluyen once casos negativos del verificador (RLS, policy, default, índice, grants de helper, PUBLIC EXECUTE, volatility, timeout, sobrecarga extra, bloqueo fuera de hotel y relación incoherente) y aceptación de las siete funciones con CRLF y líneas vacías cambiados. Una prueba negativa detectó inicialmente una ancla demasiado permisiva del verificador; se corrigió y se repitió la suite completa desde cero. No cambió el schema ni ninguna función productiva.

Primera resolución, reapertura, concurrencia real, retries idéntico/obsoleto, lote inválido sin parcial, aislamiento, bloqueo ajeno sin espera (154/142 ms), 24 pendientes y 23 urgentes coincidentes con paginación completa, histórico sin backfill, nuevas entradas fuera del lote y desactivación conservando evidencia: PASS. Inbound guarda mensaje/marca/claim processed aun cuando fallan escrituras de atención o auditoría; resolución 503 durante fallo y 200 tras reparar; duplicados sin reprocesamiento ni proveedores reales.

Docker local explícito `npipe:////./pipe/dockerDesktopLinuxEngine`; imagen oficial preexistente `postgres:17.10-alpine3.24`, digest `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`. Contenedor exclusivo `staynex-attention-final-20260908`, etiqueta `staynex.disposable=attention-final-20260908`, red none, sin puertos, PGDATA tmpfs. Evidencia excluida de Git: `.npm-cache/message-attention-final/results.json`, logs SQL/sesiones, `source-manifest.json`, `sql-hashes.json` y recibo de limpieza. Sin GoTrue/PostgREST/proveedores; contexto autenticado controlado y transporte a SQL real.

Validación final aislada sin .env, credenciales heredadas o dotenv precargado: PASS en test:message-attention, test:auth-hotel-context, test:permissions, test:post-login-routing, test:inbox, test:checkin-demo, test:twilio-inbound-dedupe, test:pilot-human-safety, test:pilot-onboarding, test:pilot-failure-rehearsal y check:syntax. Build PASS (46 s) y diff PASS. Copia probada de 553 archivos; tras ejecutar solo se completa documentación. Montajes, caches, logs, screenshots y .env excluidos del árbol publicable; fixtures legítimos solo en scripts/fixtures.

## SQL final para la instalación existente

Único script que se entrega para comprobación opcional: `supabase/sql/verify_message_attention.sql`, SOLO LECTURA. SHA-256: `e05847ab39e2a87fd84f37c991676669975c020b6b04f2612bfa791fe7eac04f`.

create, preflight y disable conservan exactamente sus bytes y hashes del paquete instalado. No aplicar create otra vez, ni hacer seeds/backfills. Los ensayos de fallos y concurrencia nunca se ejecutan sobre huéspedes reales. La publicación usa rama → PR → checks/revisiones → integración, sin force push, bypass, cambios de variables o activación de integraciones. SHA de merge y estados Vercel/Railway se registran mediante la evidencia de despliegue, no se presuponen en este documento previo a publicar.
