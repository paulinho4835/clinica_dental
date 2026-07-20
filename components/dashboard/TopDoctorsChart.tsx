"use client";

import { Card } from "@/components/ui/Card";
import { money } from "@/lib/format";

export type DoctorStat = {
  name: string;
  patientsCount: number;
  commission: number;
};

export function TopDoctorsChart({ data, currency }: { data: DoctorStat[]; currency: string }) {
  if (data.length === 0) {
    return (
      <Card className="flex h-80 flex-col p-6">
        <h3 className="font-semibold text-slate-800">Top Doctores (Mes)</h3>
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Sin actividad este mes
        </div>
      </Card>
    );
  }

  const maxPatients = Math.max(...data.map((d) => d.patientsCount));

  return (
    <Card className="flex h-80 flex-col p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-800">Rendimiento por Doctor</h3>
        <span className="text-xs font-medium text-slate-500">Pacientes atendidos este mes</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-2">
        {data.map((d) => {
          const width = maxPatients > 0 ? (d.patientsCount / maxPatients) * 100 : 0;
          return (
            <div key={d.name} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 truncate pr-2">{d.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {d.patientsCount} pctes <span className="mx-1 text-slate-300">|</span> <span className="text-clinic font-medium">{money(d.commission, currency)}</span> com.
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="absolute bottom-0 left-0 top-0 rounded-full bg-clinic transition-all duration-500"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
