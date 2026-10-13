const normalizeServiceText=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function correctedIncident(text) {
 const n=normalizeServiceText(text);
 return [...n.matchAll(/(?:corrijo|correccion|correction|to clarify)\s*:\s*(?:no (?:pierde agua|hay fuga|gotea)|it is not leaking|there is no leak)[;,.]\s*(?:solo|only)\s+(.+)/g)].at(-1)?.[1]||null;
}
