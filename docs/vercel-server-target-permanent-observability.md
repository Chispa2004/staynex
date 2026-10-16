# Destino Supabase: observabilidad interna permanente

Procedimiento vigente del 16 de octubre de 2026. Sustituye los planes temporales de #56.
El usuario autoriza mantener la comprobación en el deployment observado; no exige retirarla
ni demostrar continuidad entre dos builds. Los informes anteriores se conservan como históricos.
Autorización: adaptar/subir solo #56, CI, Vercel Production staged, promover, lectura autenticada,
logs privados y preflight READ ONLY condicionado. No merge, Railway, onboarding ni migraciones.

## Contrato y recorrido

El helper server-only observa `supabaseUrl` del cliente real que GET /api/current-hotel usó
para autenticar y resolver el hotel. No crea otro cliente. getSupabaseAdmin sigue utilizando
SUPABASE_URL/service-role sin fallback público. Constructor, lockfiles y precedencia dotenv
no cambian. No se recuperan Secrets mediante herramientas administrativas.

Después de usuario/hotel válidos, sin fallback/denegación y con permiso dashboard, emite solo
event/client fijos, projectRef validado, environment y SHA/deployment ID validado. Destinos
no reconocidos producen not_accredited; no imprime valores arbitrarios, URL, claves, tokens,
cookies, cabeceras, datos personales, objetos o excepciones. Nada en JSON/HTML/browser bundles.
No añade endpoint, variable, permiso ni bloqueo de servicio. El proyecto esperado se compara
por el operador; no está hardcodeado en la autorización o cliente.

Un intento por instancia de módulo, incluso ante fallo. Warm requests no aumentan el volumen;
cold starts pueden emitir una vez cada uno. No es límite global ni comprobación por petición.
Ausencia de nuevos eventos no acredita un destino. Se conserva la privacidad/retención del hosting.

Petición elegida: GET /api/current-hotel con sesión y hotel existentes autorizados,
x-staynex-workspace-path=/dashboard, sin body ni x-staynex-context-only. readOnly:true impide
resolvePendingInvitationsForUser/attachUserToHotelInvitation y UPDATE directo. Auth SDK GET user,
SELECT hotel_users/hotels y cálculo local de permisos; sin refresh, auditoría de cambio, cookie,
RPC, Railway, IA, sincronización o envío. Middleware manifest vacío. Gate opcional no solicitado.
Hosting/Auth pueden registrar accesos técnicos. El catálogo remoto aún no queda acreditado.

Pruebas conservadas: handler/helpers/SDK reales con fetch sintético cerrado, active/unbound/
invited/disabled, control negativo que detecta PATCH sin readOnly, respuestas idénticas,
autorización, precedencia, no filtración y tolerancia a errores. Nueva regresión: 100 llamadas
por instancia, dos instancias independientes, campos cerrados, cero transportes externos.
El build verifica marcador solo servidor y middleware vacío. No equivale a prueba remota.

Alcance: cliente dashboard.getSupabaseAdmin.GET_current_hotel del deployment emisor. No acredita
cliente navegador, Railway, Preview, versiones anteriores/futuras ni operaciones de alta.

## Ejecución exclusiva en Vercel

D0 = público inicial; D1 = candidato permanente. Conservar D0 y Railway para recuperación.
Antes del push verificar Production branch main en ambos proveedores; solo subir rama #56,
draft sin auto-merge. El CI completo y logs deben corresponder al nuevo SHA; no reutilizar
PASS de a57798c. #55 permanece intacta. Un merge normal desplegaría Railway: está prohibido.

Fuentes exactas del SHA aprobado, checkout limpio sin .env, inventarios, node_modules enlazados
o builds locales. Proyecto staynex/equipo staynex-s-projects, Production. Mecanismo previsto:
`vercel deploy --prod --skip-domain --scope staynex-s-projects`, build remoto; después
`vercel inspect <D1>` y `vercel promote <D1>`. No --env/--build-env/--public/env pull,
variables, protecciones, Git main, CLI Railway o hooks. Una alternativa del proveedor debe
conservar explícitamente estas garantías. Promote no cambia Git ni activa su trigger Railway.

| Paso | Acción | Evidencia para continuar | Fallo/recuperación |
|---|---|---|---|
| Inventario | Leer proyecto/entorno/D0/SHA/dominio, Railway deployment/réplica y disparadores | Identidades iniciales; sin avance concurrente incompatible | Parar sin sobrescribir |
| Candidato | Commit/diff, push rama, CI | SHA exacto, tres jobs PASS y logs reales | Corrección mínima y checks afectados |
| Staged | Production sin dominio desde fuentes revisadas | Ready, SHA/manifest, entorno, protección; D0 público, Railway intacto | No promover ni cambiar settings |
| Sesión | Confirmar sesión autorizada antes de sustituir público | Sesión utilizable y hotel permitido | Pedir solo login; no crear/conceder accesos |
| Promoción | Promote D1 existente | Current Domains = D1; mismo ID/build; Railway intacto | Ante timeout consultar estado, no repetir a ciegas |
| Lectura | Una GET pública autorizada | HTTP autorizado; evento privado de esa ventana/ruta/versión | Diagnosticar ausencia antes de repetir |
| Destino | Comparar projectRef vblxmnqbatqrynfaasmf | Cliente y production/D1/SHA correctos | Distinto/no acreditado: restaurar D0, sin preflight ni cambios de variables |
| Permanencia | Mantener D1; lecturas básicas seguras | Código en Git, misma versión acreditada, Railway deployment/réplica iguales | Regresión: restaurar D0; su destino queda pendiente |
| Preflight | Revisar script/hashes #55 y destino backend | READ ONLY, límites, catálogo/agregados, ROLLBACK | Documentar/reproducir diferencias, no reparar remoto |

No pruebas funcionales en Preview ni lectura staged que consuma antes el evento. No cargar
SPA/rutas que disparen resolutores legacy, IA o sincronización. Bearer solo en memoria;
sin service-role del operador, copia de sesión o cuerpos operativos. Cabeceras Authorization,
x-staynex-hotel-id, x-staynex-workspace-path=/dashboard; sin reintento ni redirección automática.
Conservar solo evento mínimo e identidad/hora/dominio. Falta de sesión exige login antes del corte.

D0 y D1 pueden resolver variables distintas, incluidas las de build. El evento acredita D1
directamente; no se atribuye retrospectivamente a D0. Se mantiene D1, sin segundo build de
retirada. Cada publicación futura necesitará evidencia propia; permanencia no significa certeza
para siempre. Recuperación: promover D0 Production existente, confirmar mismo ID sin rebuild.
Si la herramienta cambia settings/protección, parar. Instant Rollback puede desactivar la
autoasignación: no tratarlo como operación equivalente sin revisar sus efectos.

## Preflight y reconciliación

Solo después de acreditar Dashboard final y backend: leer script exacto y dependencias,
contrastar hashes de add_hotel_access_invitations.sql, add_hotel_information_review.sql y
add_pms_connection_evidence.sql con informe #55. READ ONLY explícito, tiempos máximos,
catálogo/agregados imprescindibles y ROLLBACK. Sin contenido huésped, DDL/DML/permisos o RPC
de negocio. Separar existentes compatibles, nuevos previstos, diferencias y verificaciones
posteriores a una futura migración. Ninguna migración se aplica en esta intervención.

Dashboard D1 diverge temporalmente de main f627f8b; conservar SHA/diff/deployment en #56 draft.
La reconciliación posterior requiere revisión/CI y autorización que contemple el trigger
Railway; no hacer merge aquí ni incorporar #55. No perder esta comprobación accidentalmente
en el siguiente despliegue. Auth/retorno/entrega real, catálogo/accesos legacy y control/drenaje
medible de escritores de onboarding siguen separados. Esto no completa PMS ni alta de clientes.

Fuentes: https://vercel.com/docs/cli/deploy#skip-domain, https://vercel.com/docs/cli/promote,
https://vercel.com/docs/instant-rollback, https://vercel.com/docs/environment-variables/sensitive-environment-variables.
