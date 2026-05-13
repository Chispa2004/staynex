'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const getAgeLabel = (createdAt, t) => {
  if (!createdAt) {
    return t('tickets.noData');
  }

  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (elapsedMinutes < 1) {
    return t('tickets.openedNow');
  }

  if (elapsedMinutes < 60) {
    return t('tickets.openedMinutes', { count: elapsedMinutes });
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return t('tickets.openedHours', { count: elapsedHours });
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return t('tickets.openedDays', { count: elapsedDays });
};

export const TicketAgeLabel = ({ createdAt, urgent = false }) => {
  const { t } = useDashboardLanguage();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => {
    void now;
    return getAgeLabel(createdAt, t);
  }, [createdAt, now, t]);

  return (
    <span className={urgent ? 'text-red-200' : 'text-slate-500'}>
      {label}
    </span>
  );
};
