import {
  AlertTriangle,
  Car,
  ConciergeBell,
  Flame,
  Sparkles,
  Utensils,
  Wrench
} from 'lucide-react';

const iconMap = {
  housekeeping: Sparkles,
  maintenance: Wrench,
  restaurant: Utensils,
  transport: Car,
  complaint: AlertTriangle,
  emergency: Flame,
  reception: ConciergeBell,
  room_service: Utensils,
  spa: Sparkles
};

const colorMap = {
  housekeeping: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  maintenance: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  restaurant: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  transport: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
  complaint: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
  emergency: 'border-red-400/40 bg-red-500/15 text-red-200',
  reception: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
  room_service: 'border-blue-400/25 bg-blue-400/10 text-blue-200',
  spa: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200'
};

export const TicketCategoryIcon = ({ category }) => {
  const Icon = iconMap[category] || ConciergeBell;

  return (
    <span
      className={[
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
        colorMap[category] || 'border-borderline bg-white/[0.03] text-slate-300'
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{category || 'ticket category'}</span>
    </span>
  );
};
