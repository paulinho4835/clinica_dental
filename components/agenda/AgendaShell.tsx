"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STEP_MIN } from "@/lib/agenda";
import { type PatientOption } from "./PatientPicker";
import { SearchBar } from "./SearchBar";
import { MonthView } from "./MonthView";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { ApptModal } from "./ApptModal";
import { LinkPatientModal } from "./LinkPatientModal";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  apptCI,
} from "./apptHelpers";

export type AgendaView = "day" | "week" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

      {/* Vista Mes: calendario + DayView del día seleccionado */}
      {view === "month" && (
        <>
          <MonthView
            month={date}
            byDay={byDay}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          {selectedDay && (
            <DayView
              day={selectedDay}
              appts={byDay.get(selectedDay) ?? []}
              canWrite={canWrite}
              highlightId={highlightId}
              onPick={(start, end, dentist) => setModal({ start, end, dentist })}
              onEdit={(a) =>
                setModal({
                  start: new Date(a.starts_at),
                  end: a.ends_at
                    ? new Date(a.ends_at)
                    : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
                  appt: a,
                })
              }
            />
          )}
        </>
      )}

      {/* Vista Día */}
      {view === "day" && (
        <DayView
          day={date}
          appts={byDay.get(date) ?? []}
          canWrite={canWrite}
          highlightId={highlightId}
          onPick={(start, end, dentist) => setModal({ start, end, dentist })}
          onEdit={(a) =>
            setModal({
              start: new Date(a.starts_at),
              end: a.ends_at
                ? new Date(a.ends_at)
                : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
              appt: a,
            })
          }
        />
      )}

      {/* Vista Semana */}
      {view === "week" && (
        <WeekView
          date={date}
          byDay={byDay}
          canWrite={canWrite}
          onOpenDay={(k) => router.push(`/agenda?date=${k}&view=day`)}
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
        />
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
