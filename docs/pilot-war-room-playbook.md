# Pilot War Room Playbook

## Daily Checks

- PMS sync: revisar ultimo sync, ultimo error y si el dato esta stale.
- WhatsApp: confirmar inbound, outbound y errores seguros recientes.
- AI escalations: revisar conversaciones con atencion humana requerida.
- Conversations needing human: resolver Inbox antes de cerrar el dia.
- Tickets: priorizar urgentes y abiertos.
- Automation status: mantener `SEND_AUTOMATIONS=false` y revisar preview/runtime.
- Critical errors: capturar request/error id, no copiar secretos ni payloads crudos.

## Severity

P0: guest/security/cross-tenant/unsafe automated behavior.

P1: major feature degraded, human operation possible.

P2: minor/non-blocking issue.

## P0 Response

- Activar Kill Switch.
- Activar Human Takeover en conversaciones afectadas.
- Parar automations manteniendo `SEND_AUTOMATIONS=false`.
- Preservar Inbox/manual operation.
- Capturar request/error id y hora.
- Investigar con datos seguros, sin secrets ni payloads crudos.

## Daily Pilot Review

Maximo 15 minutos.

- Que fallo ayer.
- Que conversacion necesito humano.
- Que ticket sigue abierto.
- Que bloqueo impide live automations.
- Decision: continuar demo, pausar, o escalar.
