"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { STEP_MIN, buildTimeline, mins } from "@/lib/agenda";
import { type PatientOption } from "./PatientPicker";
import { SearchBar } from "./SearchBar";
import { MonthView } from "./MonthView";
import { MiniStatus } from "./MiniStatus";
import { ApptModal } from "./ApptModal";
import { LinkPatientModal } from "./LinkPatientModal";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  apptCI,
  isQuickConsult,
  apptRowStyle,
  apptNameColor,
} from "./apptHelpers";

export type AgendaView = "day" | "week" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

type ModalState = { start: Date; end: Date; appt?: MonthAppt; dentist?: string };

export function AgendaShell({
  patients,
  appts,
  date,
  view,
  canWrite,
  doctors,
}: {
  patients: PatientOption[];
  appts: MonthAppt[];
  date: string;
  view: AgendaView;
  canWrite: boolean;
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(
    view === "day" ? date : null,
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [linkAppt, setLinkAppt] = useState<MonthAppt | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, MonthAppt[]>();
    for (const a of appts) {
      const k = dayKey(new Date(a.starts_at));
      (map.get(k) ?? map.set(k, []).get(k)!).push(a);
    }
    return map;
  }, [appts]);

  function setView(next: AgendaView) {
    router.push(`/agenda?date=${date}&view=${next}`);
  }

  function shift(delta: number) {
    const d = new Date(date + "T00:00:00");
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    router.push(`/agenda?date=${dayKey(d)}&view=${view}`);
  }

  function goToday() {
    router.push(`/agenda?date=${dayKey(new Date())}&view=${view}`);
  }

  function runSearch(raw: string) {
    const q = raw.trim().toLowerCase();
    setSearchMsg(null);
    setHighlightId(null);
    if (!q) return;
    const matches = (a: MonthAppt) =>
      apptName(a).toLowerCase().includes(q) ||
      (apptCI(a) ?? "").toLowerCase().includes(q);
    const hit = appts.find(matches);
    if (!hit) {
      setSearchMsg(`Sin citas para "${raw.trim()}" en este mes.`);
      return;
    }
    const k = dayKey(new Date(hit.starts_at));
    setSelectedDay(k);
    setHighlightId(hit.id);
    if (view !== "day") router.push(`/agenda?date=${k}&view=day`);
  }

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const base = new Date(date + "T00:00:00");
  const monthLabel = base.toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <SearchBar onSearch={runSearch} message={searchMsg} />

      {/* Toggle de vista + navegación */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 py-1.5 capitalize transition ${
                view === v ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
              }`}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <button
          onClick={() => shift(-1)}
          aria-label="Anterior"
          className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={goToday}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Hoy
        </button>
        <button
          onClick={() => shift(1)}
          aria-label="Siguiente"
          className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-2 text-lg font-semibold capitalize text-slate-700">
          {monthLabel}
        </span>
      </div>

      {/* Vista Mes: calendario + timeline del día seleccionado */}
      {view === "month" && (
        <>
          <MonthView
            month={date}
            byDay={byDay}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          {selectedDay && (
            <DayTimeline
              day={selectedDay}
              appts={byDay.get(selectedDay) ?? []}
              canWrite={canWrite}
              highlightId={highlightId}
              onPick={(start, end) => setModal({ start, end })}
              onEdit={(a) =>
                setModal({
                  start: new Date(a.starts_at),
                  end: a.ends_at
                    ? new Date(a.ends_at)
                    : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
                  appt: a,
                })
              }
              onLink={(a) => setLinkAppt(a)}
            />
          )}
        </>
      )}

      {/* Modales compartidos por todas las vistas */}
      {modal && (
        <ApptModal
          patients={patients}
          doctors={doctors}
          start={modal.start}
          end={modal.end}
          appt={modal.appt}
          dentist={modal.dentist}
          onClose={() => setModal(null)}
        />
      )}
      {linkAppt && (
        <LinkPatientModal
          patients={patients}
          appt={linkAppt}
          onClose={() => setLinkAppt(null)}
        />
      )}
    </div>
  );
}

// ─── DayTimeline (temporal — se reemplaza por DayView en Task 8) ──────────────
function DayTimeline({
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
  onPick: (start: Date, end: Date) => void;
  onEdit: (a: MonthAppt) => void;
  onLink: (a: MonthAppt) => void;
}) {
  const [y, m, d] = day.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const segments = buildTimeline(day, appts);

  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold capitalize text-slate-700">{dayLabel}</h2>
        <span className="text-xs text-slate-400">{appts.length} cita(s)</span>
      </div>

      <div className="space-y-1.5">
        {segments.map((seg) => {
          if (seg.type === "busy") {
            return (
              <div
                key={seg.start.toISOString()}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="tabular-nums font-medium text-slate-600">
                    {hhmm(seg.start)}–{hhmm(seg.end)}
                  </span>
                  <span className="text-xs text-slate-400">({mins(seg.start, seg.end)} min)</span>
                </div>
                <ul className="space-y-1">
                  {seg.appts.map((a) => {
                    const s = new Date(a.starts_at);
                    const e = a.ends_at
                      ? new Date(a.ends_at)
                      : new Date(s.getTime() + STEP_MIN * 60_000);
                    const isHit = highlightId === a.id;
                    return (
                      <li
                        key={a.id}
                        ref={isHit ? highlightRef : null}
                        className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${isHit ? "animate-flash ring-2 ring-clinic" : ""} ${!isHit ? apptRowStyle(a.status) : "bg-clinic/10"}`}
                      >
                        <span className="tabular-nums text-xs text-slate-500">
                          {hhmm(s)}–{hhmm(e)}
                        </span>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => onEdit(a)}
                          title={canWrite ? "Editar cita" : undefined}
                          className={`flex-1 truncate text-left font-medium enabled:hover:underline disabled:cursor-default ${apptNameColor(a.status)}`}
                        >
                          {apptName(a)}
                          {apptCI(a) && (
                            <span className="ml-1 text-[11px] font-normal text-slate-400">
                              · CI {apptCI(a)}
                            </span>
                          )}
                          {isQuickConsult(a) && (
                            <span className="ml-1 text-[11px] font-normal text-amber-600">
                              · sin registrar
                            </span>
                          )}
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => onEdit(a)}
                            aria-label="Editar cita"
                            title="Editar cita"
                            className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-clinic"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canWrite && isQuickConsult(a) && (
                          <button
                            type="button"
                            onClick={() => onLink(a)}
                            className="rounded border border-clinic px-2 py-0.5 text-[11px] font-medium text-clinic hover:bg-clinic hover:text-white"
                          >
                            Vincular
                          </button>
                        )}
                        <MiniStatus id={a.id} status={a.status} canWrite={canWrite} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

          const gap = mins(seg.start, seg.end);
          const defaultEnd = new Date(
            Math.min(seg.start.getTime() + STEP_MIN * 60_000, seg.end.getTime()),
          );
          return (
            <button
              key={seg.start.toISOString()}
              type="button"
              disabled={!canWrite}
              onClick={() => onPick(seg.start, defaultEnd)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-green-300 bg-green-50/60 px-3 py-2 text-sm text-green-700 transition enabled:hover:border-green-500 enabled:hover:bg-green-100 disabled:cursor-default disabled:opacity-60"
            >
              <span className="tabular-nums font-medium text-slate-500">
                {hhmm(seg.start)}–{hhmm(seg.end)}
              </span>
              <span className="text-xs text-slate-400">({gap} min libres)</span>
              <span className="flex-1 text-right">{canWrite ? "+ Agendar" : "Libre"}</span>
            </button>
          );
        })}
        {segments.length === 0 && (
          <p className="py-2 text-sm text-slate-500">Día completo ocupado.</p>
        )}
      </div>
    </div>
  );
}
