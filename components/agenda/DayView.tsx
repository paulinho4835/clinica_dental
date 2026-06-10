"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  apptBlockClass,
  isFinished,
} from "./apptHelpers";
import { getDoctorColor } from "@/lib/agenda/doctorColor";
import {
  useDrag,
  applyOptimisticMove,
  revertMove,
  type SlotTarget,
} from "@/lib/agenda/dragDrop";
import { MiniStatus } from "./MiniStatus";
import { X, Pencil, Link } from "lucide-react";

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

import { ApptPopover, type PopoverAppt } from "./ApptPopover";

// ─────────────────────────────────────────────────────────────────────────────

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
  /** Cuando se pasa, se usan estos nombres como columnas fijas (vista con doctores). */
  forcedColumns?: string[];
}) {
  const [y, m, d] = day.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  // ── Popover state ──────────────────────────────────────────────────────────
  const [popover, setPopover] = useState<PopoverAppt | null>(null);

  function openPopover(appt: MonthAppt, el: HTMLElement) {
    setPopover({ appt, anchor: el.getBoundingClientRect() });
  }

  // Optimistic state para drag-to-move
  const [localAppts, setLocalAppts] = useState<MonthAppt[]>(appts);
  const [shakingId, setShakingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalAppts(appts);
    setPopover((prev) =>
      prev ? { ...prev, appt: appts.find((a) => a.id === prev.appt.id) ?? prev.appt } : null,
    );
  }, [appts]);

  const handleDrop = useCallback(
    async (apptId: string, slot: SlotTarget) => {
      const movedAppt = appts.find((a) => a.id === apptId);
      if (!movedAppt) return;

      const oldTime = new Date(movedAppt.starts_at);
      const [h, m] = slot.time.split(":").map(Number);
      
      // Si la cita no se movió de su hora original, ignorar el drop (fue un simple clic)
      if (oldTime.getHours() === h && oldTime.getMinutes() === m) {
        return;
      }

      const updated = applyOptimisticMove(appts, apptId, slot.date, slot.time);
      setLocalAppts(updated);
      try {
        const moved = updated.find((a) => a.id === apptId)!;
        const res = await fetch(`/api/appointments/${apptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starts_at: moved.starts_at, ends_at: moved.ends_at }),
        });
        if (!res.ok) throw new Error("patch failed");
      } catch {
        setLocalAppts(revertMove(updated, appts));
        setShakingId(apptId);
        setTimeout(() => setShakingId(null), 400);
      }
    },
    [appts],
  );

  const { ghostSlot, dragHandlers, isDragging } = useDrag({
    axisH: AXIS_H,
    day,
    onDrop: handleDrop,
  });

  const columns = useMemo<(string | null)[]>(() => {
    if (forcedColumns && forcedColumns.length > 0) return forcedColumns;
    const names = dentistColumns(localAppts);
    return names.length > 1 ? names : [null];
  }, [localAppts, forcedColumns]);

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
        <span className="text-xs text-slate-400">{localAppts.length} cita(s)</span>
      </div>

      {/* ── Grilla horaria ─────────────────────────────────────────────── */}
      <div className="flex">
        {/* Eje de horas */}
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

        {/* Columnas de doctores / columna única */}
        <div className={isOverview ? "flex-1 overflow-x-auto" : "flex flex-1 gap-1"}>
          <div className={`flex gap-1 ${isOverview ? "min-w-max" : "flex-1"}`}>
            {columns.map((col) => {
              const colAppts =
                col === null
                  ? localAppts
                  : localAppts.filter(
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

                  {/* Carril de citas — overflow visible para que el anillo de selección no se corte */}
                  <div
                    data-agenda-col
                    className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100"
                    style={{ height: AXIS_H }}
                  >
                    {/* Líneas divisoras de hora */}
                    {HOURS.slice(1, -1).map((h, i) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
                        style={{ top: ((i + 1) / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
                      />
                    ))}

                    {/* Slots clicables para crear nueva cita */}
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

                    {/* Estado vacío en modo multi-columna */}
                    {isOverview && colAppts.length === 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-[11px] text-slate-300">Sin citas</span>
                      </div>
                    )}

                    {/* Ghost slot durante drag */}
                    {ghostSlot && (() => {
                      const [gh, gm] = ghostSlot.time.split(":").map(Number);
                      const [gY, gMo, gD] = day.split("-").map(Number);
                      const gDate = new Date(gY, gMo - 1, gD, gh, gm);
                      const gEnd = new Date(gDate.getTime() + 30 * 60_000);
                      const gg = blockGeometry(gDate, gEnd);
                      return (
                        <div
                          key="ghost"
                          className="pointer-events-none absolute inset-x-0 z-30 animate-ghost-pulse rounded border-2 border-dashed border-clinic bg-clinic/20"
                          style={{ top: gg.top * AXIS_H, height: Math.max(gg.height * AXIS_H, 20) }}
                        />
                      );
                    })()}

                    {/* Bloques de cita */}
                    {laid.map(({ appt: a, lane, lanes }) => {
                      const doctorLabel =
                        isOverview && columns.length > 1 && a.dentist_name?.trim()
                          ? a.dentist_name.trim()
                          : null;
                      const s = new Date(a.starts_at);
                      const e = a.ends_at
                        ? new Date(a.ends_at)
                        : new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, e);
                      const naturalH = g.height * AXIS_H;
                      const blockH = Math.max(naturalH, 28);
                      const tall = blockH >= 52;
                      const col2 = getDoctorColor(a.dentist_name ?? "");
                      const isOpen = popover?.appt.id === a.id;
                      const isHit = highlightId === a.id;

                      return (
                        <div
                          key={a.id}
                          className="absolute"
                          style={{
                            top: g.top * AXIS_H,
                            height: blockH,
                            left: `${(lane / lanes) * 100}%`,
                            width: `${(1 / lanes) * 100}%`,
                            zIndex: isOpen ? 50 : 10,
                          }}
                        >
                          <div
                            role={canWrite ? "button" : undefined}
                            tabIndex={canWrite ? 0 : undefined}
                            aria-label={`Cita: ${apptName(a)}`}
                            aria-pressed={isOpen}
                            onClick={(ev) => {
                              if (!canWrite) return;
                              if (isDragging(a.id)) return;
                              ev.stopPropagation();
                              if (isOpen) {
                                setPopover(null);
                              } else {
                                openPopover(a, ev.currentTarget as HTMLElement);
                              }
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" && canWrite) {
                                openPopover(a, ev.currentTarget as HTMLElement);
                              }
                            }}
                            {...(canWrite ? dragHandlers(a.id) : {})}
                            style={{ touchAction: "none" }}
                            className={[
                              "relative flex h-full w-full flex-col overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] transition select-none",
                              col2.bg,
                              col2.border,
                              col2.text,
                              "border",
                              apptBlockClass(a.status),
                              isOpen ? "ring-2 ring-clinic shadow-lg brightness-95" : "",
                              isDragging(a.id)
                                ? "scale-105 shadow-xl opacity-90 cursor-grabbing"
                                : canWrite
                                  ? "cursor-pointer hover:shadow-md"
                                  : "cursor-default",
                              shakingId === a.id ? "animate-shake" : "",
                              isHit ? "animate-flash ring-2 ring-clinic" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {isFinished(a.status) && (
                              <span className="absolute right-1 top-0.5 text-[10px] font-bold opacity-70">✓</span>
                            )}
                            <span className="block truncate leading-tight">
                              <span className="tabular-nums opacity-70">{hhmm(s)}</span>{" "}
                              <span className={`font-medium ${a.status === "no_show" ? "line-through" : ""}`}>
                                {apptName(a)}
                              </span>
                            </span>
                            {tall && a.reason && (
                              <span className="block truncate text-[10px] italic text-slate-500">
                                {a.reason}
                              </span>
                            )}
                            {tall && doctorLabel && (
                              <span className="block truncate text-[10px] font-medium text-slate-400">
                                {doctorLabel}
                              </span>
                            )}
                            {tall && apptCI(a) && (
                              <span className="block truncate text-[10px] opacity-60">
                                CI {apptCI(a)}
                              </span>
                            )}
                            {isQuickConsult(a) && (
                              <span className="block truncate text-[10px] text-amber-600">
                                sin registrar
                              </span>
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

      {!isOverview && localAppts.length === 0 && (
        <p className="mt-2 text-center text-sm text-slate-500">
          {canWrite ? "Día libre — hacé clic en una franja para agendar." : "Sin citas este día."}
        </p>
      )}

      {/* Popover flotante — montado en document.body via portal, escapa de todo overflow */}
      {popover && (
        <ApptPopover
          appt={popover.appt}
          anchor={popover.anchor}
          canWrite={canWrite}
          onEdit={() => { onEdit(popover.appt); setPopover(null); }}
          onLink={() => { onLink(popover.appt); setPopover(null); }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
