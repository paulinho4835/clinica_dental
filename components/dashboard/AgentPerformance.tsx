import { Headset, CalendarCheck, CalendarDays, CalendarRange, UserPlus } from "lucide-react";

export type AgentStats = {
  bookedToday: number;
  bookedMonth: number;
  bookedTotal: number;
  intakesTotal: number;
  intakesApproved: number;
  intakesPending: number;
};

// Panel de desempeño del Asistente Virtual (agente de IA por WhatsApp) dentro
// del Dashboard. Muestra cuántas citas agendó y cuántos pacientes registró.
export function AgentPerformance({ stats }: { stats: AgentStats }) {
  const cards = [
    {
      label: "Citas agendadas hoy",
      value: stats.bookedToday,
      icon: CalendarCheck,
      tone: "bg-clinic/10 text-clinic-fg",
    },
    {
      label: "Citas agendadas este mes",
      value: stats.bookedMonth,
      icon: CalendarDays,
      tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10",
    },
    {
      label: "Citas agendadas (total)",
      value: stats.bookedTotal,
      icon: CalendarRange,
      tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10",
    },
    {
      label: "Pacientes que registró",
      value: stats.intakesTotal,
      icon: UserPlus,
      tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10",
      subtitle:
        stats.intakesTotal > 0
          ? `${stats.intakesApproved} aprobado${stats.intakesApproved !== 1 ? "s" : ""} · ${stats.intakesPending} por revisar`
          : "Aún sin registros",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-clinic/10 text-clinic-fg">
          <Headset className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-none">
            Desempeño del Asistente Virtual
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Citas y registros que gestionó el agente por WhatsApp.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tone}`}
              >
                <c.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-2xl font-bold leading-none tabular-nums">
                  {c.value}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {c.label}
                </div>
              </div>
            </div>
            {c.subtitle && (
              <p className="mt-2 truncate text-xs text-slate-400">{c.subtitle}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
