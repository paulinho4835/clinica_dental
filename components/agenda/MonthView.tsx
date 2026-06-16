"use client";

import { useMemo } from "react";
import { type MonthAppt } from "./apptHelpers";
import { useDoctorColor } from "@/lib/agenda/doctorColor";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function MonthView({
  month, // YYYY-MM-DD (cualquier día del mes visible)
  byDay,
  selectedDay,
  onSelectDay,
}: {
  month: string;
  byDay: Map<string, MonthAppt[]>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const getDoctorColor = useDoctorColor();
  const base = new Date(month + "T00:00:00");
  const year = base.getFullYear();
  const mon = base.getMonth();
  const todayKey = dayKey(new Date());

  const cells = useMemo(() => {
    const first = new Date(year, mon, 1);
    const offset = (first.getDay() + 6) % 7; // 0 = lunes
    const start = new Date(year, mon, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, mon]);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium uppercase text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === mon;
          const dayAppts = byDay.get(k) ?? [];
          const isSelected = selectedDay === k;
          const isToday = k === todayKey;
          return (
            <button
              key={k}
              type="button"
              disabled={!inMonth}
              onClick={() => onSelectDay(k)}
              className={`flex min-h-[68px] flex-col items-start gap-1 border-b border-r border-slate-100 p-2 text-left transition ${
                !inMonth ? "cursor-default bg-slate-50/60 text-slate-300" : "hover:bg-clinic/5"
              } ${isSelected ? "ring-2 ring-inset ring-clinic" : ""}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                  isToday ? "bg-clinic font-bold text-white" : "text-slate-600"
                }`}
              >
                {d.getDate()}
              </span>
              {inMonth && dayAppts.length > 0 && (
                <div className="flex w-full flex-col gap-0.5">
                  {dayAppts.slice(0, 2).map((a) => {
                    const col = getDoctorColor(a.dentist_name ?? "");
                    const name = a.patients?.full_name ?? a.patient_name ?? "Cita";
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium ${col.bg} ${col.text}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${col.dot}`}
                        />
                        <span className="truncate">{name}</span>
                      </div>
                    );
                  })}
                  {dayAppts.length > 2 && (
                    <span className="pl-1 text-[10px] text-slate-400">
                      +{dayAppts.length - 2} más
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
