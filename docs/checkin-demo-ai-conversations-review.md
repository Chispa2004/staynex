# Demo Checkin: conversaciones IA y etapas históricas

Base revisada: `95bbbfddb955d6eeda0b370baac409b674b37410`. Rama: `codex/checkin-demo-ai-conversations`.

## Alcance y clasificación

Inbox combina etapa, origen, búsqueda y filtros de atención en la URL. El servidor mantiene la autorización de usuario/hotel y lee todas las páginas autorizadas en lotes de 500 filas, con consultas auxiliares por 100 conversaciones. Un fallo de página no se presenta como éxito parcial. Las pruebas cubren 121 conversaciones y 3121 mensajes. El coste crece con el historial del hotel; no se ha introducido una búsqueda SQL ni una migración.

La etapa corresponde a `messages.created_at` en la zona horaria del hotel y a la reserva explícita de sus metadatos. Sin enlace explícito solo se acepta una reserva inequívoca del mismo huésped y hotel. Antes de llegada es preestancia; desde la hora de check-in del día de llegada hasta antes de la hora de checkout del día de salida es estancia; después es postestancia. Fechas, zona u horas de frontera insuficientes, reservas ambiguas o referencias ajenas producen «Sin clasificar». Las horas del hotel son límites de clasificación, no evidencia de que el huésped haya hecho físicamente check-in. No se utiliza la fecha actual ni el texto para reclasificar el historial.

Una conversación se encuentra por cualquier mensaje del huésped que cumpla simultáneamente origen y etapa; se cuenta una vez y se abre todo su historial. Las conversaciones vacías solo aparecen en Todas/Todos. Los contadores distinguen conversaciones y mensajes sin leer. Las respuestas de demo indican IA, borrador cuando corresponde, generación previa y ausencia de envío. Una secuencia en metadatos desempata turnos generados en el mismo milisegundo sin alterar fechas originales.

## Inventario y generación

La lectura previa confirmó nueve conversaciones con un mensaje cada una y cinco vacías con dependencias. No se eliminan ni rejuvenecen esos mensajes, ni se cambian sus estados de atención. El inventario UUID, respaldo consistente, SQL operativo, salida del proveedor y capturas se conservan fuera de Git.

| Nuevos casos | Etapa | Qué se muestra |
| --- | --- | --- |
| Nora Ejemplo: llegada nocturna | Antes de llegar | Procedimiento documentado y hora aproximada |
| Leo Ejemplo: cuna | Antes de llegar | Edad y fechas; disponibilidad sin confirmar |
| Vera Ejemplo: desayuno | Durante la estancia | Información de Knowledge y seguimiento |
| Hugo Ejemplo: ruido persistente | Durante la estancia | Contexto y necesidad de intervención humana |
| Inés Ejemplo: bufanda | Después de salir | Datos mínimos; sin afirmar hallazgo ni envío |
| Dani Ejemplo: próxima visita | Después de salir | Sin inventar disponibilidad ni promociones |

Cada nuevo caso tiene dos turnos. El plan admite 21 respuestas: nueve a los casos anteriores y doce nuevas. El ensayo llama a `analyzeGuestMessage` con el prompt y esquema reales. Solo proyecta contexto ficticio verificado contra los seeds, sin contactos, credenciales, tokens, memoria ni datos de otros hoteles; excluye la entrada wifi. Añade tres explicaciones ficticias acotadas a la demo. Los errores del proveedor se cierran sin fallback. Los checkpoints identifican entrada/salida y evitan volver a llamar al proveedor para un turno ya generado.

Las pruebas usan un proveedor espía explícitamente identificado; sus textos nunca son una entrega de IA real. Generación real completada con OpenAI gpt-4.1-mini: 21 respuestas revisadas, 17 ejemplos y cuatro borradores (Carlos, Pablo y ambos turnos de Hugo). Se hicieron 44 llamadas en total: se descartó la primera tanda de 21 por promesas operativas no acreditadas y se repitieron dos seguimientos de la segunda tanda que perdían contexto. Se conservan las salidas originales rechazadas fuera de Git. El ensayo utiliza la guía de respuesta existente para explicitar que no dispone de herramientas de ejecución; no cambia el prompt global. La clave temporal, transferida con autorización específica, se eliminó al finalizar. Las propuestas de ticket no se ejecutan. Control humano previo o escalado producen borradores; el caso de ruido queda bajo revisión humana. Respuesta, atención resuelta y entrega son estados diferentes.

## Carga, aislamiento y recuperación

No se necesita migración. El plan offline añade seis huéspedes, reservas y conversaciones; doce mensajes de huésped, 21 respuestas, tres entradas ficticias de Knowledge y un estado de control humano. Solo actualiza `last_message_at` de las nueve conversaciones originales. Los seis espacios UUID nuevos se incorporan al bloqueo externo existente, que no depende de nombres, teléfonos o metadatos editables. Las pruebas de los consumidores existentes también recorren esas seis identidades.

Orden operativo: revisar respaldo consistente e inventario; generar y revisar respuestas reales; publicar las guardas y comprobar versiones de Vercel/Railway y consumidores; confirmar `SEND_AUTOMATIONS=false`, Guest Memory OFF y ausencia de productores/disparadores relevantes; volver a contrastar el snapshot; ejecutar únicamente el plan aprobado del hotel demo; tomar respaldo posterior y preparar recuperación; contrastar otros hoteles y dependencias; verificar Inbox autenticado.

La transacción bloquea las tablas afectadas, comprueba hotel/operador existente, rechaza disparadores de usuario activos, cambios de filas y nuevos registros posteriores al respaldo. Los UUID repetidos deben coincidir exactamente con el plan: reintentar no duplica ni reinicia estados. La recuperación se calcula a partir del respaldo posterior, retira exclusivamente filas nuevas y restaura fechas modificadas. Rechaza actividad dependiente posterior; no usa cascadas ni borra conversaciones anteriores. Los acuses SQL de aislamiento no sustituyen la inspección efectiva de consumidores.

## Verificación

- Seis grupos de comportamiento: etapas/fronteras/TZ/ambigüedad, mezcla de filtros/historial, URL, paginación, generación/checkpoints/borradores e identidades bloqueadas.
- Diez escenarios PostgreSQL desechables, red `none`: autorización de carga, disparadores, control humano cambiado o añadido, rollback, conservación, repetición y recuperación protegida.
- Integrados respectivamente en `Critical tests and syntax` y `PostgreSQL knowledge and automation dispatch`; build en `Dashboard build`.
- Revisión local en navegador a 1920, 1366 y 390 px: cinco conversaciones por etapa, SIMULADO, búsqueda, recarga, teclado y apertura del historial; sin desbordamiento horizontal. Las capturas locales distinguen el laboratorio de la comprobación pública pendiente.
- El laboratorio usa handler, loader y componentes reales con identidad, almacenamiento y proveedor sintéticos. No acredita autenticación remota ni generación real.
- Un fallo local estático de `test:http-security` se debía a finales CRLF en Windows: con el mismo contenido LF pasa sin modificar ni debilitar la prueba.

## Estado de publicación y reunión

Pendiente registrar PR/SHA, logs finales, versiones desplegadas, generación real, carga y revisión pública. No confundir código publicado con ejemplos cargados. La reunión debe abrir Nora, Vera, Hugo e Inés, mostrar el filtro por etapas y SIMULADO, explicar los borradores y avisar de que son conversaciones previamente generadas sin transporte real. La integración con Ubikos queda fuera de alcance.
