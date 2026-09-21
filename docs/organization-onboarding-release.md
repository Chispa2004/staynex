# Alta de organizaciones y hoteles: publicación preparada

## Recorrido de interfaz

Staynex abre `/platform/organizations`, crea una cadena o independiente y selecciona el cliente. «Crear hotel» reutiliza `CreateHotelForm` de Platform: organización elegida, ubicación validada y correo de dirección. No se escriben UUID ni JSON. `/api/platform/hotels` y el alias `/api/workspaces` comprueban Auth y rol interno; la RPC `staynex_create_organization_hotel` vuelve a autorizar al actor y crea hotel, onboarding, dirección, concesiones de cadena y auditoría en una transacción. Solo admite organización activa. Independiente admite un hotel. No cambia proveedores; fuerza `hotel_live_mode=false`, `ai_auto_reply_enabled=false`, WhatsApp vacío y metadata vacía, ignorando valores de activación enviados por el cliente.

«Administradores y membresías» muestra las cuentas existentes con rol y estado. Permite incorporar una cuenta Auth verificada por correo o dejar una invitación pendiente; también modificar y revocar. El administrador de cadena recibe filas de concesión explícitas para los hoteles actuales y futuros. Las filas hotelarias independientes se conservan. El selector para incorporar hoteles existentes muestra nombre/ciudad y solo hoteles sin organización; es opcional, no un paso de publicación.

«Gestionar equipo» abre la pantalla hotelaria existente con contexto seleccionado y autorización de servidor. Puede usarla Staynex, el administrador de cadena y dirección (`admin`) del hotel autorizado. Solo concede `admin` o `receptionist`, nunca roles internos; las filas internas y derivadas están protegidas. `staynex_invite_hotel_user` valida otra vez actor, hotel y rol, identifica la cuenta mediante Auth verificado y crea una membresía ordinaria cuando corresponde. Una membresía revocada o una asignación ya existente no se reactivan mediante un alta repetida. PATCH tampoco permite activar invitaciones sin identidad vinculada.

La pantalla de equipo puede abrirse antes de finalizar el onboarding de PMS, sin marcarlo como completado. El resto de su comportamiento se conserva.

### Límite del mecanismo de invitación existente

Guarda invitaciones por correo y las acepta cuando se inicia sesión con una identidad Auth verificada. **No envía correos, no crea credenciales y no registra cuentas en Supabase Auth.** La interfaz lo indica expresamente. Una persona sin cuenta Auth necesita disponer de una cuenta verificada mediante el aprovisionamiento de identidad actual; esta entrega no añade un servicio de correo/registro. El laboratorio simula esa identidad, no acredita correo entregado ni autenticación remota.

## Conservación técnica

No hace falta agrupar comercialmente los hoteles existentes ni crear organizaciones ficticias para publicar. `organization_id` sigue siendo nullable para esos hoteles y sus asignaciones independientes válidas continúan funcionando. La migración no reasigna, borra, fusiona ni promociona hoteles o usuarios. Conserva invitaciones pendientes, filas deshabilitadas, UUID y roles. Los índices se separan por origen para permitir concesiones derivadas sin reemplazar las asignaciones originales.

La compatibilidad solo aplica a un hotel sin organización y una asignación independiente activa vinculada. Si existe organización, se exige membresía activa y organización activa: ni el correo, ni un token anterior, ni un rol en otro hotel evitan una denegación nueva. El catálogo READ ONLY ya comprobado tiene cero asignaciones activas sin identidad y cero colisiones normalizadas; no se necesita un backfill de los diez hoteles para esta publicación. Repetir ese preflight en la ventana definitiva para detectar cambios posteriores.

## Validación y límites

- `ci:critical`: autorización/contexto/aislamiento y diagnóstico de destino.
- `ci:postgres`: 26 escenarios de organizaciones (22 anteriores más 4 de altas y equipo), junto con Knowledge y las 19 regresiones de exclusión de despacho. Incluye rollback de alta independiente, actor interno, flags de hotel apagados, cuenta existente, invitación pendiente, roles ajenos, revocación y conservación de estados antiguos.
- `ci:dashboard`: build y HTTP con handlers reales, sin adaptadores del laboratorio en los artefactos. Comprueba ambos endpoints de alta, ámbito obligatorio, identidad del actor, rechazo de activar una invitación sin identidad y diagnóstico sin secretos.
- Ensayo UI separado: `node scripts/local/organization-onboarding.cjs`, loopback 3342, copia de fuentes reales y PostgreSQL 17.10 desechable con red `none` y disco temporal. Solo se adapta la sesión del navegador y el transporte Auth/PostgREST local. RPC, triggers, persistencia y handlers reales. No reproduce el servicio PostgREST remoto completo ni Realtime. Los fixtures no se empaquetan con el producto.
- El fallo adicional heredado de Salud sigue documentado en `organization-publication-readiness.md`; no se debilita ni se presenta como PASS.

El preflight acotado adicional comprobó `hotel_onboarding_state` remoto: `completed_steps` jsonb, defaults compatibles, FK a hoteles y ausencia de triggers de usuario. No se ejecutó DDL/DML. Evidencias privadas en `.npm-cache/organization-onboarding/evidence/`; nunca incluirlas con inventarios o credenciales en Git.

## Orden de la siguiente fase (requiere autorización de activación)

1. Confirmar SHA aprobado, CI y proyecto efectivo mediante GET `/api/deployment-target`: devuelve únicamente `projectRef` extraído de `SUPABASE_URL` del servidor que atiende la petición. Es dinámico, sin caché, sin Auth/DB ni mutaciones; no usa `NEXT_PUBLIC_SUPABASE_URL` como sustituto. Confirmar separadamente el backend. Capturar respaldos privados y preflight actualizado.
2. Pausar y drenar escritores de identidades y altas, incluidos aceptación de invitaciones al consultar contexto, Dashboard, tareas y réplicas antiguas. Registrar instancias/rutas/solicitudes en curso. Mantener `SEND_AUTOMATIONS=false` y conexiones/flags actuales. No mezclar escritores antiguos con el contrato nuevo.
3. Aplicar **únicamente `supabase/sql/add_organizations.sql` de este SHA**, que incluye las dos RPC de alta/equipo; no hay transformación comercial ni segunda carga. Es una transacción. Comprobar columnas, índices, funciones, RLS, ACL y triggers con el preflight. Comparar hoteles, usuarios, estados y asignaciones con el respaldo: los hoteles antiguos permanecen sin organización y sin cambios de rol/estado/UUID.
4. Publicar Dashboard y backend nuevo con la gestión aún pausada. Verificar SHA de cada réplica, retirar consumidores antiguos y comprobar el identificador del servidor público. Verificar que PostgREST publica las RPC y que solo `service_role` puede ejecutarlas; roles de navegador no pueden crear membresías ni invocar gestión. No ampliar permisos generales para resolver errores.
5. Restablecer únicamente escritores del contrato nuevo. Verificar sesiones autorizadas existentes: hotel legado, invitación pendiente y acceso deshabilitado, Dashboard/Inbox, directorio, cambio de hotel e identidad interna auditada. No usar mensajes reales como pruebas ni activar envíos. Los nuevos clientes se dan de alta desde la interfaz bajo su autorización correspondiente.
6. La agrupación de hoteles existentes queda opcional y separada. Solo incorporar si posteriormente se confirma pertenencia y se autoriza; no es una dependencia del rollout técnico.

### Recuperación

Si falla SQL, comprobar rollback íntegro antes de publicar. Con esquema aplicado, mantener pausadas las escrituras incompatibles y corregir hacia delante. No volver automáticamente al código anterior: tras crear organizaciones/concesiones ese código ignora membresías y revocaciones, y los índices cambiaron. No borrar filas para restaurar índices antiguos ni reactivar accesos. Preservar auditoría, invitaciones, estados deshabilitados y respaldo privado. Cualquier retorno excepcional requiere demostrar compatibilidad antes de restablecer consumidores.
