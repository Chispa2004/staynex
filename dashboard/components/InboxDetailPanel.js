'use client';

import { focusableIn, returnFocus } from '@/lib/focus-layer';
import { useEffect, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';
import styles from './InboxErgonomics.module.css';

// Native disclosures keep keyboard navigation and do not dispatch any action on opening.
export function InboxActionMenu({ label, icon, children, inline = false, placement = 'above', ariaLabel }) {
  const menu = useRef(null);
  useEffect(() => {
    const dismiss = event => {
      if (!menu.current?.contains(event.target)) menu.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <details ref={menu} className={styles.actionMenu} data-inline={inline} data-placement={placement} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current.open && !event.isComposing) {
      event.preventDefault(); event.stopPropagation();
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label={ariaLabel}>{icon}{label}<ChevronDown size={13} aria-hidden="true" /></summary>
    <div className={styles.actionOptions} onClick={event => {
      if (event.target.closest('button:not(:disabled)')) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    }}>{children}</div>
  </details>;
}

// Modal on smaller screens: native focus containment, Escape and focus restoration.
// A docked, non-modal dialog on wide desktops leaves list and history independent.
export function InboxDetailPanel({ title, onClose, children, closeLabel }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    const media = window.matchMedia('(min-width: 1600px)');
    const present = () => {
      if (node.open) node.close();
      if (media.matches) node.show();
      else node.showModal();
    };
    present();
    media.addEventListener('change', present);
    return () => {
      media.removeEventListener('change', present);
      node.close();
      returnFocus(trigger, document.querySelector('[data-inbox-return]'));
    };
  }, []);
  return <dialog id="inbox-detail-panel" ref={dialog} className={styles.detailPanel}
    aria-labelledby="inbox-detail-title" onKeyDown={event=>{
      if(event.defaultPrevented || event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(event.key==='Tab' && event.currentTarget.matches(':modal')){
        const items=focusableIn(event.currentTarget),first=items[0],last=items.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }} onCancel={event => { event.preventDefault(); close.current(); }}>
    <header><h2 id="inbox-detail-title">{title}</h2><button type="button" onClick={onClose} aria-label={closeLabel || `Cerrar ${title.toLowerCase()}`}><X size={18} aria-hidden="true" /></button></header>
    <div className={styles.detailBody}>{children}</div>
  </dialog>;
}
