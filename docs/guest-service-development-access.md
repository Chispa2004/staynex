# Acceso de desarrollo para la evaluación sintética

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

## Presupuesto comunicado antes de consumir

Máximo conjunto para línea base, corrección y validación: **360 intentos de generación y 2.400.000 tokens totales**. Incluye generación principal, Concierge y redacción posterior al recibo; Inbox continúa siendo un borrador determinista. Sin reintentos automáticos. Cada solicitud debe reservar su máximo de salida y un límite conservador de entrada antes de salir; registrar uso real del proveedor, latencia y error. Si falta `usage` tras un timeout, cargar la reserva y marcar consumo desconocido, sin inventar cero. Parar antes de superar cualquier límite.

No se ha construido ni ejecutado aún el transporte real autorizado. Al habilitarlo, solo podrá salir al proveedor de IA para estos dos hoteles sintéticos. PostgreSQL seguirá siendo desechable; WhatsApp, email, experiencias, PMS y bases remotas deben continuar bloqueados. La credencial no habilita ninguna operación de aplicación ni cambia flags.

Consumo de esta fase: **0 llamadas y 0 tokens reales**. Comparación real antes/después pendiente. Es requisito conservar primero la línea base de `852eeb0`, incluyendo la generación posterior al guardado; el evaluador anterior la sustituía por `null` y no sirve como medición de naturalidad real.

Referencia: [OpenAI, prácticas de producción y seguridad de claves](https://developers.openai.com/api/docs/guides/production-best-practices). Las claves deben mantenerse fuera del código y utilizarse mediante mecanismos de gestión de secretos. Aquí se opta por almacenamiento local cifrado y una clave exclusiva de desarrollo.
