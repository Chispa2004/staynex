# Prioridad de seguridad Next.js — 23/10/2026

Continúan pausadas continuidad 1.2, Ubikos y las demás tareas. Copias 2.3 cerrada
documentalmente y 2.4 conservada en `c64158e`; no se alteran sus ramas ni datos.
Se revisa el aviso verbal de la reunión sin atribuirle un CVE por suposición.
El usuario no conoce su enlace/identificador. **Aviso de la reunión no identificado
inequívocamente; no se declara confirmado ni resuelto.**

## Evidencia de versiones

Lectura GitHub del 23/10: main de Staynex `f627f8b441b1107c229a0daf7a5cb3ce95fd3d27`;
PR58 `ffc65cb955076fdacf96facbd6a75706da5a41c7`, draft, sin auto-merge.
Main web `d6b6e1db025966dcf47f88b691e8ecfa64b43e07`; PR1
`9d60f1e744e2569cabc0001b462b19473c22af74`, draft, sin auto-merge.
Dependabot de ambos repositorios devuelve 403 «alerts are disabled» y el CLI
advierte de scope adicional; no se habilitan alertas ni amplían permisos. Eso no
acredita ausencia de vulnerabilidades ni identifica lo dicho en la reunión.

| Superficie/base | Declaración → lockfile efectivo anterior | Estado del despliegue |
|---|---|---|
| Dashboard main f627f8b, Production conservada ffc65cb y candidato local 63b34c2 | Next `^15.1.7` → **15.5.18**, eslint-config-next 15.5.18, React/react-dom 19.2.6, sharp 0.34.5, libvips Linux 1.2.4 | Evidencia PMS1.25/1.26: `dpl_Gu1BuKghVXNRrJEgDLYD3UhZL3hT`, dominio staynex-chi.vercel.app, Ubikos OFF; no reconfirmación de runtime remoto en esta tarea. CI conservado del candidato confirma Next15.5.18. |
| Backend Railway f627f8b | Raíz Express/Node; no dependencia Next en su manifiesto/lock raíz | Deployment conservado `407f5c24-c260-4c1d-add6-9d7df095073a`; no reconfirmado aquí. El parche Dashboard no requiere sustituirlo. |
| Web main/Production conservada d6b6e1d | Next `latest` → **16.2.6**, eslint-config-next 16.2.6, React/react-dom19.2.6, sharp0.34.5, libvips Linux1.2.4 | Evidencia WEB1.11: deployment `2Dk3vAkbTHiEise49zBtMQgsuiQs`, staynex-website.vercel.app. No se presume publicación de Hospedios. |
| Web candidato PR1 9d60f1e | Mismas versiones bloqueadas que main | Solo Preview previamente acreditado. Marca/diseño y contacto desactivado conservados. |

No confundir rango package.json con resolución de npm ci; tampoco lockfile del
SHA conservado con una inspección actual del binario desplegado. No se leen
secretos/configuración de credenciales ni se prueban exploits contra servicios.

Actualización de evidencia remota, 23/10: la sesión Vercel consultada en modo
lectura confirma como Production READY los mismos deployments: Dashboard
`dpl_Gu1BuKghVXNRrJEgDLYD3UhZL3hT`, alias `staynex-chi.vercel.app`, y web
`2Dk3vAkbTHiEise49zBtMQgsuiQs`, alias `staynex-website.vercel.app`.
La web muestra explícitamente main/d6b6e1db025966dcf47f88b691e8ecfa64b43e07.
Dashboard muestra origen CLI; su atribución a ffc65cb procede del comprobante
conservado del mismo deployment, no de un SHA visible en esa pantalla. No se
inspecciona el binario remoto ni se reconfirma Railway. El equipo figura Hobby;
no se contrata ni modifica plan. Las celdas anteriores distinguen la evidencia
histórica de esta reconfirmación de metadatos.

## Avisos oficiales independientes de la comunicación de la reunión

Fuente: [Next.js, actualización 14/10/2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
No se asume que sea el aviso al que se refería el interlocutor.

| Aviso y versión corregida | Rango/condición | Dictamen del código revisado |
|---|---|---|
| [CVE-2026-96889 / GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), crítico; Next15.5.28/16.4.1, workaround sharp>=0.35.5 | Next10–15.5.27 y rama16 hasta16.4.0 según advisory; Image Optimization sobre Linux glibc, dependencia nativa de imagen. | Ambos lockfiles contienen versiones afectadas y sharp anterior a la corrección. No se acredita explotación ni todas las condiciones del servicio de imágenes de Vercel. No hay next/image, next/og, remotePatterns ni dangerouslyAllowSVG en el código revisado; eso reduce superficie visible, pero no prueba que /_next/image esté deshabilitado. |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), crítico, sin CVE en el aviso; Next16.4.1 | Next16.0.0–16.4.0, App Router con Cache Components y función use cache que devuelve múltiples typed arrays. | Dashboard15 fuera del rango. Web16 dentro del rango pero sin Cache Components/use cache en las fuentes revisadas: condición no encontrada. No declarar RCE demostrada. |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), alto; Next15.5.28/16.4.1 | Next13–15.5.27 y16–16.4.0; App Router con al menos una Server Action. | No se encuentran directivas use server en las bases revisadas; rutas API no son Server Actions. Verificar también manifiestos del build. |

Los avisos React relacionados afectan `react-server-dom-*`, no justifican por sí
solos cambiar react/react-dom19.2.6. Next distribuye módulos RSC compilados; su
actualización es la vía indicada por Next. No añadir dependencias RSC directas
para aparentar corregir los módulos internos. Sin afirmación de ausencia de otros
avisos; esta revisión es acotada, no auditoría general.

## Parche local mínimo

- `codex/next-security-dashboard`, base exacta publicada ffc65cb: Next y
  eslint-config-next **15.5.28**, override acotado `next.sharp=0.35.5`. Necesario:
  el manifiesto npm de Next15.5.28 permite `^0.34.3 || ^0.35.5`; actualizar solo
  Next no impide mantener sharp vulnerable en un lock anterior. Lock regenerado
  por npm, incluidos binarios por plataforma; React y backend no cambian.
- `codex/next-security-website-production`, base d6b6e1d: Next y eslint-config-next
  **16.4.1**, sharp resuelto **0.35.5**, preservando el override PostCSS existente.
  Es una actualización dentro de major16; la versión publicada del arreglo es
  16.4.1, no se inventa un parche16.2. No cambios visuales/comerciales ni formulario.
- `codex/next-security-website-candidate`, base9d60f1e: mismos cambios de dependencia,
  conservando contenido/idiomas/contacto OFF y las pruebas del candidato. No se
  modifica PR1 ni se publica su contenido como consecuencia del parche.

Instalación desde lockfiles, `--ignore-scripts --no-audit --no-fund`; no audit fix
ni actualización general de dependencias. Cambios transitivos pertenecen a los
árboles Next/sharp/eslint; se revisan por diff. Node local24.19.0; sin cambiar
versión global. No .env copiados al aislamiento ni proveedor operativo invocado.

En ambas ramas web se conserva la actualización automática de `next-env.d.ts`
del build de Next16.4.1: tipos de rutas de producción y `root-params.d.ts`.
No cambia lógica ni diseño.

## Validación local acreditada

Windows, Node24.19.0, instalaciones desde lockfile y red externa bloqueada en
los procesos de prueba/build; credenciales no copiadas. Evidencias de ejecución
en `../evidence` de cada worktree aislado (fuera de Git).

| Candidato | Resultado |
|---|---|
| Dashboard | `ci:dashboard` PASS: build completo y 11 grupos de diagnóstico del destino servidor; `test:auth-hotel-context` PASS; 42 pruebas sintéticas de observación, vista, transporte y diagnóstico PASS. |
| Web publicada | Build completo y typecheck PASS. |
| Web candidata | 13 pruebas de contacto simulado PASS; build completo y typecheck PASS. |
| Los tres | Arranque local normal y GET de login/portada HTTP200; manifiestos con cero Server Actions; procesamiento sharp0.35.5 de imagen ficticia PASS. En candidato comercial, API de disponibilidad confirma contacto OFF y sin mailto. |

**Excepción preexistente:** `test:permissions` falla en «PMS Academy module must
not be receptionist-facing», línea156. Se reproduce exactamente contra la base
ffc65cb sin parche. No se cambia esa política ajena a la actualización ni se
declara toda la batería aprobada. No acredita una regresión de dependencias.

No se ha ejecutado CI remoto ni validación Linux/Vercel de estos parches locales.
Antes de publicar: ejecutar las comprobaciones pertinentes en Linux y revisar
expresamente la excepción preexistente; verificar dependencias del artefacto
producido. No confundir estos resultados con CI remoto aprobado.

## Mitigación y publicación posterior (no ejecutadas)

No se ha demostrado una condición que exija cerrar ahora toda la aplicación.
Si se confirma exposición del optimizador y no puede publicarse el parche de
inmediato, proponer bloqueo temporal de `/_next/image` en el borde: reduce esa
superficie, puede romper imágenes optimizadas y no corrige RSC. Necesita autorización
y comprobación del servicio real; no se aplica aquí. No asumir cobertura WAF
automática ni girar secretos sin evidencia de compromiso.

Tras autorización de publicación, reconfirmar alias/deployment y SHA efectivos;
si difieren de las referencias, portar solo el parche sobre esa versión y validar.
Para Dashboard: construir el parche de ffc65cb en Production **sin asignar dominio**,
conservar recuperación actual, comprobar versión instalada, sharp, destino Supabase
por el mecanismo privado ya revisado y rutas sin efectos; promover únicamente
Vercel. Mantener Ubikos OFF, sin lectura, y conservar Railway y sus disparadores.
No merge a main: puede desplegar Railway y perder divergencia del Dashboard.

Para web: usar parche sobre d6b6e1d, no PR1 como atajo para publicar cambios de marca.
Reconfirmar proyecto/alias y condiciones de alojamiento antes de promover; no
eludir las limitaciones comerciales documentadas. Validar navegación/metadatos y
ausencia de activación del contacto según su base. Candidato Hospedios queda
corregido por separado para su posterior publicación autorizada.

Enumerar deployments anteriores alcanzables con la versión vulnerable y decidir
protección/retirada bajo autorización: cambiar un alias no elimina sus URLs.
La recuperación conservada sigue teniendo dependencias anteriores; no presentarla
como rollback seguro de seguridad. Reconciliar main y ramas después con parches
acotados y control del relevo, sin activar ahora el despliegue del backend.

Siguiente intervención propuesta: revisión de los candidatos y autorización
separada de publicación exclusivamente Vercel, con reconfirmación de bases,
validación de artefactos y cierre de exposición de deployments antiguos. La
identidad del aviso de la reunión sigue pendiente de enlace/GHSA/CVE cuando esté
disponible; no bloquea documentar o preparar estos parches oficiales independientes.
