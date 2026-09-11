'use client';

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
    if (event.key === 'Escape') {
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
export function InboxDetailPanel({ title, onClose, children }) {
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
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return <dialog id="inbox-detail-panel" ref={dialog} className={styles.detailPanel}
    aria-labelledby="inbox-detail-title" onCancel={event => { event.preventDefault(); close.current(); }}>
    <header><h2 id="inbox-detail-title">{title}</h2><button type="button" onClick={onClose} aria-label={`Cerrar ${title.toLowerCase()}`}><X size={18} aria-hidden="true" /></button></header>
    <div className={styles.detailBody}>{children}</div>
  </dialog>;
}
