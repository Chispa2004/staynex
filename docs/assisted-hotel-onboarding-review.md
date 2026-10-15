# Alta asistida y contrato PMS — revisión local

Base: f627f8b441b1107c229a0daf7a5cb3ce95fd3d27. Rama codex/assisted-hotel-onboarding.
Implementación en curso, exclusivamente local. No acredita conexión PMS real ni preparación live.

## Incorporación

Se conserva create_hotel_onboarding_v1. Una invitación de aplicación se une a Supabase Auth:
el token aleatorio de 256 bits viaja en fragmento, se retira de la barra y se conserva solo
en sessionStorage durante la incorporación. La base guarda SHA-256, no el secreto. El
administrador puede copiarlo solo mientras permanezca en memoria; recuperar implica
reemplazar y revocar el anterior. No se envían correos.

No se eligió la invitación nativa como concesión hotelaria: la concesión requiere aceptación
explícita, revocación propia y recuperación independiente de abrir el enlace Auth.
Se reutilizan signUp/signInWithPassword, nunca contraseñas propias.
Fuentes: [registro Auth](https://supabase.com/docs/reference/javascript/auth-signup),
[contraseñas y verificación](https://supabase.com/docs/guides/auth/passwords).

POST de inspección no consume; POST de aceptación verifica identidad y correo confirmado
en SQL, toma bloqueos hotel→asignación→invitación y concede una sola asignación. El mismo
token devuelve éxito tras pérdida de respuesta únicamente mientras su acceso siga activo.
El enlace no modifica hotel, rol o destinatario. La caducidad de siete días es del enlace,
no una política de conservación de datos. Revocar tras una aceptación no revoca el acceso:
este se deshabilita mediante el control de equipo existente.

Se suprime la aceptación automática por correo en login/contexto. Las filas históricas
pendientes requieren enlace nuevo. Los accesos con identidad existente se conservan.
Las filas legacy active sin identidad ya no conceden acceso por coincidencia de correo:
necesitan revisión y aceptación; no se promocionan ni se backfillean automáticamente.

Prerrequisito local: add_hotel_access_invitations.sql después del alta atómica. Tabla privada
con RLS sin políticas cliente; RPC solo service_role. Administración comprueba también
rol interno activo en SQL. Preparación consulta exclusivamente IDs de asignaciones válidas
del hotel, sin directorio Auth en navegador.

PASS: nueve grupos SQL/API en PostgreSQL desechable sin red, incluidos seis consumidores
concurrentes, revocación concurrente, correo no verificado, hotel retenido, rol manipulado,
caducidad, reemplazo, recuperación y acceso deshabilitado. PASS auth-hotel-context existente.
La primera ejecución sandbox no accedió al pipe Docker; la ejecución autorizada local sí.

Antes de publicar: comprobar catálogo/ACL efectivo y política Auth de confirmación de correo
(debe estar activada; timestamp auto-confirmado no prueba entrega). Configurar redirect /invite
y correo de verificación en Auth, sin token hotelario en el redirect. No registrar cuerpos
de /api/access-invitations ni fragmentos/sessionStorage en analítica. Probar correo real en fase
posterior autorizada. En esta fase Auth/email/PMS se simulan; no se envían mensajes.
