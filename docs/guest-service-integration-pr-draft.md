# Borrador local — solicitudes de huéspedes con hechos persistidos y recuperación atómica

Los seguimientos podían perder cantidades o el aviso original tras fallar un guardado; un acuse podía confundirse con progreso, entrega o cancelación. La rama conserva el último turno, hechos del hotel y recibos releídos, y recupera fuente + seguimientos dentro de una sola transacción. D11 conserva la fuga original y su prioridad justificada sin duplicar el ticket.

Principal y Concierge comparten los controles; Inbox mantiene borradores sin efectos. Se evita que una consulta informativa sobre la reserva llegue al escritor comercial. Se corrigen dos regresiones de integración: próxima estancia confundida con otra solicitud y “ruido” dentro de “obstruido”. Se conservan control humano, aislamiento, decisiones de personal y reglas del ciclo de vida.

Dependencia antes del consumidor: `supabase/sql/recover_failed_operational_request.sql`, SHA-256 LF `36a73e3c8759c7c51ccdf2bec9e39c02753a3452bcf734e203c6cfca9c5faa47`. Wrapper aditivo service_role, invoker, sin migración de filas. Requiere contrato de recibos y guardia de ticket exacto existentes. Sin la función, recuperación no confirmada y sin fallback parcial.

Validación local: matriz de cuatro combinaciones; 22 grupos SQL de recuperación/compatibilidad, 16 de operación y 10 de atención; siete conjuntos históricos con SQL real y SDK doble; controles críticos, build y diff. HTTP Security conserva un fallo CRLF de Windows y pasa en LF como CI. Guest AI tenant static permanece FAIL reproducido en main, fuera del job crítico. CI remoto completo y catálogo real aún pendientes: no equiparar pruebas nativas locales a un job GitHub aprobado.

Despliegue: preflight autorizado → SQL exacto → verificar permisos/PostgREST → controlar procesamiento en vuelo y convivencia de versiones → backend → Dashboard → verificar todas las réplicas y lectura pública. Conservar datos e identidades ante incertidumbre; volver al consumidor antiguo no mantiene D11 corregido. Procedimiento completo: `docs/guest-service-integration-review.md`.

Naturalidad real y revisión humana pendientes. Cero llamadas nuevas de proveedor en esta revisión. No se implementan cancelación efectiva ni múltiples solicitudes automáticas; los contratos comerciales/experiencias siguen siendo independientes. No hay UI, organizaciones, Ubikos, demo, flags, credenciales ni inventarios privados en este alcance.

Este archivo es un borrador local. No se ha abierto PR ni solicitado publicación automática. Cualquier publicación futura exige autorización, CI del SHA final y revisión de las condiciones anteriores.
