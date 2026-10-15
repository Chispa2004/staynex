# Borrador LOCAL — Acreditar el destino del cliente Supabase del Dashboard

El servidor de Vercel no dispone de evidencia suficiente de su destino Supabase efectivo.
Este parche registra en logs privados el projectRef de la instancia real usada por un GET
autorizado de current-hotel. No devuelve datos diagnósticos al navegador ni añade endpoints.

Base: f627f8b441b1107c229a0daf7a5cb3ce95fd3d27. Candidato funcional:
1491d8df0efb299b3142eb6b6496349f1e126ab6. Rama codex/vercel-server-target-diagnostic.
La punta final incorpora además este borrador, el informe y el fixture de guardas CI adaptado
al segundo comando dashboard, sin cambios funcionales adicionales.

El evento contiene solo nombre/cliente fijos, entorno, SHA o deployment ID validado y projectRef.
URL desconocida produce not_accredited. Un intento por módulo serverless; fallos silenciosos
del diagnóstico no cambian la respuesta. Se conserva la autorización y readOnly del contexto,
sin autoasignaciones, escrituras o llamadas adicionales. No incorpora onboarding de PR #55.

Validación local: nueve grupos sintéticos, SDK/contexto/handler reales con transportes controlados,
ausencia del evento en bundles navegador, regresiones de contexto/carga, sintaxis y build PASS.
Fallo adicional de permisos PMS Academy reproducido en main, sin alterar expectativas.
Pruebas conectadas a critical y dashboard; no hay CI remoto de este candidato todavía.

**No integrar ni desplegar automáticamente.** Main despliega Vercel y Railway; el primer relevo
sin drenaje acreditado sigue pendiente. Se propone revisar por separado un Vercel Production
staged protegido, sin alias ni merge; su resultado acredita ese candidato, no el público anterior.
No migraciones, cambios de Auth/configuración, creación de hoteles o envíos.

Procedimiento, efectos, límites y retirada: `docs/vercel-server-target-diagnostic-review.md`.
PR #55 sigue en borrador/sin auto-merge; preflight remoto pendiente. Este archivo no abre una PR.
