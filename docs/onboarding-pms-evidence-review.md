# Punto 6 de Daniel: PMS accionable y evidencia compartida

Base: `b1e58b9e1ae311e00f93a15d8bea0287915788cc`, `origin/main` actualizado el 29/09/2026. Rama `codex/onboarding-pms-evidence`. Informes locales anteriores `6ffc30c` y `debbd23`, organizaciones y demás trabajos preservados. Sin migración, cambios de flags o nuevas integraciones.

## Defecto que seguía vigente

El Wizard publicado ya no montaba `StepPmsConnection`: mostraba el resumen piloto y el enlace general corregido por navegación. El antiguo Step conservaba tarjetas decorativas y una regla propia que equiparaba credenciales con conexión. Conexiones sí tenía handlers reales, pero mezclaba configuración, `sync_status` y sincronización, mostraba capacidades no implementadas para proveedores manuales y no trataba de forma completa errores/fechas/respuestas antiguas.

El bloque PMS del Wizard monta ahora el mismo `PmsConnectionsClient`, `PmsProviderCard` y formulario que Ajustes. Una sola consulta GET y una sola presentación de evidencia. Guardar/comprobar/sincronizar recarga datos persistidos y, en el Wizard, vuelve a consultar preparación sin mover el paso ni completar requisitos por el clic. Se conserva el enlace a la pantalla y el retorno al asistente.

## Capacidades y fuentes existentes

| Proveedor | Acciones reales desde estas pantallas | Evidencia y límites |
| --- | --- | --- |
| Apaleo | Guardar/gestionar/deshabilitar configuración; probar lectura; sincronizar reservas, con permisos y credenciales guardadas | `testPmsConnection` autentica y lee una reserva; `syncHotelReservations` importa mediante el recorrido existente. El catálogo anuncia capacidad, no conexión del hotel. No se deduce sandbox/producción por el nombre del hotel o la URL. |
| Pluriel | Guardar/gestionar configuración manual y registrar solicitud | Prueba/sync del endpoint actual solo devuelven activación pendiente; se omiten como acciones de proveedor. Intervención de Staynex y proveedor explícita. |
| Ubikos | Igual: preparación manual únicamente | No se conecta Ubikos ni se requieren claves para esta entrega. |
| Mews | Preparación manual | Adaptador preparado, no prueba/sync real en este recorrido. |
| Cloudbeds | Preparación manual | Igual. |
| Opera Cloud | Preparación manual | Igual. |
| Protel | Preparación manual | Igual. |
| RoomRaccoon | Preparación manual | Igual. |

Fuente: GET `/api/pms-connections`, DTO saneado de `hotel_pms_connections`, catálogo `pms-providers.js`; acciones POST existentes y proxy interno autorizado. `shared/pms/safe-connection.js` sigue protegiendo secretos. La URL del webhook existente permanece disponible como campo de solo lectura seleccionable.

Se distinguen configuración guardada, fecha de recepción, prueba y sincronización. La API actual de Apaleo no persiste una fecha/resultado independiente de prueba; `sync_status=connected` se identifica como registro anterior sin fecha y NO acredita conectividad actual. El resultado de un clic explícito se muestra como respuesta recibida en esta sesión, no historial persistido. Los proveedores manuales pueden tener `metadata.last_test_at/last_test_result=activation_required`, que se presenta como dependencia, no éxito. `last_sync_at` conserva su significado de registro previo; en un fallo no se atribuye esa fecha al intento fallido. No se añaden plazos de vigencia ni se alteran reglas live.

Error de GET sin datos: estado desconocido, sin fallback positivo. Con datos anteriores: aviso de actualización fallida, fecha visible y acciones bloqueadas. Configuración etiquetada como simulación se diferencia de sandbox declarado y API real con tipo de cuenta no acreditado. No se infiere una prueba real de una simulación.

## Autorización, aislamiento y accesibilidad

Permisos reales siguen en servidor (`canAccess`, contexto de hotel y plataforma, soporte solo lectura). Se reutiliza `assertHotelOperationsAvailable` antes de las cuatro mutaciones de Dashboard y `hotelOperationsHeld` para explicar/bloquear acciones; no se cambia el contrato lifecycle ni sus flags. Backend ya conserva la guarda de operaciones para prueba/sync. Recepción no gana acceso, y el hotel archivado no se restaura.

GET/refresh no prueba proveedores ni escribe PMS. Peticiones y errores quedan vinculados a hotel, revisión de archivo y generación; desmontaje/cambio invalida el resultado, formulario y permisos previos. Cabeceras de acciones fijan el hotel iniciador. Respuestas incompletas o de otro ámbito no anuncian éxito. El diálogo mantiene datos tras fallo, foco confinado, Escape y retorno al iniciador; scroll interior en móvil, nombres accesibles y textos mediante traducciones existentes.

## Pruebas y límites

- Nueva `test:onboarding-pms-evidence` en `ci:critical`: diez grupos de comportamiento con componentes/handlers reales, base en memoria y proveedores sustituidos. Sin escrituras ni llamadas a producción. Configuración, falta de evidencia, historiales, error inicial/refresco, éxito/fallo/timeout, sync, permisos/soporte/hold, aislamiento, payload tardío, guardar/reintentar y actualización de preparación.
- Se adapta el montaje de la regresión de navegación al nuevo import y presentación; conserva y refuerza configuración distinta de verificación, permiso/disabled y destinos. No se eliminan controles.
- Build de Dashboard PASS. Laboratorio Next en producción con CSS/componentes reales, sesión sintética y red externa bloqueada: 1366/390, sin overflow horizontal, formulario, Tab/Mayús+Tab, Escape, guardar y retorno entre pantallas comprobados. No acredita autenticación remota ni conexión a una API sandbox.
- `ci:critical` local ejecuta suites hasta HTTP Security y falla en su aserción literal LF sobre `demo.js` CRLF, condición heredada documentada. No se presenta el comando completo local como PASS; GitHub comprobará el checkout LF.
- Suite adicional `test-platform-management-academy-pms`: PASS. `test-pms-secrets-isolation`: fallo CRLF en el límite del bloque de Platform; con lectura normalizada LF llega al fallo estático heredado de `executive-dashboard` (busca serialización inline trasladada al cargador). Reproducido idéntico sobre extracción privada de `origin/main`, línea 691. No se cambió la expectativa. La nueva prueba ejercita DTO/guardado reales y ausencia de secretos en respuesta; no sustituye ni declara aprobada la suite heredada.

## Publicación prevista

Push y PR, tres jobs CI para SHA final y logs de la suite nueva, merge normal sin revisiones bloqueantes, CI de main, SHA Vercel Production/Railway y salud. No SQL. Verificación pública solo de lectura/navegación; no guardar PMS, probar ni sincronizar hoteles existentes. Usar Siguiente/Anterior para recorrer el Wizard: los botones de bloque existentes guardan `current_step`, por lo que no se utilizarán en el ensayo público de solo lectura. Verificar inventarios de conservación y estado archivado del técnico.

Solo tras esa evidencia: «Punto 6 — tarjetas PMS del onboarding: acciones y estados corregidos, publicados y verificados en producción mediante lectura y navegación. Configuración, prueba y sincronización diferenciadas. Las operaciones de proveedor se han ensayado solo con simulaciones; no se acredita ninguna conexión nueva». Persistencia independiente del historial de pruebas y activación de conectores externos permanecen fuera de esta corrección.
