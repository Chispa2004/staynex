# Salud: errores, cobertura y antigüedad — 22/09/2026

Implementación sobre `main` integrado `79da26e315072c9878dcb57df892b42b171064f9`. Rama `codex/health-truthful-status`, worktree separado. `main` remoto seguía en ese SHA al preparar la publicación autorizada el 22/09/2026. No incorpora commits de PR #11. La rama de organizaciones, el informe original de auditoría y los inventarios privados permanecen intactos.

## Causas y corrección

- La vista inicial usaba valores por defecto positivos (`healthy`, cero avisos y score 0) cuando no había respuesta. Ahora distingue carga, error inicial, respuesta válida y resultado anterior. Los desconocidos muestran «—» y nunca acreditan ausencia de avisos. Se corrigió además el formateador que ocultaba el número cero legítimo.
- El agregador capturaba `dataIssues` pero no los incorporaba al estado principal. `health-coverage.js` asigna cobertura por fuente y por tarjeta. La respuesta contiene `coverage`, `dataIssues` y `warningCount` conocido o nulo. Un fallo de tickets no elimina PMS, habitaciones u otras fuentes obtenidas correctamente.
- Se solicita `count: 'exact'` en las mismas nueve consultas existentes, manteniendo filtros de hotel, selección segura PMS y límites. Solo se declara cobertura completa si el recuento coincide con las filas recibidas. Recuento ausente, límite o muestra incompleta se representa como parcial; no se presenta un subconjunto de tickets como total operativo. No se añadieron consultas separadas, SQL ni permisos.
- Tener un número WhatsApp, configuración IA o PMS mock habilitado no acredita disponibilidad. PMS reutiliza la evaluación de frescura existente de 48 horas, exige proveedor de API real, sincronización satisfactoria y ausencia de error. Un fallo conocido de sincronización sigue siendo un aviso; no se oculta como mera falta de verificación. WhatsApp y funcionamiento IA quedan sin verificar cuando solo se conoce configuración.
- `health-request.js` limita la lectura a 10 segundos, incluyendo obtención de cabeceras y lectura de JSON. AbortController cancela el transporte; una secuencia descarta respuestas fuera de orden incluso si el transporte ignora la cancelación. Se captura el hotel al comenzar, se compara al terminar y se reinicia el estado al cambiar de workspace. Desmontar cancela la solicitud vigente.
- Un refresco fallido conserva tarjetas y cifras anteriores con fecha de recepción y etiqueta histórica, sin afirmar estado actual. El reintento recupera la vista normal. Durante actualización o estado histórico no se puede accionar el control IA desde información anterior. La API y las reglas de permisos/activación no cambian.
- Mensajes nuevos mediante `tx`, con frases ES/EN/FR/DE. Error con `role=alert`, estado con `role=status`/`aria-live`, carga con `aria-busy`, reintento nativo accesible con Enter. Se mantiene el estilo existente y el tema claro en las verificaciones.

No se han modificado `ExecutiveDashboardClient`, distribución Mensajes/servicios, handlers de autorización, reglas de preparación live, proveedores, flags, migraciones, Guest Memory ni onboarding.

## Evidencia antes/después

Reutilizadas las capturas y reproducciones de `docs/daniel-audit-status-2026-09-22.md` (informe de la rama de trabajo original). Se repitieron las funciones de ambos árboles con las mismas entradas sintéticas:

| Caso | `main` anterior | Corrección |
| --- | --- | --- |
| PMS mock con sincronización de enero | healthy / 100 | Sin verificar; score nulo; tickets conocidos conservan 0. |
| Consulta de tickets denegada | healthy / 100 / tickets 0 | Información parcial; tickets desconocidos; otras fuentes conservadas. |
| Fuente limitada sin totalidad acreditada | healthy / 100 | Información parcial; valores identificados como muestra. |
| Error inicial de red, 403 o 504 | Error junto a «Operativo», 0% y afirmación positiva | No disponible, «—», aviso seguro y reintento; sin controles inferidos de respuesta ausente. |
| Refresco fallido tras éxito | Datos previos sin identificación suficiente | Última información disponible con fecha; recuperación al reintentar. |

Los escenarios de funciones no consultan Supabase real. La prueba del cargador real usa un doble de su transporte que comprueba filtros, recuentos, errores y fuentes independientes. La vista real se renderiza con React/SWC en las regresiones; no se basa el cierre en buscar un literal dentro del archivo.

## Pruebas

PASS local con Node 24.19.0, entorno saneado, `SEND_AUTOMATIONS=false`, proveedores simulados, sin `.env` y red no local bloqueada:

- `npm run test:health-truthful-status`: éxito y cero legítimo; fuentes denegadas, fallidas y limitadas; conservación de fuentes independientes; PMS antiguo/mock/configurado y fallo conocido; WhatsApp sin verificar; red/403/504; vencimiento real del timer y abort del cliente; cabeceras que no terminan; respuesta inválida; éxito → fallo → recuperación; respuestas fuera de orden y cambio de hotel; HTML de la vista real para carga, fallo, resultado anterior, recuperación y cobertura parcial.
- `npm run test:platform-management-academy-pms`: PASS. Se sustituyó únicamente la expectativa obsoleta de texto de Salud por aserciones del contrato ante fuente denegada. Se conservan las demás comprobaciones.
- `npm run test:pilot-human-safety`, `npm run test:pilot-failure-rehearsal`, `npm run test:auth-hotel-context`, `npm run test:dashboard-i18n`, `npm run test:ci-guards`: PASS.
- `npm run check:syntax`: PASS, 312 archivos.
- `npm run dashboard:build`: PASS, 64 páginas. Aviso de caché de Webpack en el montaje con dependencias locales enlazadas; no error de compilación.
- `git diff --check`: PASS.

La nueva regresión está incorporada en `scripts/ci/run.cjs`, modo `critical`, ejecutada por el job **Critical tests and syntax**. La publicación debe contrastar su ejecución efectiva en los logs del SHA final. El build validado usa el script normal `dashboard:build`; una invocación preliminar directa de Next desde la raíz se descartó como evidencia del empaquetado CSS por su directorio de trabajo.

Se corrigió también el subtítulo de la página mediante el sistema existente `tx`, con ES/EN/FR/DE. La regresión renderiza la página y `PageHeader` reales en ES y EN; comprueba el texto traducido y la ausencia del subtítulo inglés anterior. PASS junto con las pruebas de i18n, plataforma/PMS y sintaxis.

Comprobación adicional: `test-pms-secrets-isolation.js` falla en línea 683, expectativa estática `platform overview raw block should be bounded`. Se reprodujo exactamente en la copia de M anterior a la corrección. No se cambió esa prueba ni se presenta como PASS. Las selecciones y serialización segura de credenciales PMS permanecen intactas.

## Navegador

Laboratorio separado: `http://127.0.0.1:3346/dashboard/health`. Misma implementación de componentes y contrato, con sesión de pruebas y respuestas sintéticas; no es autenticación remota ni validación de PostgREST de producción. Los intentos de escritura del endpoint de Salud se rechazan en este montaje. Tráfico externo bloqueado en navegador y proceso; no se pulsaron activaciones IA.

Se comprobaron escritorio 1366×900 y móvil 390×844: éxito, error inicial, refresco fallido, recuperación con Enter y fecha del resultado anterior. También 403, 504, espera sin respuesta que vence por el plazo real de 10 segundos, fuente denegada dentro de 200, muestra limitada, PMS antiguo y mock. En móvil, `scrollWidth === innerWidth === 390`; textos nuevos y botón de reintento accesibles sin desbordamiento horizontal. Los errores se anuncian en el árbol accesible; no se afirma una certificación completa con lector de pantalla.

Capturas y logs privados, fuera del commit, en `.npm-cache/health-truthful/` del checkout original:

- `desktop-error.jpg`, `desktop-success-final.jpg`, `desktop-partial.jpg`, `desktop-stale.jpg`.
- `mobile-denied.jpg`, `mobile-client-timeout.jpg`, `mobile-success-final.jpg`, `mobile-stale-final.jpg`, `mobile-recovered.jpg`.
- `client-timeout-dom.txt`, `services-unverified-dom.txt`, logs de scripts y comparación `replay.mjs`.

La UI del laboratorio añade únicamente un selector de escenario local; no se incluye en el código publicable. Las capturas muestran el build local nuevo, no la web pública.

## Cierre B1–B6

| Hallazgo | Estado tras esta pasada |
| --- | --- |
| B1 | Corregido en código y probado localmente. Publicación pendiente. |
| B2 | Corregido en Salud: configuración, muestra y sincronización antigua no producen disponibilidad verificada. Publicación pendiente. |
| B3 | Corregido el contrato de cobertura; cero legítimo conservado y límite explícito. Coste/compatibilidad del recuento real de producción pendientes de verificación tras autorizar publicación. |
| B4 | Mejoras de Dashboard conservadas, sin cambios. |
| B5 | Corregido en Salud: plazo, cancelación, orden/hotel, resultado histórico y recuperación. La observación de antigüedad del Dashboard ejecutivo sigue fuera de este cambio. |
| B6 | Expectativa de Salud actualizada a comportamiento; suite PASS. Los otros fallos heredados no se corrigieron indiscriminadamente. |

## Límites y publicación posterior

La primera publicación mediante PR #12 integró `470071c14fad9a0901d6c2628b69182cd287d60b`; CI y despliegues pasaron. La comprobación pública detectó un caso adicional dentro de este alcance: IA habilitada con conversaciones activas y sin logs recientes mantenía la tarjeta en aviso y la fila de preparación podía afirmar «Operativo». Se amplía la normalización a toda configuración IA `ON`, manteniendo los estados apagado/no configurado y la cobertura. La regresión reproduce ese caso y renderiza las dos presentaciones, exigiendo «Sin verificar» en ambas. No cambia permisos, configuración ni preparación para live.

No hay un umbral aprobado ni un heartbeat verificable para certificar funcionamiento actual de WhatsApp o IA; permanecen sin verificar. La fecha «Datos obtenidos» es la recepción del resultado en el navegador, no una prueba de actividad de todos los servicios. La frescura PMS reutiliza el umbral existente, sin prometer disponibilidad continua. Los controles de preparación para demo/live conservan su lógica y se presentan separadamente de la verificación operativa.

Los recuentos exactos podrían aumentar el coste de las consultas en hoteles grandes. El deadline evita espera indefinida del cliente; no se afirma que interrumpa toda ejecución SQL ya iniciada en servidor. Un fallo/timeout no autoriza ocultarlo ni sustituirlo por cero. El alcance temporal de cada consulta se conserva (reservas vigentes, logs IA de hoy y límites existentes).

Publicación autorizada por el usuario el 22/09/2026; secuencia y condiciones:

1. Revisar el commit y verificar que no incluye archivos privados, fixtures locales ni commits de organizaciones. Contrastar nuevamente `main` y ejecutar pruebas afectadas si cambia la base.
2. Push/PR, esperar CI del SHA final, incluidos `test:health-truthful-status` y build; resolver revisiones bloqueantes antes del merge normal. Sin SQL ni cambios de configuración.
3. Publicar Dashboard siguiendo el flujo habitual. No requiere cambio del backend Express, migración ni activación. Mantener los flags actuales y `SEND_AUTOMATIONS=false`.
4. Verificar con sesión autorizada la respuesta de Salud/cobertura y los recorridos de lectura. No provocar fallos cambiando permisos o proveedores de producción; los fallos controlados se reproducen en el laboratorio.
5. Si hay incompatibilidad, conservar su evidencia y corregir la lectura/presentación. Volver al código anterior reintroduciría falsos positivos conocidos; no considerarlo una confirmación segura de salud.

El cierre en producción requiere registrar PR, SHA integrado, CI, despliegue y verificación pública autenticada. La disponibilidad de un despliegue no sustituye esa verificación. No se requiere SQL remoto ni modificación de la demo.
