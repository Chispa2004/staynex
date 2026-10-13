# Primera comparación real acotada — pendiente

Fecha: 2026-10-13. No se ha realizado ninguna llamada. Falta la credencial nueva de desarrollo y la aprobación expresa del techo de **0,75 USD**. No reutilizar secretos de producción.

## Muestra congelada

Baseline: `01d8f15ad8265ff2f59e3b644d82ed846666f27d`; candidato: el commit que contiene `guest-service-precision-review.md`, a fijar por SHA completo antes de generar. Mismos datos sintéticos de Faro de Arcilla / Juniper Quay, dos clústeres o esquemas desechables independientes, mismos estados y eventos de personal. La diferencia de respuestas previas de cada versión se conserva como contexto propio, no se intercambia.

| Grupo | Casos | Turnos por versión |
|---|---|---:|
| Regresión visible | D02 llegada; D06 información contradictoria/ausente; D07 cantidades; D09 abierto/en curso/hecho; D11 fallo/recuperación/humano; F01 almohadas/agradecimiento | 18 |
| Reservada | R01 llegada/edificio/habitación; R02 cantidades/progreso/gracias; R03 información/cambio de tema/humano | 9 |

Reserva: `arrival-naturalness-real-reserve.json`, sin cambios, SHA-256 canónico LF `329223069d3a7565fecfa703c989da9a07a2e5be0ae406296970bc95b95af939`. No se ha ejecutado en esta corrección, ni con proveedor ni con dobles. Ejecutar después de fijar ambas versiones. Si sus fallos motivan cambios, conservarlos y retirar la etiqueta de independencia para cualquier motor posterior.

## Rutas y llamadas

- **Principal**, 54 turnos entre ambas versiones: 1 llamada que combina clasificación y primera redacción por turno. No hay clasificador separado. Hasta 1 llamada posterior si hay ticket persistido/releído u observado. Con los recorridos esperados: 54 + 28 = **82** llamadas. Si cambian las decisiones, mantener el techo de 108 para esta ruta y registrar la diferencia.
- **Concierge**, solo D02 turno 2 y F01 turno 2 en cada versión: 4 llamadas de refinamiento y 2 acuses después del guardado = **6**. Usar copia aislada del estado previo y la salida principal ya capturada. Esto mide la diferencia de refinamiento, no cuatro recorridos completos independientes ni la clasificación de Concierge desde cero.
- **Inbox**: construir los borradores sobre las 27 instantáneas por versión. **0 llamadas**, 0 escrituras y 0 envíos; comparar entrada/salida y estado antes/después. No atribuirle generación de proveedor.
- Esperadas **88**; techo absoluto **114 intentos**, contando fallos. No multiplicar toda la muestra por cada ruta ni añadir jueces LLM, reintentos o llamadas auxiliares.

Modelo fijado: `gpt-4.1-mini-2025-04-14`, temperatura 0, mismo JSON schema y opciones en ambas versiones; máximo de salida 1.000 tokens. El snapshot reduce cambios de versión, no garantiza determinismo. Conservar finish_reason y truncamientos como resultado desfavorable. No repetir una generación para elegir una mejor.

## Precios y control antes de salir

[Precio oficial de GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), consultado el 13-10-2026: 0,40 USD/millón entrada y 1,60 USD/millón salida. No se descuentan entradas cacheadas para calcular el máximo. Verificar que el precio y el modelo sigan iguales antes de ejecutar; cualquier discrepancia detiene el plan.

Límites por intento: 12.000 tokens de entrada, 1.000 de salida; total 1.482.000; máximo financiero calculado 114 × (12.000 × 0,40 + 1.000 × 1,60) / 1.000.000 = **0,7296 USD**. Propuesta de autorización **0,75 USD** para uso API, sin impuestos/conversión de divisa. A 88 llamadas con todas las entradas en el máximo serían **0,5632 USD**; no es una predicción del uso real.

`scripts/fixtures/guest-service-quality/evaluation-budget.js` reserva entrada y salida antes de cada llamada y descuenta únicamente uso conocido. Sin aprobación, no reserva. No permite solicitudes concurrentes sin liquidar, exceso de llamadas/tokens/gasto ni salida tras error. Ante error de proveedor o uso desconocido, conserva toda la reserva y para. Pruebas offline en `test:evaluation-budget`.

El adaptador real está **pendiente de conexión**: no afirmar que el módulo aislado impide gasto en cualquier cliente. Debe usar SDK con `maxRetries:0`, desactivar otros transportes y no emitir ninguna llamada sin reserva. Tokenizar la solicitud completa (prompts, historial, herramientas/schema y framing) con el codificador del snapshot y margen conservador de protocolo; sin tokenizador o cota demostrada, parar. Nunca usar una cuenta basada solo en el mensaje visible. No recortar para encajar. La comprobación de procedencia y DPAPI se hace solo en memoria; no guardar Authorization, clave ni excepciones con cabeceras.

## Ejecución y evidencias obligatorias

1. Configurar y acreditar clave de desarrollo según `guest-service-development-access.md`; aprobar 0,75 USD. Fijar SHA candidato y verificar precios, reserva y ausencia de cambios de fixtures. La configuración de clave no inicia el ensayo.
2. Montar por versión PostgreSQL desechable y ejecutar prueba seca del transporte/cotización. Bloquear WhatsApp, email, experiencias, PMS, bases remotas y cualquier transporte de aplicación; solo IA autorizada podrá salir. Guest Memory OFF y SEND_AUTOMATIONS=false; no cambiar flags desplegados.
3. Capturar línea base real antes de cualquier nueva modificación, seis casos en ambas versiones y finalmente reserva. Guardar todas las entradas y salidas originales, incluso fallos; ningún reemplazo por `null` para el acuse posterior. La muestra con dobles actual no sustituye este paso.
4. Por llamada: modelo/configuración, entrada completa y hechos autorizados, raw output, respuesta final, transformación/motivo, identificadores sintéticos y recibos SQL, estado antes/después, latencia, error, finish_reason, usage real y reserva/coste. Si falta usage, marcar desconocido y parar, sin anunciar cero. Por turno distinguir error del proveedor, filtro, fallback y fallo de persistencia.
5. Presentar todos los turnos, separar veracidad operativa de estilo y solicitar valoración de las conversaciones. La valoración automática no es revisión humana. Las repeticiones exactas no bastan para acreditar naturalidad.

Quedan fuera de esta muestra: cancelación efectiva, ejecución de varias solicitudes independientes, matriz completa de idiomas/proveedores, rendimiento/latencia bajo carga, estadísticas representativas y certificación de calidad global. Las variantes de doble fallo y pérdida de relectura quedan como regresión local, no consumen la muestra del proveedor.
