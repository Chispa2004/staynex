# Dashboard de Mensajes — Candidato de instalación (2026-09-08)

Informe histórico del paquete previo. El schema ya fue instalado según confirmación del usuario; NO reaplicar la migración. El verificador por huellas fue sustituido por la versión descrita en `message-attention-final.md`; su hash y evidencia actuales prevalecen sobre los de este informe.

Rama `codex/reception-message-dashboard`; base y `origin/main` comprobados tras fetch: `7fb48d7babbb842b867723149d462ac13218f685`. El commit de este documento consolida los cambios esperados de Dashboard, Inbox, contrato, SQL y pruebas. El manifiesto del paquete local registra su SHA una vez creado. Sin rediseño adicional ni cambios del pipeline inbound.

## Ajustes finales y evidencia PostgreSQL

33 escenarios PASS sobre los cuatro archivos SQL finales. Evidencia local fuera del runtime: `.npm-cache/message-dashboard-release/results.json`, `sql-hashes.json` y logs independientes de SQL/sesiones. El runner reproducible es `scripts/test-message-attention-postgres.cjs`.

- El bloqueo de messages filtra IDs explícitos, hotel, conversación y elegibilidad antes de adquirir filas. Orden por ID y validación íntegra del lote conservados. Dos sesiones: rechazo 42501 en 120 ms para otro hotel y 327 ms para otra conversación, comprobando que la primera sesión aún mantenía su bloqueo; cero cambios parciales.
- Received/resolved/pending/urgent y listado exigen relación válida de conversación/hotel. La FK compuesta rechaza INSERT y UPDATE cruzados con 23503, sin deshabilitar constraints ni modificar datos inválidos. Paginación completa simulada: 24 pendientes y 23 urgentes, tres páginas cada conjunto, sin duplicados; coinciden con los totales. También contrastadas categorías trazable vacía y origen incierto con un mensaje, manteniendo separación de orígenes.
- Primera resolución sin fila previa, cierre/reapertura, operadores concurrentes, lotes solapados, retry idéntico/obsoleto, auditoría transaccional, roles, aislamiento, nuevos mensajes fuera del lote e histórico sin backfill: PASS.
- Fallos inducidos de escritura en atención y auditoría: el controlador y createMessage productivos guardan el mensaje, inclusión 1 y claim processed; resolución 503 durante fallo y 200 tras reparación. Duplicados no repiten procesamiento; proveedores reales: cero. Lectura fallida no oculta mensajes ni inventa indicadores.
- SQL de desactivación ejecutado: conserva estado y auditoría, RPCs 55000, recepción continúa sin seguimiento. Reactivar no reclasifica los mensajes del intervalo desactivado.
- Preflight y migración contienen guardas críticas idénticas. Roles insuficientes, columna requerida ausente, colisión de índice, instalación incompatible y reaplicación se rechazan sin DDL parcial. Huellas de siete funciones actualizadas y verificadas en PostgreSQL.

Entorno exclusivo: Docker local `npipe:////./pipe/dockerDesktopLinuxEngine`, servidor 29.7.2, imagen oficial local `postgres:17.10-alpine3.24`, digest `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`. Contenedor nuevo `staynex-message-dashboard-release-20260908`, etiqueta `staynex.disposable=message-dashboard-release-20260908`, sin red ni puertos, PGDATA tmpfs. No recursos de otros proyectos ni descargas.

## Paquete exacto y procedimiento manual

Validación final de código, una ejecución sobre copia aislada sin `.env`, credenciales heredadas ni precarga dotenv: `test:message-attention`, `test:auth-hotel-context`, `test:permissions`, `test:post-login-routing`, `test:inbox`, `test:checkin-demo`, `test:twilio-inbound-dedupe`, `test:pilot-human-safety`, `test:pilot-onboarding`, `test:pilot-failure-rehearsal` y `check:syntax`: PASS. `dashboard:build`: PASS. La comprobación del diff preparado detectó una línea vacía sobrante al final de la ruta API nueva; se quitó sin cambiar texto ejecutable y se repitieron atención, sintaxis de esa ruta y build. Diff final, incluido el preparado: PASS. Logs iniciales y finales, recibo de corrección y manifiesto de 552 archivos de la copia probada en `.npm-cache/message-dashboard-release`; el SQL permanece exactamente igual al validado. Solo la documentación de resultados se completa después de las pruebas.

Contenedor desechable eliminado por ID/etiqueta verificados; cero contenedores restantes de este pase, imagen preservada. Recibo: `.npm-cache/message-dashboard-release/cleanup.json`.

Los archivos de este commit son la fuente del único paquete `.npm-cache/message-dashboard-release/message-attention-install.zip`. No reconstruir SQL desde un resumen ni aplicar una versión distinta.

| SQL | SHA-256 del archivo validado |
| --- | --- |
| preflight_message_attention.sql | `3c1a8f7820a6ad0297f8260dca6f8d78f4dc3ff8851efa142275631b18934e98` |
| create_message_attention.sql | `77e8df7665a9e98ff7d88a676c5ebee735faa99f23102b9061004a19b321a4b7` |
| verify_message_attention.sql | `e634baac15464263e4dceb2f96068db370e60c6d384da603873ba88b7e3efce8` |
| disable_message_attention.sql | `f6399a4d65186c2f249f5f52f2583d58239cbc2538e47f52c8f9da00d7154dcd` |

La única acción inicial es ejecutar el preflight completo de SOLO LECTURA y devolver su resultado. No aplicar todavía create, verify o disable. Si pasa, continuar el mismo encargo indicando la migración exacta y después verify. Si falla, identificar la condición concreta sin forzar columnas, permisos o datos. La instalación es inicial: objetos de atención existentes exigen revisión, no reaplicación automática.

El DDL añade columna sin default antes de DEFAULT 1, valida un CHECK y crea índices convencionales dentro de una transacción; puede escanear y bloquear messages/auditoría según su tamaño y actividad. El preflight devuelve estimaciones y bytes, no PII. No se ha medido duración en producción ni se presume que un PASS de compatibilidad elimina el impacto del DDL.

Después de evidencia manual de schema aplicado y verificado: comprobar origin/main y árbol sin cambios extra, rama → PR contra main → checks/revisiones obligatorios → integración sin bypass. Verificar SHA desplegado en Vercel/Railway si hay acceso y sesión autorizada sin envíos, tickets ni cambios de switches. No declarar producción cerrada hasta schema, despliegue y acceso confirmados. Recuperación autorizada: disable conserva datos y auditoría.

## Límites de la evidencia

PostgreSQL 17.10 local con roles/publicación representados; no reproduce GoTrue, PostgREST, JWT ni volumen/latencia de Supabase real. Se acepta PostgreSQL >=15 por dependencias SQL, pero la ejecución acreditada es 17.10. Pruebas API usan contexto autenticado controlado y transporte a SQL real. No se introdujo recuperación general de inbound ni reprocesamiento de claims failed. Las capturas anteriores siguen siendo revisión sintética, no prueba de durabilidad. El diseño y ergonomía no se modifican en este cierre.

Los montajes, autenticación ficticia, interceptores, capturas, logs y entorno de revisión permanecen bajo `.npm-cache`, excluidos de Git y del build. Los dobles legítimos viven solo en `scripts/fixtures`. No se han leído credenciales ni modificado `.env`. La entrega se detiene antes de acceder a Supabase remoto, push, merge o despliegue.
