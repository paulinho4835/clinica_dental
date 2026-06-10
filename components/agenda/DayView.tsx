"use client";

import { useEffect, useMemo, useState } from "react";
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
  forcedColumns,
}: {
  day: string;
  appts: MonthAppt[];
  canWrite: boolean;
  highlightId: string | null;
  onPick: (start: Date, end: Date, dentist?: string) => void;
  onEdit: (a: MonthAppt) => void;
  onLink: (a: MonthAppt) => void;
  /** Cuando se pasa, se usan estos nombres como columnas fijas (vista overview). */
  forcedColumns?: string[];
}) {
  const [y, m, d] = day.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const columns = useMemo<(string | null)[]>(() => {
    if (forcedColumns && forcedColumns.length > 0) return forcedColumns;
    const names = dentistColumns(appts);
    return names.length > 1 ? names : [null];
  }, [appts, forcedColumns]);

  // La línea de "ahora" depende de la hora actual, que difiere entre server
  // (UTC) y cliente (Bolivia). Se calcula solo tras montar para no romper la
  // hidratación, y se refresca cada minuto.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(nowFraction(day));
    const t = setInterval(() => setNow(nowFraction(day)), 60_000);
    return () => clearInterval(t);
  }, [day]);

  const slots = useMemo(() => {
    const out: Date[] = [];
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
      out.push(new Date(y, m - 1, d, h, 0));
      out.push(new Date(y, m - 1, d, h, STEP_MIN));
    }
    return out;
  }, [y, m, d]);

  const isOverview = forcedColumns && forcedColumns.length > 0;

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold capitalize text-slate-700">{dayLabel}</h2>
        <span className="text-xs text-slate-400">{appts.length} cita(s)</span>
      </div>

      <div className="flex">
        {/* Eje de horas — fijo a la izquierda */}
        <div className="relative z-10 w-12 shrink-0" style={{ height: AXIS_H }}>
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

        {/* Columnas — scroll horizontal en modo overview */}
        <div className={isOverview ? "flex-1 overflow-x-auto" : "flex flex-1 gap-1"}>
          <div className={`flex gap-1 ${isOverview ? "min-w-max" : "flex-1"}`}>
            {columns.map((col) => {
              const colAppts =
                col === null
                  ? appts
                  : appts.filter(
                      (a) => (a.dentist_name?.trim() || "Sin asignar") === col,
                    );
              const inChair = colAppts.filter((a) => a.status === "in_chair").length;
              const laid = assignLanes(colAppts);

              return (
                <div
                  key={col ?? "única"}
                  className={isOverview ? "w-52 shrink-0" : "flex-1"}
                >
                  {/* Encabezado de columna */}
                  {col !== null && (
                    <div className="mb-1 text-center">
                      <div
                        className="truncate text-xs font-semibold text-slate-700"
                        title={col}
                      >
                        {col}
                      </div>
                      {isOverview && (
                        <div className="text-[10px] text-slate-400">
                          {colAppts.length} cita{colAppts.length !== 1 ? "s" : ""}
                          {inChair > 0 && (
                            <span className="ml-1 font-medium text-emerald-600">
                              · {inChair} en sillón
                            </span>
                          )}
                        </div>
                      )}
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

                    {/* Estado vacío en overview */}
                    {isOverview && colAppts.length === 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-[11px] text-slate-300">Sin citas</span>
                      </div>
                    )}

                    {/* Bloques de cita */}
                    {laid.map(({ appt: a, lane, lanes }) => {
                      // Solo en modo "Todos" (>1 columna) para no repetir lo que ya dice el header
                      const doctorLabel =
                        isOverview && columns.length > 1 && a.dentist_name?.trim()
                          ? a.dentist_name.trim()
                          : null;
                      const s = new Date(a.starts_at);
                      const e = a.ends_at
                        ? new Date(a.ends_at)
                        : new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, e);
                      const isHit = highlightId === a.id;
                      const naturalH = g.height * AXIS_H;
                      const showActions = canWrite;
                      const blockH = Math.max(naturalH, showActions ? 58 : 24);
                      const tall = blockH >= 78;
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
                          <div
                            role={canWrite ? "button" : undefined}
                            tabIndex={canWrite ? 0 : undefined}
                            onClick={canWrite ? () => onEdit(a) : undefined}
                            onKeyDown={canWrite ? (e) => e.key === "Enter" && onEdit(a) : undefined}
                            title={canWrite ? "Editar cita" : undefined}
                            className={`flex h-full w-full flex-col overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] transition ${canWrite ? "cursor-pointer hover:shadow-md" : "cursor-default"} ${apptBlockStyle(a.status)} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}
                          >
                            <span className="truncate leading-tight">
                              <span className="tabular-nums opacity-70">{hhmm(s)}</span>{" "}
                              <span
                                className={`font-medium ${a.status === "no_show" ? "line-through" : ""}`}
                              >
                                {apptName(a)}
                              </span>
                            </span>
                            {tall && a.reason && (
                              <span className="truncate text-[10px] italic text-slate-500">
                                {a.reason}
                              </span>
                            )}
                            {tall && doctorLabel && (
                              <span className="truncate text-[10px] font-medium text-slate-400">
                                {doctorLabel}
                              </span>
                            )}
                            {tall && apptCI(a) && (
                              <span className="truncate text-[10px] opacity-60">
                                CI {apptCI(a)}
                              </span>
                            )}
                            {isQuickConsult(a) && (
                              <span className="truncate text-[10px] text-amber-600">
                                sin registrar
                              </span>
                            )}
                            {showActions && (
                              <div
                                className="mt-auto shrink-0 pt-0.5"
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
      </div>

      {!isOverview && appts.length === 0 && (
        <p className="mt-2 text-center text-sm text-slate-500">
          {canWrite ? "Día libre — hacé clic en una franja para agendar." : "Sin citas este día."}
        </p>
      )}
    </div>
  );
}
