// Read only from the checked ticket description, never from a model proposal.
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words={un:1,uno:1,una:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10};
const number='(?:[1-9]\\d{0,2}|'+Object.keys(words).join('|')+')';
const items={pillow:'pillows?|almohadas?',towels:'towels?|toallas?',cot:'cots?|cunas?'};
export function persistedItemQuantity(ticket) {
  const item=items[ticket?.request_context?.request_key];if(!item)return null;
  let quantity=null;
  for(const part of norm(ticket.description).split(/\n\nseguimiento \([^)]+\):\s*|\n/)) {
    const direct=[...part.matchAll(new RegExp(`\\b(${number})\\s+(?:(?:extra|additional|mas)\\s+)?(?:${item})\\b`,'g'))].map(m=>words[m[1]]||Number(m[1]));
    const change=part.match(new RegExp(`\\b(?:mejor|make (?:it|that)|change (?:it|that) to|cantidad:|quantity:)\\s+(${number})\\b`));
    const values=[...new Set(direct)];
    if(change)quantity=words[change[1]]||Number(change[1]);
    else if(values.length)quantity=values.length===1?values[0]:null;
  }
  return quantity;
}
export function itemLabel(key,quantity,en) {
  return (en?{pillow:['pillow','pillows'],towels:['towel','towels'],cot:['cot','cots']}:{pillow:['almohada','almohadas'],towels:['toalla','toallas'],cot:['cuna','cunas']})[key]?.[quantity===1?0:1]||null;
}
