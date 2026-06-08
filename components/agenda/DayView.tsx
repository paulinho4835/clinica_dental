"use client";

import { useMemo } from "react";
import {
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  dentistColumns,
  assignLanes,
} from "@/lib/agenda";
import {
  type MonthAppt,
  apptName,
  apptCI,
  isQuickConsult,
  apptBlockStyle,
} from "./apptHelpers";
import { ApptActions } from "./ApptActions";

const PX_PER_HOUR = 56;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i);
const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

function nowFraction(day: string): number | null {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (key !== day) return null;
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const min = now.getHours() * 60 + now.getMinutes() - OPEN_HOUR * 60;
  if (min < 0 || min > total) return null;
  return min / total;
}

export function DayView({
  day,
  appts,
  canWrite,
  highlightId,
  onPick,
  onEdit,
  onLink,
}: {
  day: string;
  appts: MonthAppt[];
  canWrite: boolean;
  highlightId: string | null;
  onPick: (start: Date, end: Date, dentist?: string) => void;
  onEdit: (a: MonthAppt) => void;
  onLink: (a: MonthAppt) => void;
}) {
  const [y, m, d] = day.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const columns = useMemo(() => {
    const names = dentistColumns(appts);
    return names.length > 1 ? names : [null as string | null];
  }, [appts]);

  const now = nowFraction(day);

  const slots = useMemo(() => {
    const out: Date[] = [];
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
      out.push(new Date(y, m - 1, d, h, 0));
      out.push(new Date(y, m - 1, d, h, STEP_MIN));
    }
    return out;
  }, [y, m, d]);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold capitalize text-slate-700">{dayLabel}</h2>
        <span className="text-xs text-slate-400">{appts.length} cita(s)</span>
      </div>

      <div className="flex">
        {/* Eje de horas */}
        <div className="relative w-12 shrink-0" style={{ height: AXIS_H }}>
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

        {/* Columnas de odontólogo */}
        <div className="flex flex-1 gap-1">
          {columns.map((col) => {
            const colAppts =
              col === null
                ? appts
                : appts.filter(
                    (a) => (a.dentist_name?.trim() || "Sin asignar") === col,
                  );
            const laid = assignLanes(colAppts);
            return (
              <div key={col ?? "única"} className="flex-1">
                {col !== null && (
                  <div
                    className="mb-1 truncate text-center text-xs font-medium text-slate-500"
                    title={col}
                  >
                    {col}
                  </div>
                )}
                <div
                  className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100"
                  style={{ height: AXIS_H }}
                >
                  {/* Líneas de hora */}
                  {HOURS.slice(1, -1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: ((i + 1) / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
                    />
                  ))}

                  {/* Slots clicables */}
                  {canWrite &&
                    slots.map((s) => {
                      const end = new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, end);
                      return (
                        <button
                          key={s.toISOString()}
                          type="button"
                          onClick={() => onPick(s, end, col ?? undefined)}
                          aria-label={`Agendar ${hhmm(s)}`}
                          className="absolute inset-x-0 z-0 transition hover:bg-green-100/60"
                          style={{ top: g.top * AXIS_H, height: g.height * AXIS_H }}
                        />
                      );
                    })}

                  {/* Línea de "ahora" */}
                  {now !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-400"
                      style={{ top: now * AXIS_H }}
                    >
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  )}

                  {/* Bloques de cita */}
                  {laid.map(({ appt: a, lane, lanes }) => {
                    const s = new Date(a.starts_at);
                    const e = a.ends_at
                      ? new Date(a.ends_at)
                      : new Date(s.getTime() + STEP_MIN * 60_000);
                    const g = blockGeometry(s, e);
                    const isHit = highlightId === a.id;
                    const blockH = Math.max(g.height * AXIS_H, 40);
                    // ≥80px (~40 min): acciones con texto; ≥40px: sólo iconos; <40px: sin acciones.
                    const tall = blockH >= 80;
                    const showActions = canWrite && blockH >= 40;
                    return (
                      <div
                        key={a.id}
                        className="absolute z-10"
                        style={{
                          top: g.top * AXIS_H,
                          height: blockH,
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                        }}
                      >
                        {/* div en lugar de button para evitar button-dentro-de-button (HTML inválido) */}
                        <div
                          role={canWrite ? "button" : undefined}
                          tabIndex={canWrite ? 0 : undefined}
                          onClick={canWrite ? () => onEdit(a) : undefined}
                          onKeyDown={canWrite ? (e) => e.key === "Enter" && onEdit(a) : undefined}
                          title={canWrite ? "Editar cita" : undefined}
                          className={`flex h-full w-full flex-col overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] transition ${canWrite ? "cursor-pointer hover:shadow-md" : "cursor-default"} ${apptBlockStyle(a.status)} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}
                        >
                          <span className="tabular-nums opacity-70">{hhmm(s)}</span>
                          <span
                            className={`truncate font-medium ${a.status === "no_show" ? "line-through" : ""}`}
                          >
                            {apptName(a)}
                          </span>
                          {apptCI(a) && (
                            <span className="truncate text-[10px] opacity-60">CI {apptCI(a)}</span>
                          )}
                          {isQuickConsult(a) && (
                            <span className="text-[10px] text-amber-600">sin registrar</span>
                          )}
                          {showActions && (
                            <div
                              className="mt-auto pt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ApptActions
                                appt={a}
                                canWrite={canWrite}
                                onLink={onLink}
                                compact={!tall}
                                iconOnly={!tall}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {appts.length === 0 && (
        <p className="mt-2 text-center text-sm text-slate-500">
          {canWrite ? "Día libre — hacé clic en una franja para agendar." : "Sin citas este día."}
        </p>
      )}
    </div>
  );
}
