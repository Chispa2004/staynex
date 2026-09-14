# Diagnóstico de la versión de Inbox publicada

Fecha: 14 de septiembre de 2026. Revisión de lectura y preparación local; sin push, merge, despliegue, SQL remoto ni cambios de configuración/datos.

## Causa demostrada

El pulido `310236b1bde19ee10248b0a3d5c068280b94e8fd` sigue únicamente en la rama local `codex/inbox-state-clarity`. Tras `git fetch origin`, `origin/main` continúa en `cffec64faacba8c917068a269f458dd9328aed7e`, merge de PR #5. No existe una PR para la rama del pulido en la consulta de GitHub de este pase.

La comparación de contenido confirma que no hay squash/cherry-pick equivalente: `origin/main` no tiene `dashboard/lib/inbox-clarity.js`, y mantiene el generador antiguo de iniciales, el filtro condicional «IA activa»/«IA sin control humano» y las opciones de idioma abreviadas. No hay commits posteriores en main que hayan revertido el pulido. El merge-base de main y la rama es el propio `cffec64…`: el commit existente se puede proponer como continuación directa, sin duplicarlo.

Además, una petición HTTP GET nueva, sin cookies ni sesión, a `https://staynex-chi.vercel.app/dashboard/inbox` devolvió 200 y referenció este recurso:

```text
/_next/static/chunks/app/dashboard/inbox/page-190a9a24febd329d.js
SHA-256: f1ea16e9ba93d665868d9b0eb17b36b36f53d2aa72d1ff9101f847d1b7ec4384
Tamaño: 110934 bytes
```

El recurso servido por ESE dominio contiene:

```js
{key:"ai",label:nb?"IA activa":"IA sin control humano",count:Y.filter(e=>!e1(e)).length}
{code:"es",label:"ES"},{code:"en",label:"EN"},{code:"fr",label:"FR"}
```

También conserva la función de iniciales basada en el primer/segundo fragmento de la identificación, `slice(0,2).toUpperCase()`, y `inbox.replyWillBeSentIn` con idioma convertido a mayúsculas. No contiene los literales `Sin control humano`, `Enviar en:` ni el identificador de evento `experience_booking_request_created` del pulido.

Por tanto, el código público que sirve la URL es anterior al pulido, no solamente el estado de una pestaña antigua. No se encontró motivo para borrar caché, storage o sesiones. Un despliegue actualizado de main es compatible con esta situación porque main todavía no contiene el cambio.

## Plataformas: evidencia y límites

GitHub registra para `cffec64…`:

- Vercel: estado `success`, 11/09/2026 11:16:47 UTC, [detalle de despliegue](https://vercel.com/staynex-s-projects/staynex/663v2kHdTFmDB2tiLneSnY945obo). El destino indicado por la plataforma es proyecto `staynex`, equipo `staynex-s-projects`, entorno `Production`, deployment GitHub `6391923931`, URL `https://staynex-k95zq279w-staynex-s-projects.vercel.app`.
- Railway: contexto `virtuous-possibility - staynex`, `success`, 11/09/2026 11:17:17 UTC, para el mismo SHA. No se solicitó ningún redespliegue; estas diferencias de etiquetas, avatar e idiomas residen en el dashboard y no necesitan un cambio del backend.

Esto es evidencia comunicada por las integraciones en GitHub, no una lectura del panel actual de Vercel. La URL específica del deployment redirige a login: no se comparó su bundle con el del alias ni se certificó desde Vercel el vínculo actual alias → deployment → SHA. El GET público del alias sí demuestra directamente que sirve la implementación anterior.

Computer Use terminó al intentar observar Chrome porque no pudo determinar la URL actual con suficiente confianza para aplicar su política. Se detuvo la automatización de interfaz. No se inspeccionó el DOM autenticado, no se abrieron conversaciones reales ni se alteraron sesión/borradores. No se eludió el login del deployment.

Pendiente concreto de acceso: comprobar en el proyecto de Vercel que el dominio `staynex-chi.vercel.app` figura en el deployment de producción esperado; leer su commit Git y los valores efectivos de Root Directory/build. El repositorio documenta Root Directory `dashboard`, inclusión de archivos fuera de esa raíz y build Next del dashboard (`docs/08-deployment.md`); esos valores locales no prueban la configuración remota actual. No hay evidencia para proponer un cambio de configuración del dominio o de Railway.

## Recorrido de renderizado

`dashboard/app/dashboard/inbox/page.js` importa `@/components/InboxClient` y renderiza `<InboxClient conversations={[]} />`; es idéntico en main y en la rama local. La ruta no selecciona una implementación alternativa por hotel o rol.

`dashboard/components/InboxClient.js` local importa `inbox-clarity.js` y usa sus helpers en iniciales, disponibilidad e idiomas. El filtro conserva `!isHumanTakeoverActive(conversation)`. Menú compacto/expandido y permisos de administrador controlan disposición/acciones, no sustituyen esa implementación por otro Inbox. Las traducciones de interfaz no reescriben el literal del filtro. No se modificaron las apariciones legítimas de «IA activa» de otros indicadores.

## Validación proporcional

- `node --require ./scripts/ci/isolate.cjs scripts/test-inbox.js`: PASS con `SEND_AUTOMATIONS=false`. Incluye identidad con nombre y solo teléfono, lectura Francés/envío Español, etiquetas de estado y el predicado conservado del filtro.
- Comparación sintética del generador anterior extraído directamente de `origin/main` y el helper local: la identificación telefónica genera iniciales artificiales en el anterior y `null` (icono de persona en JSX) en el actual; «Ana López» conserva `AL`. Nombres localizados comprobados: Francés para lectura, Español para envío.
- `git diff --check`: PASS. No se cambió la interfaz ni el backend en este pase, por lo que no se repitió el build ni se generaron capturas nuevas. El build, las suites relacionadas y las capturas sintéticas de `310236b…` permanecen documentados en `docs/inbox-clarity-review.md`; no se presentan como ejecución de hoy.
- Inventario sin seguimiento intacto, SHA-256 `f92bda9820b7cc54b61a9f4910f7891da12dcba7bdb9578ecec3b32b331e3429`. Recursos públicos y evidencia de diagnóstico se guardan únicamente en `.npm-cache/inbox-deployment-diagnosis/`, fuera de Git.

## Integración preparada, no ejecutada

No hace falta otro arreglo de producto. La rama conserva exactamente los cinco archivos del pulido ya probado y añade únicamente este informe. Propuesta de PR hacia main:

**Título:** Aclara estados, idiomas e identidad del Inbox.

**Descripción:** Recepción sigue viendo el filtro «IA activa», idiomas abreviados y avatares derivados del teléfono porque el pulido aún no está integrado. Esta PR incorpora el commit existente `310236b…`: separa conexión, control humano y respuestas automáticas; distingue lectura y envío con nombres de idioma completos; usa un icono cuando falta nombre; compacta la lista y diferencia eventos internos únicamente con procedencia explícita. Conserva diseño 240/72, ficha, permisos, aislamiento, traducción autorizada y recuperación de envíos. Validación local y visual del pulido en su informe; suite Inbox repetida en este diagnóstico. Zoom nativo 125/150 % de este pulido pendiente.

Siguiente secuencia, solo cuando se autorice publicar:

1. Revisar el diff y subir normalmente `codex/inbox-state-clarity`, sin force push; abrir PR a main con el commit existente y este informe.
2. Verificar en el SHA final los tres jobs reales: Critical tests and syntax, Dashboard build y PostgreSQL knowledge isolation. El Preview no sustituye esos checks.
3. Tras autorización de integración, merge por el procedimiento del repositorio; observar la publicación automática de main. No forzar Railway para arreglar la presentación.
4. En Vercel confirmar dominio exacto, deployment de Production y SHA integrado. Comprobar el nuevo recurso de Inbox servido por el alias y, con una pestaña nueva autenticada, avatar/filtro/idiomas. Preservar sesiones y borradores; no enviar mensajes ni cambiar control de conversaciones.

Estado de este pase: causa de contenido ausente y bundle anterior demostradas; integración preparada localmente; comprobación exacta del alias en el panel y publicación pendientes. Ninguna operación remota de escritura ejecutada.
