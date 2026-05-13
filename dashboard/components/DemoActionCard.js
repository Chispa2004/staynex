import {
  AlertTriangle,
  Car,
  Flame,
  Loader2,
  MessageCircleWarning,
  Sparkles,
  Wifi,
  Wrench
} from 'lucide-react';

const iconMap = {
  housekeeping: Sparkles,
  maintenance: Wrench,
  hotel_info: Wifi,
  transport: Car,
  complaint: MessageCircleWarning,
  emergency: Flame
};

const accentMap = {
  housekeeping: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  maintenance: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  hotel_info: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  transport: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  complaint: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  emergency: 'border-red-400/40 bg-red-500/15 text-red-200'
};

export const DemoActionCard = ({ scenario, running, onRun }) => {
  const Icon = iconMap[scenario.category] || AlertTriangle;

  return (
    <button
      type="button"
      disabled={running}
      onClick={() => onRun(scenario.id)}
      className={[
        'group rounded-lg border p-5 text-left shadow-2xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-white/[0.055] disabled:cursor-wait disabled:opacity-70',
        accentMap[scenario.category] || 'border-borderline bg-panel/80 text-slate-200'
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-current/20 bg-black/20 shadow-lg shadow-black/10">
          {running ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Icon className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <span className="rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-xs font-semibold">
          {scenario.title}
        </span>
      </div>

      <p className="mt-5 text-base font-semibold leading-6 text-white">
        {scenario.message}
      </p>
      <p className="mt-3 text-sm text-current/75">
        Simulates an inbound WhatsApp message without sending a real WhatsApp reply.
      </p>
    </button>
  );
};
