'use client';

import { useEffect, useRef } from 'react';

export const focusableIn = node => [...node.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')]
  .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[inert]'));

export const returnFocus = (opener, fallback) => {
  const usable = element => element?.isConnected && !element.disabled && !element.closest('[inert]') && element.getClientRects().length;
  const target = [opener, fallback, document.querySelector('main h1'), document.querySelector('main')].find(usable);
  if (!target) return;
  if (!target.matches('a[href],button,input,select,textarea,[tabindex]')) target.tabIndex = -1;
  target.focus({preventScroll:true});
};

// For overlays already positioned by the product. Native dialogs retain their
// browser modality; non-modal panels opt out of containment.
export function useFocusLayer(ref, active, {onClose, modal = true, native = false, fallback} = {}) {
  const latest = useRef({onClose, modal, fallback});
  latest.current = {onClose, modal, fallback};
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current, opener = document.activeElement;
    if (native) node.showModal();
    const focusFirst = () => (focusableIn(node)[0] || node).focus({preventScroll:true});
    focusFirst();
    node.dataset.focusLayer = '';
    const key = event => {
      if (event.target.closest('[data-focus-layer]') !== node) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); latest.current.onClose?.();
      }
      if (event.key !== 'Tab' || !latest.current.modal) return;
      const items = focusableIn(node), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    };
    const contain = event => {
      if (latest.current.modal && !node.contains(event.target) && !document.querySelector('dialog[open]:modal')) focusFirst();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', contain);
    return () => {
      delete node.dataset.focusLayer; document.removeEventListener('keydown', key); document.removeEventListener('focusin', contain);
      if (native) node.close();
      returnFocus(opener, latest.current.fallback?.current);
    };
  }, [active, native, ref]);
}
