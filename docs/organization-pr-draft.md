# Título preparado

Alta de organizaciones, hoteles y equipos con acceso explícito por ámbito

# Descripción preparada

Staynex puede crear una cadena o cliente independiente, dar de alta sus hoteles y nombrar al administrador de cadena desde Platform. El alta reutiliza el formulario existente y crea hotel, dirección, onboarding, concesiones y auditoría en una transacción; exige una organización activa. El directorio permite gestionar membresías y elegir hoteles existentes por nombre, sin UUID manuales.

Cadena y dirección acceden a la gestión de equipo hotelaria existente. Una cuenta verificada se incorpora por correo; las demás quedan invitadas mediante el mecanismo actual (sin envío de correo ni creación de credenciales). Solo se conceden roles hotelarios; las filas internas/derivadas están protegidas. El equipo puede configurarse antes de completar el onboarding de proveedores. Altas y cambios conservan conexiones apagadas y no activan envíos.

Se conservan hoteles, identidades, invitaciones y asignaciones deshabilitadas existentes mediante la compatibilidad de hoteles sin organización. **Agrupar comercialmente los hoteles actuales no es un requisito de publicación.** Las denegaciones del modelo nuevo prevalecen sobre asignaciones independientes; no hay backfill, promociones ni carga de clientes reales.

## Validación

- `ci:critical`: autorización, contexto, paginación y diagnóstico de destino sin secretos.
- `ci:postgres`: 26 escenarios de organizaciones (22 previos + 4 de alta/equipo), Knowledge y 19 regresiones de exclusión de despacho.
- `ci:dashboard`: build y pruebas HTTP de los handlers reales, incluyendo ambos endpoints de alta, actor ligado a Auth, ámbito obligatorio y rechazo de activar una invitación sin identidad. Auth/PostgREST locales controlados; sin adaptadores de laboratorio en el producto.
- Ensayo de interfaz aislado con handlers reales y PostgreSQL desechable: cadena con dos hoteles, tercero posterior, independiente, dirección, recepción, invitación, modificación y revocación. Capturas privadas del navegador a 1920/1366/390 px. No se confunde con autenticación remota ni Realtime.
- `git diff --check`. Fallo adicional heredado de Salud conservado y documentado, sin debilitar pruebas.

## Preparación de publicación

`/api/deployment-target` lee en el servidor la misma `SUPABASE_URL` que usa el cliente administrativo y devuelve únicamente el identificador público del proyecto; no consulta Auth ni datos. Permite verificar el destino del Preview sin modificar secretos o datos remotos.

Procedimiento vigente y recuperación: [organization-onboarding-release.md](organization-onboarding-release.md). Evidencia anterior: [organization-publication-readiness.md](organization-publication-readiness.md).

Orden futuro: destino/preflight/respaldo privado → pausa y drenaje de escritores de identidad → `add_organizations.sql` de este SHA → despliegue de todos los consumidores nuevos con escrituras pausadas → ACL/PostgREST/versiones y conservación de accesos → restablecimiento y revisión pública. No volver automáticamente a consumidores que ignoran membresías o revocaciones.

PR abierta, sin merge ni auto-merge. `SEND_AUTOMATIONS=false`. Esta pasada no aplica migraciones ni cambia datos/permisos/configuración remotos; solo publicación de la rama, CI y Preview autorizados. Inventarios, respaldos y capturas permanecen fuera de Git.
