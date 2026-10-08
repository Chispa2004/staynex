# Ampliación aditiva de la demo y seguimiento de solicitudes

Base: `644f0cc44a5090a243c47cfec0e8c5afcc04d704`. Rama: `codex/demo-nine-additions`.

La preparación de nueve conversaciones adicionales detectó problemas generales: una petición para una estancia futura podía clasificarse como nueva reserva; faltaban tipos de servicio; las preferencias y observaciones posteriores podían perder su relación con el ticket. La clasificación compartida ahora identifica esos servicios, conserva el ticket exacto al aclarar y permite elevar su prioridad por daños sin rebajar una prioridad anterior. Las preguntas de habitación respetan las fases pre/postestancia. Los acuses solo reciben hechos del registro releído y conversación, sin políticas ajenas al acto de confirmar su recepción. Los proveedores siguen sin poder acreditar por sí mismos un trabajo, aviso, reserva o reembolso.

La recarga directa pública de Inbox reprodujo un bloqueo: la llegada del contexto del hotel invalidaba la primera lectura sin iniciar otra. El manejador vuelve a cargar el hotel seleccionado manteniendo los controles de respuesta obsoleta. No cambia autorización ni distribución.

Se amplía la lista de identidades sintéticas reservadas exclusivamente para denegar tráfico externo. No concede permisos, activa conectores, añade migraciones ni programa tareas. Las nueve conversaciones previas e históricos se conservan; inventarios, respaldo, payloads, salidas reales y preparación de datos permanecen fuera de Git.

## Verificación local

- Inbox: diez pruebas de navegador PASS, incluida inicialización de hotel durante una lectura retrasada, recarga directa, 1366/390 y ambos temas.
- PostgreSQL desechable: dieciséis grupos PASS; incluye cinco reformulaciones de nuevas solicitudes, aclaraciones, prioridad, aislamiento, concurrencia, reintento, control humano y reversión de fallos.
- Regresiones de acuses PASS, conservando los 193 resultados reales anteriores y los rechazos de promesas, idioma incorrecto y preguntas repetidas.
- Build de Dashboard PASS. Comprobaciones críticas PASS salvo HTTP Security en checkout CRLF; la misma prueba sin cambios de expectativas pasa al leer `dashboard/lib/demo.js` con LF. Su contenido Git no cambia. CI Linux debe acreditar esa prueba para el SHA final.
- Se conservan todas las salidas reales, también las desfavorables. Una evaluación adicional en inglés respondió en español; el filtro de idioma la rechaza. No se afirma perfección del modelo ni garantía general de interpretación semántica.

## Publicación y preparación de datos

Publicar código y esperar CI/despliegues antes de incorporar los nuevos registros. Comprobar destino y flags, crear identidades ficticias y conversaciones inicialmente cerradas, guardar cada mensaje entrante, ejecutar el grabador real y releer tickets antes de generar sus acuses. Procesar los turnos secuencialmente; el primero no recibe el seguimiento. Abrir las conversaciones únicamente completas. Activar el control humano de la nueva conversación que lo solicita mediante el mecanismo existente; cualquier borrador posterior queda sin enviar.

No sobrescribir filas antiguas. Ante interrupción, reanudar con los mismos identificadores y recibos; una discrepancia detiene la operación. La recuperación consiste en ocultar únicamente las nuevas conversaciones, sin borrar históricos ni reencolar envíos. Comparar inventario completo y huellas de otros ámbitos al terminar.

La comprobación pública y el inventario final se documentarán tras el despliegue. El enlace de reseña de Knowledge es ficticio y se presenta como demostración, sin plataforma externa operativa. Guest Memory permanece OFF y `SEND_AUTOMATIONS=false`.

## Hallazgo en la generación posterior a PR #47

PR #47 integrada en `206869cb18f9a36db47c0c9c47966ba9f16322a4`; CI de la PR aprobado y ambos despliegues activos. La segunda generación, aún en conversaciones cerradas, afirmó «la habitación no estará lista hasta el check-in». El horario no demuestra disponibilidad ni indisponibilidad de esa habitación. Se añade una guarda general de equipaje/llegada anticipada, limitada a políticas explícitas del hotel, que distingue consigna y acceso a habitación; también se reutiliza en el borrador de lectura. Regresiones con otro horario, otro hotel, falta de política y formulación en inglés. No se modifica la respuesta manualmente ni se regenera hasta obtener una preferida: se conserva el original y se aplica la guarda del producto. Se corrige además la mayúscula después de separar una cláusula operativa insegura.

El ensayo final detectó que el filtro de preguntas también eliminaba una frase declarativa que rechazaba pedir datos de tarjeta, por contener «facilitar». El detector distingue ahora preguntas e imperativos iniciales de esa declaración. La regresión conserva el acuse completo y el resto de controles.
