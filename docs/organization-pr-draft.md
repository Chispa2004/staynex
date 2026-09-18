# Título preparado

Organizaciones cliente y acceso hotelario explícito con directorios por ámbito

# Descripción preparada

Los clientes con varios hoteles necesitan un directorio propio y permisos separados por hotel. Esta rama añade organizaciones de tipo cadena o independiente, «Mis hoteles» y contexto de organización/hotel sobre Dashboard e Inbox existentes. Staynex conserva el acceso interno y registra las aperturas con la identidad real del operador.

La administración de cadena genera concesiones hotelarias explícitas e idempotentes, separadas de las asignaciones independientes. Revocar rol, membresía u organización retira el alcance correspondiente; conservar un rol en otro hotel no concede permisos adicionales. El servidor comprueba la sesión y filtra el ámbito antes de consultar/paginar; RLS y RPC privadas cubren el acceso directo. La gestión hotelaria no puede conceder roles internos ni modificar concesiones derivadas.

Los indicadores mantienen sus fórmulas y muestran «Usuarios» y «Accesos a hoteles», con la explicación de múltiples accesos. Los roles visibles se traducen a «Administrador» y «Recepción». Ticket ajeno devuelve 404 antes de escribir; gestión de equipo sin sesión/ámbito devuelve 401/403.

## Validación

- `ci:critical`: PASS, incluyendo autorización, traducciones, contexto y paginación de más de 1.000 filas.
- `ci:postgres`: PASS, incluidos 22 escenarios de organizaciones y las regresiones existentes de Knowledge/exclusión.
- `ci:dashboard`: PASS, build de producción y prueba HTTP con handlers reales. Auth/PostgREST usan un transporte local simulado; el laboratorio está deshabilitado y sus mecanismos no están en los artefactos del producto.
- `git diff --check`: PASS.
- Revisión visual a 1920, 1366 y 390 px; textos, selector, directorios, contexto y retorno. Capturas locales separadas de la validación de autorización.
- La prueba adicional de Salud falla también en el worktree de la base anterior con condiciones equivalentes. Fallo heredado documentado, sin debilitar su aserción.

## Publicación y límites

Requiere comprobar el catálogo efectivo, reconciliar identidades activas no vinculadas, drenar escritores antiguos, aplicar `supabase/sql/add_organizations.sql` y publicar todos los consumidores nuevos antes de incorporar hoteles. El mapa de clientes/UUID/administradores permanece privado y pendiente de aprobación. No volver al consumidor antiguo después de incorporar: ignora membresías y puede interpretar incorrectamente las nuevas concesiones.

Procedimiento, evidencia y recuperación: [organization-publication-readiness.md](organization-publication-readiness.md). Modelo y recorrido: [organization-hotel-access.md](organization-hotel-access.md).

`SEND_AUTOMATIONS=false`; proveedores simulados en pruebas. No se incluyen inventarios, respaldos, clientes sintéticos ni cargas reales. Catálogo remoto, sesiones Auth reales y Realtime posteriores al despliegue quedan por comprobar. Esta es únicamente la descripción preparada; no se ha creado ni publicado una PR en esta fase.
