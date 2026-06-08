"use client";

import { useMemo } from "react";
import {
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  assignLanes,
  weekDays,
} from "@/lib/agenda";
import { type MonthAppt, apptName, apptBlockStyle } from "./apptHelpers";

const PX_PER_HOUR = 48;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i);
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

export function WeekView({
  date,
  byDay,
  canWrite,
  onOpenDay,
  onPick,
  onEdit,
}: {
  date: string;
  byDay: Map<string, MonthAppt[]>;
  canWrite: boolean;
  onOpenDay: (day: string) => void;
  onPick: (start: Date, end: Date) => void;
  onEdit: (a: MonthAppt) => void;
}) {
  const days = useMemo(() => weekDays(new Date(date + "T00:00:00")), [date]);
  const todayKey = dayKey(new Date());

  return (
    <div className="overflow-x-auto rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex min-w-[680px]">
        {/* Eje de horas */}
        <div className="relative w-12 shrink-0" style={{ height: AXIS_H, marginTop: 28 }}>
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
              style={{ top: (i / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* 7 columnas de día */}
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d, idx) => {
            const k = dayKey(d);
            const isToday = k === todayKey;
            const dayAppts = byDay.get(k) ?? [];
            const laid = assignLanes(dayAppts);

            const slots: Date[] = [];
            for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
              slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0));
              slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, STEP_MIN));
            }

            return (
              <div key={k} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenDay(k)}
                  className={`mb-1 w-full truncate rounded py-1 text-center text-xs font-medium transition hover:bg-clinic/10 ${
                    isToday ? "bg-clinic text-white" : "text-slate-500"
                  }`}
                  title="Ver el día"
                >
                  {WD[idx]} {d.getDate()}
                </button>
                <div
                  className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100"
                  style={{ height: AXIS_H }}
                >
                  {HOURS.slice(1, -1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: ((i + 1) / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
                    />
                  ))}

                  {canWrite &&
                    slots.map((s) => {
                      const end = new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, end);
                      return (
                        <button
                          key={s.toISOString()}
                          type="button"
                          onClick={() => onPick(s, end)}
                          aria-label={`Agendar ${WD[idx]} ${hhmm(s)}`}
                          className="absolute inset-x-0 z-0 transition hover:bg-green-100/60"
                          style={{ top: g.top * AXIS_H, height: g.height * AXIS_H }}
                        />
                      );
                    })}

                  {laid.map(({ appt: a, lane, lanes }) => {
                    const s = new Date(a.starts_at);
                    const e = a.ends_at
                      ? new Date(a.ends_at)
                      : new Date(s.getTime() + STEP_MIN * 60_000);
                    const g = blockGeometry(s, e);
                    const initial = (a.dentist_name?.trim() || "")[0]?.toUpperCase();
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => onEdit(a)}
                        className={`absolute z-10 overflow-hidden rounded border px-1 text-left text-[10px] leading-tight transition enabled:hover:shadow-md disabled:cursor-default ${apptBlockStyle(a.status)}`}
                        style={{
                          top: g.top * AXIS_H,
                          height: Math.max(g.height * AXIS_H, 14),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                        }}
                        title={`${hhmm(s)} ${apptName(a)}${a.dentist_name ? " · " + a.dentist_name : ""}`}
                      >
                        <span
                          className={`block truncate font-medium ${a.status === "no_show" ? "line-through" : ""}`}
                        >
                          {initial ? `${initial}· ` : ""}
                          {apptName(a)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
