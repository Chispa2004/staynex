// Evaluation only: a quoted, explicitly unguaranteed proposition is not an
// affirmative availability claim. Remove that bounded clause, not the sentence.
export function assertsAvailability(reply='') {
 const text=String(reply).replace(/(?:does not|doesn't|cannot|can't)\s+(?:guarantee|confirm)\s+(?:that\s+)?(?:your |the )?room\s+(?:will be|is)\s+(?:ready|available)/gi,'[unconfirmed availability]');
 return /room (?:will be|is) (?:ready|available)|booking is confirmed|habitaci[oó]n ya estar[aá] disponible/i.test(text);
}
