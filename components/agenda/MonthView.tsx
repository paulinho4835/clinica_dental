"use client";

import { useMemo, useRef, useState } from "react";
import { type MonthAppt } from "./apptHelpers";
import { useDoctorColor } from "@/lib/agenda/doctorColor";
import { boliviaTodayISO } from "@/lib/format";
import { blocksForDay, type AvailabilityBlock } from "@/lib/availability";

const hhmm = (t: string) => t.slice(0, 5);
const isFullDayBlock = (b: AvailabilityBlock) =>
  hhmm(b.start_time) <= "08:00" && hhmm(b.end_time) >= "20:00";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Umbrales del swipe: distancia mínima para cambiar de mes, y dominancia
// horizontal para no confundir el gesto con el scroll vertical de la página.
const SWIPE_MIN_PX = 60;
const SWIPE_INTENT_PX = 12;

export function MonthView({
  month, // YYYY-MM-DD (cualquier día del mes visible)
  byDay,
  selectedDay,
  onSelectDay,
  onSwipeMonth,
  availability,
  selectedDoctor,
  allDoctors,
}: {
  month: string;
  byDay: Map<string, MonthAppt[]>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  /** Swipe horizontal (móvil): -1 mes anterior, +1 mes siguiente. */
  onSwipeMonth?: (delta: 1 | -1) => void;
  /** Addon "Disponibilidad": bloques de no disponibilidad para pintar como chip. */
  availability?: AvailabilityBlock[];
  /** Doctor filtrado en el dropdown de la agenda (null = "Todos"). */
  selectedDoctor?: string | null;
  /** Con "Todos" (selectedDoctor=null): nombres de doctores a considerar. */
  allDoctors?: string[];
}) {
  const getDoctorColor = useDoctorColor();
  const base = new Date(month + "T00:00:00");
  const year = base.getFullYear();
  const mon = base.getMonth();
  const todayKey = boliviaTodayISO();

  // ── Swipe táctil estilo Google Calendar ────────────────────────────────────
  // El dedo arrastra la grilla en vivo (translateX); al soltar, si el gesto
  // superó el umbral se navega al mes vecino, si no vuelve a su lugar.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const [dragX, setDragX] = useState(0);
  // Copia síncrona de dragX: en un flick rápido el touchend llega antes del
  // re-render y el estado del closure quedaría viejo (el swipe se ignoraría).
  const lastDx = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    dragging.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (!dragging.current) {
      // Decidir la intención una sola vez: claramente horizontal → swipe;
      // claramente vertical → dejar el scroll normal de la página en paz.
      if (Math.abs(dx) > SWIPE_INTENT_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
        dragging.current = true;
      } else if (Math.abs(dy) > SWIPE_INTENT_PX) {
        touchStart.current = null;
        return;
      }
    }
    if (dragging.current) {
      lastDx.current = dx;
      setDragX(dx);
    }
  }

  function onTouchEnd() {
    const dx = lastDx.current;
    if (dragging.current && Math.abs(dx) > SWIPE_MIN_PX && onSwipeMonth) {
      // Deslizar a la izquierda = avanzar al mes siguiente (como GCal).
      onSwipeMonth(dx < 0 ? 1 : -1);
    }
    setDragX(0);
    lastDx.current = 0;
    touchStart.current = null;
    dragging.current = false;
  }

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
      {/* touch-pan-y: el navegador conserva el scroll vertical; el horizontal
          lo manejamos nosotros. Sin transición mientras se arrastra para que
          la grilla siga al dedo sin lag. */}
      <div
        className={`grid touch-pan-y grid-cols-7 ${dragX === 0 ? "transition-transform duration-200" : ""}`}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === mon;
          const dayAppts = byDay.get(k) ?? [];
          const isSelected = selectedDay === k;
          const isToday = k === todayKey;

          // Bloques de no disponibilidad ese día: del doctor filtrado, o de
          // todos los doctores (admin/odontólogo/colega/especialista) con
          // "Todos" seleccionado. Array pequeño (bloques del mes) — no vale la
          // pena memoizar por celda.
          const dayBlocks: AvailabilityBlock[] =
            inMonth && availability && availability.length > 0
              ? blocksForDay(k, availability).filter((b) =>
                  selectedDoctor
                    ? b.dentist_name.trim() === selectedDoctor.trim()
                    : allDoctors && allDoctors.length > 0
                      ? allDoctors.some((n) => n.trim() === b.dentist_name.trim())
                      : false,
                )
              : [];

          return (
            <button
              key={k}
              type="button"
              disabled={!inMonth}
              onClick={() => onSelectDay(k)}
              className={`flex min-h-[84px] flex-col items-start gap-1 border-b border-r border-slate-100 p-2 text-left transition sm:min-h-[68px] ${
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
              {dayBlocks.length > 0 && (() => {
                const detail = dayBlocks
                  .map(
                    (b) =>
                      `${selectedDoctor ? "" : b.dentist_name + " "}${
                        isFullDayBlock(b)
                          ? "todo el día"
                          : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`
                      }${b.reason ? ` (${b.reason})` : ""}`,
                  )
                  .join(" · ");
                const label = selectedDoctor
                  ? isFullDayBlock(dayBlocks[0]) && dayBlocks.length === 1
                    ? "No disp. todo el día"
                    : `No disp. ${dayBlocks
                        .map((b) => hhmm(b.start_time) + "–" + hhmm(b.end_time))
                        .join(", ")}`
                  : `${dayBlocks.length} no disp.`;
                return (
                  <div
                    title={detail}
                    className="flex w-full items-center gap-1 truncate rounded bg-slate-200/70 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-600/40"
                  >
                    <span className="truncate">{label}</span>
                  </div>
                );
              })()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
