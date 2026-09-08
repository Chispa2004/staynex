# Message Attention — Recepción desacoplada (2026-09-08)

## Cambio autorizado y alcance

Base codex/reception-message-dashboard, HEAD 7fb48d7babbb842b867723149d462ac13218f685. El trigger anterior fue inseguro: fallo de auditoría → rollback del mensaje → claim failed sin message_id → retry consumido. No llegó a producción. Se retiró del SQL preparado y se sustituyó por marca persistida en messages. No se añade recuperación de webhooks ni se modifica el contrato at-most-once.

Columna nullable smallint attention_inclusion_version, añadida sin default (histórico NULL); después DEFAULT 1 y CHECK = 1. Guardar un mensaje no consulta ni escribe message_attention/auditoría. No hay trigger del módulo, ni EXCEPTION WHEN OTHERS para ocultar fallos. Todo formato publicado de createMessage conserva su comportamiento y obtiene la marca mediante el DEFAULT.

Un mensaje elegible marcado sin transición es pendiente inicial versión 1; una transición explícita prevalece. Sin marca ni transición es histórico versión 0. Un fallo de lectura es no disponible. Resolver desde pendiente inicial inserta versión 2 con actor/fecha del servidor y auditoría en la misma transacción. La incorporación de un histórico parte de 0 a 1 y mantiene su marca NULL.

## PostgreSQL real e independencia del inbound

Docker local explícito npipe:////./pipe/dockerDesktopLinuxEngine, Server 29.7.2. Imagen oficial preexistente postgres:17.10-alpine3.24, digest sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193. Sin descarga. Contenedor exclusivo staynex-attention-decoupled-20260908, etiqueta staynex.disposable=attention-decoupled-20260908, network none, sin puertos, PGDATA tmpfs. Bases nuevas por ejecución; ningún recurso de otros proyectos.

Se ejecutaron los cuatro SQL exactos con ON_ERROR_STOP en PostgreSQL 17.10, sobre schema/migraciones del repositorio. Dependencias y representación de roles/publicación: mismas que en el informe histórico. La API se prueba con contexto autenticado controlado y RPCs en PostgreSQL real. Transporte cliente→psql adaptado, sin reimplementar las funciones SQL. No se simulan como reales PostgREST, GoTrue, JWT ni proveedores.

| Fallo inyectado | Recepción productiva con SQL real | Resolver durante fallo | Reparación y retry |
| --- | --- | --- | --- |
| Escritura enterprise_audit_logs | Mensaje conservado, marca 1, claim processed con message_id | API 503, sin transición ni auditoría parcial | API 200, sin volver a ejecutar inbound |
| Escritura message_attention | Mensaje conservado, marca 1, claim processed con message_id | API 503, sin cierre parcial | API 200, sin volver a ejecutar inbound |
| Lectura del seguimiento | Mensaje sigue accesible mediante consulta backend por hotel; nuevas entradas se guardan | Atención 503, indicadores no disponibles | Restaurada la lectura, pendiente inicial visible |

Las dos pruebas principales usan createIncomingWhatsAppHandler, createMessage y los servicios reales de claims. Resolución de hotel/contexto y procesamiento/proveedores están controlados. Cada SID produjo exactamente una preparación y una llamada al procesamiento controlado; duplicados antes y después de resolver no repiten esos efectos, no crean otro mensaje y retornan duplicate con ACK 200. Llamadas a proveedores reales: cero. La marca falsa aportada como campo del webhook no sustituye el DEFAULT.

## Garantías repetidas

- Primera resolución concurrente sin fila previa: el bloqueo de messages existe y se observa una segunda sesión esperando Lock. Primera transacción válida; segunda obsoleta 40001.
- Resolver/reabrir concurrentemente, lotes solapados en orden inverso, retry idéntico, retry antiguo tras reapertura y operación con payload distinto: sin sobrescritura o cierre parcial, sin duplicación de auditoría ni cambio de fecha en retry.
- Nuevos mensajes durante un cierre quedan pendientes fuera del lote. Duplicados/updates no reinician una resolución ni reclasifican el histórico.
- Fallos de auditoría y constraints de atención revierten solo la transición. Mensaje y marca permanecen. No se debilitan constraints hoteleros.
- Histórico sin backfill; importaciones nuevas con created_at antiguo quedan incluidas. UPDATE del histórico conserva NULL. Incorporación manual auditada sin alterar la marca.
- RLS, grants, helpers privados, RPC backend-only, actor/hotel verificados. Support/anon/roles no gestores/IDs de otro hotel/campos falsificados rechazados.
- Agregaciones de pendientes iniciales y explícitos, paginación de ocho, urgencia común KPI/lista y origen separado. Mensajes, tickets, hoteles, conversaciones y estado IA quedan iguales al resolver.
- Instalación, objetos incompatibles y reaplicación; verificación comprueba ausencia de trigger y de función on_insert.
- Desactivar elimina DEFAULT, preserva marcas/estados/auditoría y bloquea las tres RPCs. Nuevos mensajes con NULL permanecen sin seguimiento al reactivar; solo futuras inserciones obtienen 1.

## Reproducibilidad y archivos de evidencia

Ejecutor: scripts/test-message-attention-postgres.cjs all, contra el contenedor exclusivo descrito. Crea una base nueva por ejecución y verifica etiqueta/red/mounts antes de operar. Antes de importar código productivo elimina variables heredadas, bloquea .env y conexiones externas; Guest Memory OFF, SEND_AUTOMATIONS=false. No aplica SQL fuera del contenedor.

Evidencia: .npm-cache/message-attention-decoupled/results.json, sql-hashes.json, resource.json, logs SQL por sesión y inbound-independent-{enterprise_audit_logs,message_attention}.json. El primer intento detectó únicamente que el ejecutor debía representar explícitamente NULL de psql; se corrigió la serialización y se repitió la suite íntegra.

No hubo cambios de diseño, tipografía, hamburguesa o componentes UI. La ocultación previa de UUIDs permanece intacta. El fixture de prueba se adapta al nuevo estado efectivo; no se introduce en runtime productivo.

## Límites y despliegue propuesto

Esta corrección elimina la dependencia de escrituras/lecturas auxiliares de atención. No recupera fallos generales de INSERT messages, caída completa de DB/red, fallos previos del pipeline ni claims failed por otras causas. No hay reprocesado indiscriminado y no se certifican Supabase ni piloto/producción.

Orden propuesto para otro pase autorizado: verificar versión/schema real → preflight de solo lectura → migración nueva (marca futura, sin trigger) → verify y pruebas autorizadas de recepción → publicación del código. La versión anterior no se considera instalada: cualquier objeto previo del módulo provoca rechazo, no una actualización silenciosa.

Recuperación del módulo: ejecutar disable_message_attention.sql conservando evidencia; revisar causa; restablecer DEFAULT 1 y ejecutar verify. Ningún backfill al desactivar/reactivar. El contenedor se retira al terminar; la imagen preexistente permanece.

## Resultado final y limpieza

29 escenarios PostgreSQL: PASS, incluidos los fallos principales de auditoría, atención y lectura, primera transición sin fila y reactivación. PASS en las diez suites solicitadas, check:syntax, sintaxis del ejecutor PostgreSQL, dashboard:build y git diff --check. El build y los tests usan copia aislada sin .env. Las huellas SQL del paquete final coinciden con las ejecutadas.

Retirado exclusivamente el contenedor 6dc70651853f0597cf81d2a00cb8fc8c022bd823cd8ed1d6204826336b5ee5c0 tras validar ID/etiqueta. Cero contenedores restantes de este pase; tmpfs y bases desechables retiradas. Recibo cleanup.json. Imagen y recursos preexistentes conservados.

Veredicto local: DEPENDENCIA BLOQUEANTE ELIMINADA Y VALIDADA LOCALMENTE. Producción SIN CAMBIOS. Commit/push/merge/deploy NO REALIZADOS.
