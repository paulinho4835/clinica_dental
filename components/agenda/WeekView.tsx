"use client";

import { useState, useCallback, useMemo } from "react";
import {
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  assignLanes,
  weekDays,
} from "@/lib/agenda";
import { type MonthAppt, apptName, apptBlockClass } from "./apptHelpers";
import { useDoctorColor } from "@/lib/agenda/doctorColor";
import {
  useDrag,
  applyOptimisticMove,
  revertMove,
  type SlotTarget,
} from "@/lib/agenda/dragDrop";
import { ApptPopover, type PopoverAppt } from "./ApptPopover";
import { rescheduleAppointment } from "@/app/(dashboard)/agenda/actions";

const PX_PER_HOUR = 48;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i);
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => d.toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" });

export function WeekView({
  date,
  byDay,
  canWrite,
  onOpenDay,
  onPick,
  onEdit,
  onLink,
}: {
  date: string;
  byDay: Map<string, MonthAppt[]>;
  canWrite: boolean;
  onOpenDay: (day: string) => void;
  onPick: (start: Date, end: Date) => void;
  onEdit: (a: MonthAppt) => void;
  onLink: (a: MonthAppt) => void;
}) {
  const getDoctorColor = useDoctorColor();
  const days = useMemo(() => weekDays(new Date(date + "T00:00:00")), [date]);
  const todayKey = dayKey(new Date());

  // ── Optimistic state ──────────────────────────────────────────────────────
  const [localAppts, setLocalAppts] = useState<MonthAppt[]>([]);
  const [shakingId, setShakingId] = useState<string | null>(null);

  // ── Popover state ──────────────────────────────────────────────────────────
  const [popover, setPopover] = useState<PopoverAppt | null>(null);

  function openPopover(appt: MonthAppt, el: HTMLElement) {
    setPopover({ appt, anchor: el.getBoundingClientRect() });
  }

  const handleDrop = useCallback(
    async (apptId: string, slot: SlotTarget) => {
      const allAppts = [...byDay.values()].flat();
      const movedAppt = allAppts.find((a) => a.id === apptId);
      if (!movedAppt) return;

      const oldTime = new Date(movedAppt.starts_at);
      const [h, m] = slot.time.split(":").map(Number);
      
      // Si la cita no se movió de su día y hora original, ignorar el drop
      const isSameDate = movedAppt.starts_at.startsWith(slot.date);
      if (isSameDate && oldTime.getHours() === h && oldTime.getMinutes() === m) {
        return;
      }

      const updated = applyOptimisticMove(allAppts, apptId, slot.date, slot.time);
      setLocalAppts(updated);
      try {
        const moved = updated.find((a) => a.id === apptId)!;
        const res = await rescheduleAppointment(apptId, moved.starts_at, moved.ends_at);
        if (res.error) throw new Error(res.error);
      } catch {
        setLocalAppts(revertMove(updated, allAppts));
        setShakingId(apptId);
        setTimeout(() => setShakingId(null), 400);
      }
    },
    [byDay],
  );

  // ── Drag hook ─────────────────────────────────────────────────────────────
  // El día de origen/destino se infiere del atributo data-day de cada columna,
  // así que el arrastre funciona entre columnas (días) distintas.
  const { ghostSlot, dragHandlers, isDragging } = useDrag({
    axisH: AXIS_H,
    day: "",
    onDrop: handleDrop,
  });

  // ── Merged byDay (optimistic) ─────────────────────────────────────────────
  const mergedByDay = useMemo(() => {
    if (localAppts.length === 0) return byDay;
    const merged = new Map(byDay);
    for (const [k, arr] of byDay) {
      merged.set(k, arr.map((a) => localAppts.find((l) => l.id === a.id) ?? a));
    }
    return merged;
  }, [byDay, localAppts]);

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
            const dayAppts = mergedByDay.get(k) ?? [];
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
                  data-agenda-col
                  data-day={k}
                  className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100"
                  style={{ height: AXIS_H, overflow: "visible" }}
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
                          aria-label={`Agendar ${WD[idx]} ${pad(s.getHours())}:${pad(s.getMinutes())}`}
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
                    const col = getDoctorColor(a.dentist_name ?? "");
                    const dragging = isDragging(a.id);
                    const isOpen = popover?.appt.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!canWrite}
                        onClick={(ev) => {
                          if (!canWrite) return;
                          if (dragging) return;
                          ev.stopPropagation();
                          if (isOpen) {
                            setPopover(null);
                          } else {
                            openPopover(a, ev.currentTarget as HTMLElement);
                          }
                        }}
                        className={`absolute z-10 overflow-hidden rounded border-l-4 px-1 text-left text-[10px] leading-tight transition select-none ${col.bg} ${col.border} ${col.text} ${apptBlockClass(a.status)} ${isOpen ? "ring-2 ring-clinic shadow-lg brightness-95" : ""} ${dragging ? "scale-105 shadow-lg opacity-90 z-20 cursor-grabbing" : canWrite ? "cursor-grab hover:shadow-md" : "cursor-default"} ${shakingId === a.id ? "animate-shake" : ""}`}
                        style={{
                          top: g.top * AXIS_H,
                          height: Math.max(g.height * AXIS_H, 14),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                          touchAction: "none",
                          zIndex: isOpen ? 50 : 10,
                        }}
                        title={`${hhmm(s)} ${apptName(a)}${a.dentist_name ? " · " + a.dentist_name : ""}`}
                        {...(canWrite ? dragHandlers(a.id) : {})}
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

                  {/* Ghost slot durante drag */}
                  {ghostSlot && ghostSlot.date === k && (() => {
                    const [gh, gm] = ghostSlot.time.split(":").map(Number);
                    const gYear = d.getFullYear();
                    const gMonth = d.getMonth();
                    const gDay = d.getDate();
                    const gDate = new Date(gYear, gMonth, gDay, gh, gm);
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
