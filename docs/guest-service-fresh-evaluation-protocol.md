# Evaluación nueva de atención: protocolo previo

Fecha: 2026-10-13. Base f627f8b441b1107c229a0daf7a5cb3ce95fd3d27.
Dataset: scripts/fixtures/guest-service-quality/fresh-service-evaluation.json.
SHA-256 inicial: 3f9e0cc45ad5a5efde7a0a4c46c4e8c76541b1f11144469cc523e8dec30a1e48.

24 conversaciones nuevas, 72 turnos de huésped: 8 preestancia, 8 estancia, 8 postestancia; dos hoteles ficticios, español e inglés. D01–D16 diagnóstico; H01–H08 reservadas, no ejecutadas durante la corrección. Las expectativas y los probes se fijan antes del cambio. No se reutilizan como nuevas las generaciones históricas.

Método disponible: dobles deterministas en la llamada del SDK (sin HTTP), handlers de generación/parseo y finalización reales, RPC de tickets real en PostgreSQL desechable y borradores reales de Inbox. Se conservan la respuesta sustituida, respuesta procesada, salida final, prompt, estado SQL antes/después e intentos de efectos. Los dobles contienen afirmaciones desfavorables deliberadas; NO son salidas originales de un modelo real, ni miden su tasa de error. La composición posterior al guardado usa su alternativa sin generación, para comprobarla explícitamente. Presupuesto de llamadas reales en esta ejecución: 0; tokens reales: 0. No hay credencial de desarrollo acreditada. La evaluación con modelo real queda pendiente, sin extraer claves desplegadas.

Métricas con denominador: errores de propiedades por turno/ruta, conversaciones afectadas, escrituras y acuses acreditados, duplicados/objetivo incorrecto, seguimiento perdido, preguntas de habitación conocida, información ajena/inactiva en prompts, efectos en borradores y control humano. Información/derivación/estilo requieren revisar el texto y la evidencia: número de palabras o igualdad textual son señales, no acreditación de naturalidad. Un mismo diálogo reproducido por dos rutas no son dos conversaciones independientes. Inbox se compara sin ejecutar herramientas; su texto es borrador no enviado.

No se permite modificar datos de los fixtures después de ejecutar la línea base. Cualquier cambio del evaluador se conserva y obliga a recalcular línea base con el código anterior, sin cambiar probes/expectativas. Los casos reservados que revelen un defecto corregido dejan de ser independientes: deberán identificarse y añadirse otros antes de afirmar validación independiente.

Criterios: cero escrituras por información, borrador o control humano; ámbito exacto de hotel/huésped/conversación; ningún acuse sin lectura posterior al commit; no deducir comunicación, disponibilidad o entrega de un ticket abierto; no cerrar automáticamente por desistimiento si la capacidad no existe; no confirmar dos necesidades tras guardar solo una. Las solicitudes múltiples pueden conservarse para revisión humana si el contrato actual solo permite una por mensaje. No publicar con un fallo operativo crítico pendiente.

Guía metodológica consultada: [OpenAI, Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): separar desarrollo/validación y complementar evaluación automática con revisión humana. No se utiliza su servicio de evaluación ni se suben datasets.

## Registro posterior de la ejecucion

Los 8 casos H detectaron fallos y dejaron de ser independientes para sus correcciones. Se conservan sus primeras salidas desfavorables. R01-R06 se fijaron despues de corregir H y antes de ejecutarlos: seis conversaciones nuevas, 18 turnos, mismas politicas sinteticas. Su SHA-256 es 987a8d55d3b0291375245a476ee46431672fdc62a29171d23cc4b234364dd834.

R01 revelo un falso positivo del evaluador ante una negacion explicita de garantia de habitacion. Se conserva esa primera salida. Se corrige solo la asercion de disponibilidad: elimina la proposicion negada, no otras frases afirmativas. Hay regresiones positiva, negativa y mixta; los fixtures y el motor no se adaptan a R. Se recalcula esa propiedad sobre las salidas originales de la linea base (sin regenerarlas); no cambia ningun resultado. La seleccion del tercer conjunto y el campo de huella adicional tampoco alteran la evaluacion de D/H.

No se ha hecho evaluacion humana externa ni con lector/modelo real. La lectura editorial del agente detecta repeticion y respuestas largas residuales. Los archivos completos quedan disponibles para revision humana.

La huella inicial 3f9e0c... corresponde a bytes CRLF del checkout Windows. El contenido Git/LF tiene SHA-256 3495b626641a8339dbe506498033b59c10eb95d67891bcf4b2d531e63f04b43c. CI comprueba esta huella canonica tras normalizar solamente CRLF; cada informe conserva tambien la huella de bytes recibidos. No se modifica el fixture para adaptar la prueba.
