const statItems = [
  { key: 'openTickets', label: 'Open tickets' },
  { key: 'urgentTickets', label: 'Urgent tickets' },
  { key: 'activeConversations', label: 'Active conversations' },
  { key: 'completedToday', label: 'Completed today' }
];

export const DemoStatsPanel = ({ stats }) => (
  <aside className="rounded-lg border border-white/10 bg-[#0b1019]/88 p-5 shadow-2xl shadow-black/20">
    <p className="text-sm font-semibold text-white">Live operations</p>
    <p className="mt-1 text-sm text-slate-500">Demo impact across the hotel.</p>

    <div className="mt-5 space-y-3">
      {statItems.map((item) => (
        <div key={item.key} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats?.[item.key] ?? 0}</p>
        </div>
      ))}
    </div>
  </aside>
);
