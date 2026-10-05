# Tickets: estados y acciones claros

Base comprobada: origin/main `40da6972bbf84665ca9e8e77f8f34ab64dc98509`, 2026-10-05. Rama `codex/tickets-clear-status-actions`, worktree independiente. Se conservan el cierre local anterior `9a2e444`, el checkout de organizaciones y los inventarios privados.

## Alcance y contrato

Se retira exclusivamente la columna y las recomendaciones de Asistencia IA del listado, incluidas las tarjetas móviles. Permanecen las tres métricas superiores, filtros, paginación, enlaces, clasificación y contexto operativos. La información de IA del detalle no se elimina. Fecha y antigüedad comparten una celda para dedicar espacio al problema, habitación y acciones. La tabla usa el ancho disponible; las tarjetas móviles apilan contenido y permiten ajustar los botones.

| Valor almacenado y transición PATCH existente | Etiqueta | Color |
| --- | --- | --- |
| open | Abierto | Ámbar |
| in_progress | En curso | Azul |
| completed | Hecho | Verde |

El endpoint sigue aceptando exactamente esos tres valores. No se cambia el contrato, completed_at, la auditoría, permisos ni aislamiento por hotel. pending, closed, cancelled y resolved conservan identidades y etiquetas distintas. La presentación compartida se utiliza en listado, filtros, detalle y panel de pendientes; la selección y orden de este último no cambian. ES/EN/FR/DE se mantienen mediante el sistema de traducciones existente.

Los botones muestran icono y texto. El actual tiene borde reforzado y «Estado actual» visible e incluido en su nombre accesible; está deshabilitado. El color identifica el destino, no la mera selección. Las acciones disponibles conservan foco visible y no propagan el clic a la navegación de fila.

## Correcciones de comportamiento necesarias

Antes, el listado solo escribía errores en consola y mantenía un único updatingId. Ahora una referencia por ticket bloquea solicitudes duplicadas inmediatamente y permite identificar guardados independientes. Durante el PATCH se conserva el estado confirmado y se muestra «Guardando estado…». Solo una respuesta correcta con ID, hotel y estado esperados confirma el cambio. Fallos, respuestas incompletas o de otro hotel muestran error y permiten reintentar; 403 explica la falta de permiso. No se realiza escritura optimista.

El detalle reutiliza la misma presentación y guardado. Tras confirmar, el listado refresca métricas sin desmontar sus filas mientras llegan los datos. Un fallo transitorio conserva el contenido válido con error visible; 401/403 o contexto inválido lo retiran. Las solicitudes de otro contexto/identidad no se aceptan. Una respuesta perdida no prueba que el servidor no haya guardado: el texto habla del último estado confirmado, no de una reversión remota.

## Verificación

- Nueve regresiones nuevas de navegador: 1920×1080, 1366×1080, 390×844, claro/oscuro, dimensiones reales y cero desbordamiento de página/tabla; etiquetas y colores computados, estado actual, foco y entrada al detalle con IA conservada. Las tres transiciones, bloqueo durante guardado, error/reintento, permiso denegado, respuesta de otro hotel y estados distintos se ejercitan con transporte sintético.
- Regresión del handler PATCH real: valores almacenados sin cambios, etiquetas de presentación rechazadas como valores, roles y soporte denegados según permisos actuales, contexto de hotel transmitido a la escritura. Transporte desechable en memoria, sin proveedores.
- Regresión existente del cliente de métricas ampliada para refresco conservando datos y retirada ante 403; su adaptador de React ahora ejecuta también actualizaciones funcionales de setState. Se conservan todas las expectativas anteriores.
- El test existente de accesibilidad usa el nuevo nombre «En curso» y conserva la comprobación de activación, error y ausencia de navegación accidental.
- CI incorpora el contrato al job crítico y los nueve casos al montaje de accesibilidad ya existente; no añade otro build del laboratorio. PostgreSQL desechable existente permanece intacto.

No se ejecutan acciones de estado contra producción. Las capturas públicas anteriores muestran los seis tickets existentes sin alterarlos. Los ensayos funcionales usan identidades sintéticas, sesiones de laboratorio y transportes externos bloqueados; no equivalen a autenticación real ni prueba con lector de pantalla.

La novena regresión conserva el bloqueo de una fila mientras termina el guardado de otra. Los nueve casos nuevos pasan localmente. Sintaxis y los ocho grupos existentes de métricas pasan. La suite crítica llega al fallo heredado de HTTP Security: su aserción literal LF no coincide con CRLF en demo.js del checkout Windows. No se modifica la prueba ni ese archivo; se verificará su ejecución en Linux CI.

El build final de producción y diff --check pasan. Las 32 regresiones existentes quedan aprobadas: 31 en la primera ejecución y contraste móvil claro tras corregir el tono de categoría (de 2,56:1 a un tono más oscuro, sin rebajar el umbral 4,5:1). Los nueve casos nuevos se repitieron sobre el build final y pasan.

## Publicación

Sin migraciones, SQL, variables, permisos, proveedores ni nuevas automatizaciones. Guest Memory OFF y SEND_AUTOMATIONS=false se conservan; los tickets de Elena, Carlos y el resto de la demo no se modifican. Las capturas y logs se guardan fuera de Git.

Pendiente de incorporar al cierre: resultados definitivos, PR/SHA, CI de main, versiones de Vercel/Railway y revisión pública exclusivamente de lectura y navegación.
