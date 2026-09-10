# CI mínimo real y alcance de check:syntax

Revisión local: 10 de septiembre de 2026. Base `d4b6053f264daf88a77e9f71dc7772ad7686ff7c`, rama `codex/reception-message-dashboard`, árbol inicialmente limpio. No se modifican producto, permisos, SQL de protección, configuración remota ni protección de ramas.

## Estado anterior y hallazgos

No había archivos versionados bajo `.github/workflows` en esta rama. Existen dos proyectos npm y dos lockfiles v3: raíz y `dashboard/`. No había archivo que fijara Node para CI; el entorno local usado en estas revisiones es Node 24.19.0 / npm 11.17.0. Los lockfiles resuelven, entre otras dependencias, Next 15.5.18. No se cambian dependencias ni lockfiles.

`check` solo ejecutaba `node --check src/server.js`. `check:syntax` encadenaba 7907 caracteres de comandos para una lista manual parcial. No incluía, por ejemplo, `src/services/message.service.js`, el contrato de envío manual ni su nueva prueba. Se reprodujo un falso negativo introduciendo `const = ;` en el servicio de mensajes **de una copia desechable**: el comando anterior devolvió 0. La copia fue restaurada; no queda ningún archivo intencionalmente roto. Evidencia: `.npm-cache/ci-minimum/baseline-syntax.log`.

Las pruebas críticas ya tenían aserciones y salida no cero ante fallos. Sus PASS con mocks no prueban RLS, grants o comportamiento de Supabase desplegado. El ensayo PostgreSQL existente sí ejercitaba SQL real, pero requería un ejecutable Windows y un contenedor con nombre/etiqueta fijos ya creados; por tanto, no era reproducible en un runner limpio.

## Workflow y nombres de checks

Un único workflow: `.github/workflows/ci.yml`, **Staynex CI**, con tres jobs independientes:

- **Critical tests and syntax** (`critical`): sintaxis, controles de fallo/aislamiento y las siete suites críticas.
- **Dashboard build** (`dashboard`): build de producción con código y dependencias reales, sin fixtures añadidos al runtime.
- **PostgreSQL knowledge isolation** (`postgres`): once comprobaciones SQL reales en PostgreSQL desechable.

Estos son los tres nombres de checks candidatos a obligatorios. GitHub puede mostrarlos precedidos por `Staynex CI /`. No se ha cambiado ninguna regla de rama; confirmar los contextos exactos después de la primera ejecución real.

Se ejecutan en todos los `pull_request` y `push`, además de ejecución manual. No se filtra por rutas: evita que un nuevo módulo quede fuera y que un check obligatorio quede pendiente por filtros de archivos. No hay `continue-on-error`, condiciones de omisión, `--if-present` ni errores ignorados. Cada job tiene timeout, permisos `contents: read` y checkout sin credenciales persistentes. No se usa `pull_request_target` ni secretos de repositorio/producción. La cancelación solo sustituye una ejecución anterior de la misma referencia; no convierte fallos en éxitos.

Node se fija a **24.19.0** en `.node-version`, y el ejecutor también verifica esa versión exacta. Se usa `npm ci --ignore-scripts --no-audit --no-fund` para ambos lockfiles en los jobs de pruebas/build. Se omiten scripts de instalación; las dependencias bloqueadas y el build se validaron así. `setup-node` cachea descargas npm con ambos lockfiles, no reutiliza `node_modules`. Referencia: [setup-node v4](https://github.com/actions/setup-node/blob/v4/README.md). Los tags mayores de Actions y la imagen del runner pueden evolucionar; no se afirma reproducción binaria idéntica del sistema operativo.

## Cobertura y límites de cada comprobación

| Comando real | Qué comprueba | Qué no demuestra |
| --- | --- | --- |
| `check:syntax` | Descubre JS/CJS/MJS en `src`, `shared`, `scripts`, `dashboard/lib`, `dashboard/app/api`, `dashboard/scripts` y configuraciones JS en la raíz del dashboard. Ejecuta un `node --check` por archivo, verifica cada salida, falla ante raíces ausentes o cero archivos e informa del total. | No ejecuta la lógica, resuelve imports ni valida SQL, JSX, tipos o permisos. |
| `test:ci-guards` | Un módulo nuevo mal formado falla; un módulo válido que lanzaría una excepción solo se analiza; falta de raíz falla; salida controlada 23 atraviesa el ejecutor; no se ejecutan suites siguientes. Comprueba limpieza de variables, flags sintéticos, bloqueo de .env y tráfico externo. | No es un sandbox contra código malicioso ni una certificación de GitHub Actions. |
| `test:manual-send` | Servicios y manejadores reales con proveedor/BD simulados: validación, autorización de ruta, destinatario del hotel, doble clic, incertidumbre, persistencia y recuperación. | No envía WhatsApp ni prueba callbacks o PostgreSQL. |
| `test:inbox` | Funciones del Inbox con datos simulados y aserciones de código sobre ergonomía/Takeover. | No ejecuta un navegador. La evidencia visual está en el informe de envío manual. |
| `test:auth-hotel-context` | Contextos, roles, sesión y rutas con límites de sesión/BD controlados; incluye comprobaciones de fuente. | No verifica GoTrue, cookies de una instalación real ni RLS. |
| `test:messages-tenant-isolation` | Contratos de SQL/código y helpers de pertenencia/inserción con FakeSupabase. | No aplica las migraciones de mensajes ni comprueba sus constraints en PostgreSQL. |
| `test:pilot-human-safety` | Gates de IA, Human Takeover, Kill Switch, permisos y configuración mediante funciones/casos sintéticos. | No prueba proveedores o concurrencia de automatizaciones. |
| `test:translation-knowledge-isolation` | Rutas y servicios reales con dependencias sustituidas: traducción entre hoteles, caché, históricos y Knowledge. | No certifica los grants/RLS remotos. |
| `test:http-security` | Añade Express real en loopback, firma Twilio calculada localmente, autenticación interna, rechazo de webhooks, gates de rutas debug/test y redacción de errores. | No contacta Twilio; configuración y repositorios de datos son sintéticos. |
| `dashboard:build` | Compilación Next de páginas, componentes y JSX, resolución de módulos y generación de páginas con la configuración real. | No es una prueba visual, lint exhaustivo, prueba de negocio ni autorización remota. |
| `test:knowledge-isolation-postgres` | SQL real: preflight READ ONLY, revocaciones, RLS, CRUD autorizado filtrado, denegación anon/authenticated, BYPASSRLS de service_role, políticas y grants de columnas/roles heredados, rollback y conservación de filas legacy sin propietario. | No reproduce PostgREST/Auth ni todo el historial de migraciones; usa fixtures explícitos. |

Se difieren al build los componentes/páginas JSX y dos proveedores React escritos como `.js`: `dashboard/lib/i18n/useDashboardLanguage.js` y `dashboard/lib/theme/useDashboardTheme.js`. No se omiten archivos automáticamente por detectar un error de parseo: un nuevo JSX en un directorio de JS puro hará fallar el check y deberá clasificarse explícitamente. `node --check` solo analiza sintaxis, como especifica [Node CLI](https://nodejs.org/api/cli.html#c---check).

El alias anterior `check:all` sigue significando sintaxis + build por compatibilidad; **no ejecuta todas las pruebas**. Para los controles críticos completos usar los tres comandos `ci:*` indicados abajo. La sintaxis es complementaria, nunca sustituto de tests/build.

## Aislamiento y PostgreSQL

`scripts/ci/run.cjs` conserva solo variables del sistema necesarias, descarta variables heredadas de proveedores/BD y fija `SEND_AUTOMATIONS=false`, `USE_MOCK_AI=true`, `GUEST_MEMORY_ENABLED=false`, `AUTOMATION_TEST_SEND_ENABLED=false` y telemetría desactivada. `scripts/ci/isolate.cjs` bloquea cargas de archivos .env y conexiones TCP ajenas a loopback. Esto permite la prueba HTTP local y provoca errores ante tráfico accidental de proveedores. Es defensa complementaria: no se deben proporcionar secretos reales al CI. No se ejecutan comandos de jobs de automatización.

El ensayo PostgreSQL no acepta una URL de BD ni reutiliza un contenedor existente. El helper inspecciona el contexto Docker y rechaza endpoints TCP/SSH; solo acepta socket Unix o named pipe local y contenedores Linux. Exige que la imagen oficial **postgres:17.10** ya esté disponible; la descarga es un paso explícito del workflow. Cada ejecución crea un nombre UUID y etiqueta exclusivos, utiliza el ID de la imagen inspeccionada, `--network none`, sin puertos ni mounts de otros proyectos y PGDATA en tmpfs. El `trust` de inicialización se limita a ese contenedor incomunicado. Antes de eliminarlo verifica ID, etiqueta y aislamiento. `finally` limpia también al fallar una aserción normal; una terminación abrupta del proceso/host puede requerir limpiar el contenedor identificado en el recibo, comprobando su identidad. Los runners hospedados son desechables.

Se reutilizan las once aserciones anteriores, sin debilitarlas. El fixture canónico carga `supabase/schema.sql` con roles sintéticos y publicación de prueba; el fixture legacy crea deliberadamente una tabla sin propietario. Solo se aplican `preflight_hotel_knowledge_isolation.sql`, `protect_hotel_knowledge_backend_only.sql` y, al fixture legacy, `add_hotel_id_to_knowledge.sql`. **Esto valida esos fixtures y ese SQL; la reproducibilidad de todas las migraciones históricas es otro bloque.** Message Attention/PostgREST, RLS de mensajes desplegado y Supabase remoto no quedan certificados.

## Reproducción local

Usar Node indicado en `.node-version` y una copia limpia sin .env. Los comandos son los mismos del workflow:

```sh
node --version
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix dashboard ci --ignore-scripts --no-audit --no-fund
npm run ci:critical
npm run ci:dashboard
docker context inspect
docker pull postgres:17.10
npm run ci:postgres
git diff --check
```

Confirmar que el contexto Docker es local antes de descargar. El helper vuelve a comprobarlo antes de crear recursos. Docker no disponible, imagen ausente, versión Node incorrecta, script ausente, error de spawn, señal o salida no cero hacen fallar el check; no producen un PASS parcial. `ci:postgres` usa solo módulos Node incorporados y Docker, por lo que su job no necesita instalar dependencias de la aplicación.

Para una suite individual se puede ejecutar su nombre npm dentro de ese entorno sintético; los entry points `ci:*` son el procedimiento protegido y repetible. La instalación puede necesitar el registro npm y la descarga Docker puede necesitar Docker Hub; las pruebas y el build no necesitan acceso a servicios externos. No se descargan paquetes ni imágenes durante el ensayo PostgreSQL.

## Evidencia de esta revisión

Instalación desde cero en `.npm-cache/ci-minimum/publishable`, sin enlaces a dependencias existentes ni archivos .env. Ambos `npm ci` PASS: 183 paquetes backend y 386 dashboard, sin modificar lockfiles. Node 24.19.0 / npm 11.17.0.

- `npm run ci:critical`: PASS, 50 s. Incluye los **296 archivos** analizados por sintaxis, la propagación de salida 23 y las siete suites solicitadas (16 grupos de envío manual y las regresiones existentes de aislamiento/HTTP).
- `npm run ci:dashboard`: PASS, 106 s, build limpio con Next 15.5.18. El lockfile incluye los binarios SWC para Windows x64 y Linux x64 con su integridad; el binario Linux del build sigue pendiente de ejecución en GitHub.
- `npm run ci:postgres`: PASS, 11 comprobaciones en PostgreSQL 17.10, 58 s. Imagen oficial descargada explícitamente; digest `sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317`. Contenedor `staynex-ci-knowledge-47d1b424-b2d5-4053-aa4a-9a59b4f68af7`, ID `d7d7c0be05f13946988a6a9b3908473f51188d2b49818f63613262bfd09e3346`, eliminado y ausencia confirmada por inspección.
- YAML parseado con `js-yaml` ya instalado por el lockfile: tres jobs, eventos PR/push y sin condiciones/errores ignorados. Esto no sustituye la evaluación de expresiones de GitHub.
- `git diff --check`: PASS antes del commit.

Logs: `.npm-cache/ci-minimum/*.log`; manifiesto de fuentes: `.npm-cache/ci-minimum/source-manifest.json`; SQL/resultados/recibo del recurso: `.npm-cache/ci-minimum/publishable/.npm-cache/ci/postgres/`. El fallo controlado se crea y elimina en un directorio temporal exclusivo. No se deja código roto ni se debilitan pruebas. Los ensayos anteriores de traducción/conocimiento y envío manual se preservan.

Archivos de este bloque:

```text
.github/workflows/ci.yml
.node-version
docs/09-testing.md
docs/ci-minimum.md
package.json
scripts/check-syntax.cjs
scripts/ci/disposable-postgres.cjs
scripts/ci/isolate.cjs
scripts/ci/run.cjs
scripts/test-ci-guards.cjs
scripts/test-knowledge-isolation-postgres.cjs
```

## Pendientes y estado de Badar

- **CI mínimo real: implementado y verificado localmente.** Pendiente subir el commit y comprobar los tres jobs en GitHub: descarga de Node/dependencias, binarios Linux, permisos del runner y disponibilidad de Docker. No se marca GitHub PASS por haber pasado en Windows local con PostgreSQL Linux.
- **check:syntax: corregido y verificado localmente.** Se cerró la omisión demostrada mediante descubrimiento de archivos y pruebas de salida; sigue siendo una comprobación complementaria de JS puro.
- Si se desean checks obligatorios, configurarlos manualmente después de ver sus contextos reales en GitHub. No se modifica protección de ramas aquí.
- Despliegue, Supabase remoto, callbacks salientes y migraciones históricas completas continúan pendientes. No hubo push, despliegue, cambios remotos ni activación de automatizaciones.
