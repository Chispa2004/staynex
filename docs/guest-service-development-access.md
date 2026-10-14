# Acceso de desarrollo para la evaluación sintética

**Estado vigente: evaluación real aplazada por decisión expresa del usuario. Sin gasto autorizado, búsqueda/configuración de claves ni llamadas. Los pasos y cifras siguientes se conservan como propuesta histórica; no ejecutarlos en esta fase.**

Comprobación del 13 de octubre de 2026: `OPENAI_API_KEY` ausente en el proceso, ningún archivo de credencial de desarrollo en el worktree y ningún registro explícito en `%LOCALAPPDATA%\Staynex\development-evaluation`. No se han leído `.env` de otros trabajos ni consultado Railway, Vercel o secretos desplegados. Ausencia de acceso acreditado; no es una auditoría de todas las claves del equipo.

## Configuración por el propietario

1. En [OpenAI Platform](https://platform.openai.com/), selecciona o crea un **proyecto de desarrollo separado de producción** y genera una clave nueva para esa evaluación. Conserva su identificador `proj_...` (no es un secreto). Autoriza el modelo actual de la aplicación, `gpt-4.1-mini`; no se propone una migración de modelo. Limita los permisos de la clave a la generación necesaria y establece los límites de uso que permita tu proyecto.
2. Abre PowerShell con tu usuario normal, sin administrador. Ejecuta:

   ```powershell
   & 'C:\Users\chimi\OneDrive\Documentos\New project\.npm-cache\guest-service-quality-evaluation\worktree\scripts\configure-development-evaluation.ps1' -ConfirmDevelopment
   ```

3. Introduce el identificador del proyecto y pega la clave **solo en el campo oculto del terminal**. No la pongas en el comando, en un `.env`, en el chat ni en una captura. Si Windows bloquea el script por política, no cambies la política global: comunícalo para preparar la ejecución permitida por tu equipo.
4. El script guarda la clave cifrada mediante DPAPI para tu usuario en `%LOCALAPPDATA%\Staynex\development-evaluation\openai-key.dpapi`, fuera de Git y de OneDrive. Guarda por separado la procedencia y finalidad declaradas en `provenance.json`. No modifica variables de entorno ni hace llamadas. No sobrescribe credenciales existentes.
5. Confirma en el chat «clave de desarrollo configurada». No compartas la clave ni el archivo cifrado. La procedencia queda declarada por ti; su validez y el proyecto efectivo aún tendrán que comprobarse con la ejecución autorizada, sin imprimir la credencial.

El evaluador deberá descifrarla solo en memoria bajo ese mismo usuario, sin argumentos de proceso con la clave, sin archivos de texto intermedios y sin incluir cabeceras de autorización en evidencias. El script de configuración no inicia por sí mismo una evaluación.

## Presupuesto vigente, pendiente de autorización

La instrucción actual sustituye el plan de 270 intentos/2.160.000 tokens. Ver [plan acotado](guest-service-precision-real-plan.md): seis conversaciones de regresión y tres reservadas, 27 turnos por versión, **01d8f15 frente al commit que contiene la corrección de precisión**. Propuesta: **0,75 USD**, hasta 114 intentos sin reintentos; 12.000 tokens de entrada y 1.000 de salida por llamada; máximo total 1.482.000 tokens. No hay autorización monetaria todavía. El archivo de credencial no autoriza por sí solo gasto alguno.

El control local de reservas de presupuesto está implementado y probado, sin transporte. Antes de la primera llamada debe conectarse al adaptador real, contar todo el mensaje/esquema con el tokenizador del modelo y margen de protocolo, comprobar las reservas en seco y fijar el SHA candidato. Si una entrada supera el límite, detenerse: no recortar hechos ni ampliar el presupuesto. No existe todavía un ensayo real ejecutado ni un transporte de evaluación listo para lanzar automáticamente.

En esta fase solo se ha comprobado la existencia de `provenance.json` y `openai-key.dpapi` en el mecanismo autorizado: ambos ausentes. No se ha buscado otra credencial. Consumo: **0 llamadas, 0 tokens, 0 USD**. Los dobles y los replays históricos son regresiones técnicas, no una comparación real del modelo.

Referencia: [OpenAI, prácticas de producción y seguridad de claves](https://developers.openai.com/api/docs/guides/production-best-practices). Las claves deben mantenerse fuera del código y utilizarse mediante mecanismos de gestión de secretos. Aquí se opta por almacenamiento local cifrado y una clave exclusiva de desarrollo.

Revisión vigente: [llegada nocturna y respuestas completas](guest-service-arrival-correction.md). La reserva R01–R03 sigue sin ejecutar y sustituye, para independencia, las muestras anteriores ya utilizadas. Comprobación local: registro de procedencia, archivo DPAPI y clave del proceso ausentes.

Revisión vigente de precisión: [cantidades, llegada y recuperación](guest-service-precision-review.md). La referencia 5768682 del plan anterior queda sustituida por 01d8f15; los informes históricos se conservan.
