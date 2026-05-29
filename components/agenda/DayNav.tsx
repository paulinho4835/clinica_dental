"use client";

import { useRouter } from "next/navigation";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function DayNav({
  date,
  dentistId,
  dentists,
}: {
  date: string; // YYYY-MM-DD
  dentistId: string;
  dentists: { id: string; full_name: string }[];
}) {
  const router = useRouter();

  function go(nextDate: string, nextDentist: string) {
    const params = new URLSearchParams();
    params.set("date", nextDate);
    if (nextDentist) params.set("dentist", nextDentist);
    router.push(`/agenda?${params.toString()}`);
  }

  function shift(days: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    go(toISODate(d), dentistId);
  }

  const label = new Date(date + "T00:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button onClick={() => shift(-1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">←</button>
        <button onClick={() => go(toISODate(new Date()), dentistId)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Hoy</button>
        <button onClick={() => shift(1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">→</button>
      </div>

      <input
        type="date"
        value={date}
        onChange={(e) => go(e.target.value, dentistId)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-clinic focus:outline-none"
      />

      <span className="text-sm font-medium capitalize text-slate-700">{label}</span>

      <select
        value={dentistId}
        onChange={(e) => go(date, e.target.value)}
        className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-clinic focus:outline-none"
      >
        <option value="">Todos los odontólogos</option>
        {dentists.map((d) => (
          <option key={d.id} value={d.id}>{d.full_name}</option>
        ))}
      </select>
    </div>
  );
}
