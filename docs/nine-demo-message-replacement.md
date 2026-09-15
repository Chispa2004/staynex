# Nueve ejemplos y un único control de navegación

El Dashboard usa el control global de AppShell. Se retira únicamente el botón del
saludo; AppShell conserva el control compacto de escritorio y abrir/cerrar en móvil.
Mensajes y Estado de conexión y servicios mantienen su distribución.

El generador `scripts/demo-message-stages.js` crea por defecto la edición `nine`:
tres ejemplos antes de llegar, tres durante la estancia y tres después de salir.
Cada uno tiene huésped, reserva, conversación y mensaje independientes; tres usan
la transición de resolución existente y tres tienen alerta urgente vigente.
Sus indicadores de atención SIMULADO son 9/3/6/3 el día de carga.

Los nueve instantes se distribuyen en el tiempo ya transcurrido del día hotelero,
con un máximo de nueve horas desde medianoche. Se guardan una sola vez. Ni repetir
la carga ni abrir el Dashboard desplaza fechas o cambia el significado de hoy.
El teléfono es `synthetic-only:UUID` y las habitaciones son etiquetas DEMO.

Las nuevas identidades usan slots `nine-*` en el namespace existente. Las tres
identidades antiguas permanecen protegidas por las mismas guardas denegatorias,
incluyendo envío manual, traducción, IA, colas, PMS y Sheets. Los metadatos SIMULADO
no sustituyen estas guardas. No se cambia ningún flag, conexión o permiso.

`edition: 'legacy'` permite generar o retirar los tres ejemplos originales con sus
identidades y textos originales. Sus comprobaciones de actividad posterior siguen
intactas. No usar su retirada para forzar una sustitución con dependencias.

## Reemplazo con respaldo

`prepareDemoReplacement({backup,referenceDate})`, en
`scripts/demo-message-replacement.js`, recibe un respaldo privado consistente con
hotel y operador verificados por UUID y registros completos. No lee credenciales,
no conecta y no ejecuta SQL. Devuelve un SQL de reemplazo y un generador de recuperación.

El procedimiento limita el borrado a los mensajes respaldados y sus estados de
atención. Solo retira conversaciones vacías sin otras dependencias y sus estados
de IA. Conserva huéspedes, reservas, tickets, programaciones y auditoría histórica.
Comprueba las filas completas, el conjunto de mensajes del hotel y los FK actuales
bajo bloqueo; rechaza cambios posteriores, referencias ajenas y triggers habilitados.
No permite cascadas ni pérdida de referencias mediante SET NULL. Carga y retirada
comparten una transacción. Repetir el reemplazo completo no duplica ejemplos.

Antes de ejecutarlo: respaldar desde una transacción de lectura consistente, guardar
checksum y el SQL privadamente, y revisar los consumidores externos. Desplegar y
verificar todas las versiones activas con los slots nuevos antes de cargar. Mantener
SEND_AUTOMATIONS=false. Los SET de reconocimiento del SQL no son flags operativos.

La recuperación se materializa con `plan.recovery(postLoadBackup)`: elimina únicamente
las filas nuevas que sigan coincidiendo con el respaldo posterior y restituye las
filas antiguas completas. Conserva también la nueva auditoría histórica. Rechaza
actividad posterior o dependencias nuevas. No ejecutar una recuperación automática
si el hotel ha seguido trabajando; revisar el conflicto.

## Validación local

- `node --require ./scripts/ci/isolate.cjs scripts/test-demo-replacement-postgres.cjs`:
  PostgreSQL desechable sin red; nueve casos, tiempos, etapas, estados, repetición,
  conservación de otro hotel, rechazo de dependencias/cambios, rollback y recuperación.
- `node --experimental-vm-modules --require ./scripts/ci/isolate.cjs scripts/test-demo-message-stages-postgres.cjs --integrated`:
  regresión de los tres casos originales y sus handlers HTTP reales.
- `npm run ci:critical`: incluye aislamiento externo de las nueve identidades y
  controles ordinarios con proveedores espía. Comprueba también las identidades antiguas.
- Build del Dashboard y revisión de navegación local en escritorio, compacto y móvil.

Las pruebas locales no acreditan Supabase, proveedores o una publicación remota.
Respaldo, SQL con UUID privados, capturas y comprobación pública permanecen fuera de Git.
