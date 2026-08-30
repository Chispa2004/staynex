# Pilot Failure Rehearsal

Fecha: 2026-08-30

Alcance: ensayo local y operacional para el piloto. No activa `SEND_AUTOMATIONS`, no llama Twilio real, no llama OpenAI real, no accede a Supabase real y no usa PMS real.

| Scenario | Expected behavior | Human action | Kill/fallback | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| PMS down | Staynex UI sigue disponible; Pilot Health marca PMS degradado o accion requerida; no se inventan datos PMS frescos. | Revisar conexion PMS y operar solo con ultimo dato conocido claramente identificado. | Automatizaciones/live actions permanecen seguras; sin default hotel/data fallback. | El operador identifica fallo PMS sin secretos ni datos cross-tenant. | PASS |
| OpenAI down | No se inventa respuesta AI; inbound queda en Inbox con atencion humana requerida. | Responder manualmente desde Inbox. | Fallback humano activo; AI reply count = 0 ante fallo proveedor. | Sin respuesta automatica inventada y sin llamada real al proveedor en test. | PASS |
| WhatsApp outbound failure | Error visible operacionalmente; sin loop infinito ni duplicado guest-facing. | Revisar Inbox/estado Twilio y decidir accion manual. | Error seguro, sin raw Twilio secrets/errors. | Fallo categorizado y sin reenvio automatico. | PASS |
| unsupported guest question | No se alucina un dato del hotel; se escala o se marca atencion humana. | Recepcion responde con informacion verificada. | Se usan senales existentes de fallback/escalacion. | Sin dato inventado y takeover disponible. | PASS |
| Human Takeover | Inbound sigue llegando; AI reply count = 0 mientras takeover esta ON. | Recepcion responde manualmente y libera takeover cuando proceda. | Release no reprocesa historico; siguiente inbound puede usar AI. | Sin respuesta retroactiva automatica. | PASS |
| Kill Switch | Hotel/global kill OFF bloquea automaticos; Inbox y operacion manual siguen vivos. | Mantener operacion manual hasta reactivar con decision humana. | AI auto reply = 0; sin efectos automaticos guest-facing. | Gate central bloquea y conserva manual operation. | PASS |
| automation blocked/problematic | Decision preview se salta o bloquea; no live send con `SEND_AUTOMATIONS=false`. | Revisar razon en Automations/Test Center. | Sin duplicar queue ni enviar al guest. | Bloqueo visible, no send real, no duplicado. | PASS |

## Still Not Live Gates

Estos escenarios pasan para ensayo de piloto y preview. No equivalen a `READY FOR LIVE AUTOMATIONS`.

- Quiet Hours/send-time runtime
- outbound atomic delivery
- real WhatsApp
- real PMS
- monitoring operativo del hotel real
- Kill Switch configurado para el hotel real
- Human Fallback verificado por el equipo real
