# Archivado: retorno a Platform y legibilidad del diálogo

Base comprobada: `93725734ada6420d4b1138544c0d2d999bf2a722` (PR #28). Rama `codex/hotel-lifecycle-navigation-dialog`. El informe histórico `6ffc30c0f31575356f095ba9faee334d84c4a426` permanece en su rama original; no se arrastran sus commits ni trabajo de organizaciones.

## Causas y corrección

La selección persistida sobrevivía al archivo. El servidor bloqueaba correctamente el contexto operativo, conservando la identidad interna, pero AppShell trataba esa denegación como impedimento para abrir también Platform. El componente de Platform no invalidaba la selección al confirmar la operación. Reproducido ejecutando el AppShell de main con transporte sintético: después del archivo permanecía en `/dashboard/inbox` en vez de retornar a Platform.

La confirmación de archivo elimina ID, metadata y cookie de selección cuando corresponde, deja una marca de selección explícitamente vacía y emite una invalidación compartida entre pestañas. Esa marca no autoriza nada: el servidor devuelve contexto sin hotel y únicamente las opciones del ámbito ya autorizado. AppShell permite la consola administrativa sin contexto operativo solo para los roles internos existentes; los handlers siguen comprobando permisos. Una identidad hotelaria recibe explicación, salida de sesión y, si su permiso actual permite cambiar de hotel, sus opciones autorizadas. No se elige otro hotel por defecto.

Las respuestas de resolución y cambio de workspace anteriores a una invalidación se descartan. La entrada de soporte de los tres directorios comprueba también la revisión antes de persistir. Foco y pageshow revalidan contexto; una indisponibilidad o timeout permanece como error reintentable, no como prueba de archivo. El POST de selección exige contexto autorizado y respuesta con el mismo hotel.

El selector global `.theme-light [class*="bg-black/"]` capturaba `backdrop:bg-black/60` del diálogo y sobrescribía el panel blanco con rgba(15,23,42,0.04). Se cambia únicamente su backdrop a slate y se usan fondos opacos explícitos según el tema. Cancelar conserva foco inicial, Tab queda confinado, Escape cierra sin operar y el retorno de foco usa el iniciador conectado o el encabezado válido de Platform.

## Pruebas locales

- Nueva suite `test:hotel-lifecycle-navigation`, incluida en `ci:critical`: 7 grupos ejecutan helpers y hooks/render de AppShell real con transporte controlado: selección invalidada, respuesta tardía de cambio, archivo y retorno, recarga/enlace anterior, separación Platform/hotel, error de red y pestaña antigua.
- `test:hotel-lifecycle`: 6 grupos, conservando los cinco originales y añadiendo PATCH legítimo con autorización y filtro hotel_id. Los cambios de prueba ocurren solo en memoria.
- `test:auth-hotel-context`: mantiene archivo/identidad y añade selección vacía sin fallback ni exposición de hoteles ajenos.
- `ci:postgres` completo PASS: incluye los 20 grupos lifecycle, aislamiento, concurrencia, restauración idempotente y hold persistente. PostgreSQL 17.10 desechable, sin red/proveedores. No se ejecutó ni modificó SQL remoto.
- `ci:critical` llega al fallo estático heredado de HTTP Security por CRLF en `dashboard/lib/demo.js`. El blob versionado y la prueba no cambian. Los grupos anteriores, incluidos los nuevos, pasan; el comando completo local no se presenta como PASS. GitHub debe comprobar su checkout LF.
- Build del Dashboard y `git diff --check` PASS. El laboratorio se compila con Next en producción y el `globals.css` real; no utiliza la hoja mínima del ensayo anterior. Ocho combinaciones (archivo/restauración × claro/oscuro × 1366/390) sin overflow, fondos rgb(255,255,255) o rgb(15,23,42), Cancelar enfocado. Tab/Shift+Tab, Escape y retorno comprobados en navegador. Evidencias privadas fuera de Git.

## Publicación, control temporal y recuperación

Inspección Vercel: `rule_hotel_lifecycle_transition_pr_28_WCvlSm`, Deny para Request Path starts with `/api/platform/hotels/` AND Method in DELETE,PATCH; no condición de hostname. Afecta archivo, restauración y otros PATCH administrativos. GET/POST no están incluidos. La regla Badar sobre POST monitoring es independiente y se conserva.

No hace falta migración ni cambio de permisos, flags o configuración de proveedores. `add_hotel_lifecycle.sql` ya está aplicado; no repetirlo. Publicar esta rama, comprobar logs CI del SHA final, integrar mediante merge normal, esperar CI de main y acreditar SHA de Vercel Production/Railway y salida de la réplica anterior. Solo después desactivar la regla temporal completa y comprobar que PATCH vuelve a la autorización normal sin modificar hoteles para probarlo. Los despliegues históricos no se promocionan ni se utilizan para pruebas.

Prueba pública autorizada únicamente con el hotel técnico existente: restaurar por UI → seleccionar/entrar → archivar seleccionado → confirmación y retorno → recarga/atrás/pestaña antigua → comprobar estado archivado final. No crear otro hotel ni usar el archivo histórico. Comparar inventarios privados de conservación antes/después, sin publicar filas ni credenciales. Mantener Guest Memory OFF y SEND_AUTOMATIONS=false.

Ante un fallo operativo, detener el ciclo y limitar la contención al recorrido afectado; conservar registro lifecycle/hold y corregir hacia delante. No volver al consumidor anterior a PR #28, no restaurar datos mediante copias antiguas ni reencolar mensajes inciertos. No se declara verificación pública hasta completar el ensayo tras el despliegue. Proveedores de experiencias y cierre global del punto 10 permanecen fuera de alcance.
