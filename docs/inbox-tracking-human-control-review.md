# Inbox: seguimiento y control humano

Base comprobada el 27-09-2026: `origin/main` `406acfd390156f6ed40b218218bc4eafabc25203`. Rama `codex/inbox-tracking-human-control`. Alcance: lectura/presentación de seguimiento y coherencia del control de Inbox; sin SQL, migraciones, reparación de datos ni cambios de flags.

## Diagnóstico acreditado

En Inbox público autenticado, Hotel Demo Checkin/Hugo: al abrir, el encabezado y los mensajes mostraban «Seguimiento no disponible»; al terminar la lectura aparecía el estado almacenado «Pendiente». No se observó un fallo persistente ni denegación del endpoint en ese recorrido. No se atribuye automáticamente esa causa a todas las incidencias históricas.

`MessageAttentionControls.js` utilizaba `snapshot=null` tanto para la primera carga como para un fallo. POST `/api/inbox/attention` con `action=read` llama a `handleAttentionRequest` y a `staynex_attention_read_v1`: el SQL versionado solo consulta el ámbito explícito, no crea seguimiento. El contrato diferencia `untracked`, `pending` y `resolved`. La tabla no permite SELECT directo por diseño; el inventario privado usa exclusivamente esa RPC de lectura. No se ampliaron permisos.

Otros defectos reproducidos con dependencias sintéticas: respuesta incompleta sin validación completa en el navegador, error sin distinguir permiso/timeout, recomendaciones antiguas que ignoraban el estado de control actual y lectura de `conversation_ai_state` que devolvía un mapa vacío tanto ante ausencia legítima como ante error. Una recarga iniciada antes de cambiar el control podía reemplazar el resultado posterior.

## Corrección

- Lector acotado por hotel, conversación, mensajes y sesión: carga explícita, validación completa del contrato, timeout, error visible y reintento. Las respuestas y errores anteriores se descartan por secuencia/cancelación. No se conservan estados anteriores durante una lectura nueva, evitando presentarlos como actuales.
- HTTP 401: sesión; 403: permiso; contrato incompleto: incompatibilidad; red/servicio y timeout: reintento. Históricos sin seguimiento se identifican como tales. Una conversación vacía no se declara resuelta ni provoca escrituras.
- La consulta de control distingue ausencia legítima de error/incompatibilidad. La ausencia bajo consulta válida conserva el default existente `ai_active`; esto no activa el flag del hotel, proveedores ni envíos. El error produce `unknown`.
- Control humano confirmado: «Revisar y responder manualmente», pausa explícita y borrador no enviado. Soporte: revisión por equipo autorizado y acciones de escritura deshabilitadas según capacidades calculadas en servidor con permisos existentes. Control inactivo: recomendaciones existentes, conservando los flags independientes. Desconocido: no acredita activación/pausa y exige actualización; no clasifica esas filas como «sin control humano» ni anuncia cero como recuento confirmado.
- Una alerta urgente almacenada sigue visible aunque exista control humano; no se rebaja por una recomendación genérica. Lectura, atención, control, borrador y envío mantienen contratos separados.
- La respuesta de takeover acredita hotel, conversación y estado guardado. Una mutación invalida lecturas anteriores; cambio de hotel/sesión descarta contexto. Recomendaciones, copia de borrador y reintentos de lectura no modifican el control.
- Traducciones ES/EN mediante el diccionario existente. El idioma de recepción no transforma el texto del huésped ni el borrador; no se llama al traductor para verificarlo.

## Pruebas

`test:inbox-tracking-control` incorporado a Critical CI junto a `test:message-attention`. Ejecuta el lector real con respuestas diferidas y timeout; handler de seguimiento con roles; consulta real de control con error/ausencia/ámbito incompatible; render del panel real ES/EN activo/inactivo/desconocido y urgencia; takeover/resume real con recepción/admin, soporte denegado y hotel ajeno; handlers reales del cliente contra lectura anterior, mutación incompleta y sesión/hotel cambiados. Proveedores y red externa bloqueados en CI.

Reutilizados `test:inbox`, `test:message-attention` (20 escenarios de contrato), `test:guest-final-output` (92 reproducciones + 36 borradores), `test:manual-send`, `test:pilot-human-safety` y `test:auth-hotel-context`. Las dependencias nuevas se inyectan en los harnesses existentes; se conserva cada aserción y se añade rechazo de envío cuando no existe permiso. PostgreSQL de CI conserva las suites existentes; no se modificó SQL ni se afirma haber cambiado su contrato.

Laboratorio privado: componentes de producción, endpoints de atención y takeover reales con contexto/persistencia sintéticos. Toma/liberación, recarga, conversaciones distintas, históricos, error/reintento/recuperación, estado desconocido y soporte de solo lectura. ES/EN, escritorio 1366 y móvil 390; teclado para abrir/cerrar/reintentar. Sin proveedores. No es autenticación remota ni evidencia de mutaciones públicas.

El fallo adicional heredado `test:guest-ai-tenant-isolation` continúa en el assert estático `withHotel(supabase.from('ai_logs'))`, ya acreditado en la base anterior. No se debilita ni se presenta como PASS. El assert estático de `http-security` sensible a CRLF en Windows se mantiene separado de la ejecución Linux de CI.

Build de Dashboard y `git diff --check`: PASS. Las regresiones nuevas, Inbox, seguimiento, salida final, permisos y seguridad humana pasan localmente. La ejecución completa del job se verificará además en GitHub para el SHA publicado.

## Conservación y publicación

Inventario privado previo por lectura: 42 mensajes, 15 conversaciones con mensajes y 5 vacías; once tablas y snapshots de atención de las veinte conversaciones. Las seis respuestas de presentación permanecen incluidas en la comparación completa. Inventarios, laboratorio y capturas quedan fuera de Git.

Publicación autorizada por PR y merge normal tras checks y revisión. Sin migración. Verificar SHA en Vercel/Railway, salud del backend, `SEND_AUTOMATIONS=false`, Guest Memory OFF, igualdad del inventario y vistas públicas con los estados ya existentes. No tomar/liberar control ni enviar en producción. Identificadores, resultados finales y límites públicos se añadirán tras su comprobación.
