"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Send, MessageCircle } from "lucide-react";
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
import { WhatsAppManualModal } from "./WhatsAppManualModal";
import {
  buildDoctorColorResolver,
  DoctorColorContext,
} from "@/lib/agenda/doctorColor";
import { toast } from "@/lib/toast";

export type AgendaView = "day" | "week" | "month" | "overview";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type ModalState = { start: Date; end: Date; appt?: MonthAppt; dentist?: string };

const VIEW_LABELS: Record<AgendaView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  overview: "Doctores", // mantenido solo para compatibilidad de tipo
};

// Opción especial: muestra TODAS las columnas de doctores en DayView
const ALL_DOCTORS = "__all__";

export function AgendaShell({
  patients,
  appts,
  date,
  view,
  canWrite,
  doctors,
  isAdmin,
  myName,
  whatsappEnabled,
  whatsappManualEnabled,
}: {
  patients: PatientOption[];
  appts: MonthAppt[];
  date: string;
  view: AgendaView;
  canWrite: boolean;
  doctors: DoctorOption[];
  isAdmin: boolean;
  /** Nombre completo del usuario logueado (para preseleccionar "Mi Agenda") */
  myName: string;
  whatsappEnabled: boolean;
  whatsappManualEnabled: boolean;
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(
    view === "day" ? date : null,
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [linkAppt, setLinkAppt] = useState<MonthAppt | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showWaManual, setShowWaManual] = useState(false);
  // Filtro de doctor: nombre del doctor, ALL_DOCTORS para todos, o myName por defecto.
  // Solo el admin puede cambiar esto; el resto siempre ve solo sus citas (filtradas en servidor).
  const [activeDoctor, setActiveDoctor] = useState<string>(myName);

  // Resolver de color por doctor SIN colisiones: cada doctor recibe un color
  // distinto según su posición (ordenado por nombre). Compartido vía contexto.
  const doctorColor = useMemo(
    () => buildDoctorColorResolver(doctors.map((d) => d.full_name)),
    [doctors],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, MonthAppt[]>();
    for (const a of appts) {
      const k = dayKey(new Date(a.starts_at));
      (map.get(k) ?? map.set(k, []).get(k)!).push(a);
    }
    return map;
  }, [appts]);

  // byDay filtrado según activeDoctor (aplica a day, week y month).
  const filteredByDay = useMemo(() => {
    if (activeDoctor === ALL_DOCTORS) return byDay;
    const map = new Map<string, MonthAppt[]>();
    for (const [k, list] of byDay) {
      const filtered = list.filter(
        (a) => (a.dentist_name?.trim() || "") === activeDoctor,
      );
      if (filtered.length) map.set(k, filtered);
    }
    return map;
  }, [byDay, activeDoctor]);

  // columnas forzadas para DayView: si es ALL_DOCTORS → una columna por doctor;
  // si hay un doctor específico → una sola columna con su nombre.
  const forcedCols = useMemo<string[] | undefined>(() => {
    if (!isAdmin) return undefined; // no-admin: sin columnas forzadas
    if (activeDoctor === ALL_DOCTORS)
      return doctors.map((d) => d.full_name);
    return [activeDoctor];
  }, [activeDoctor, doctors, isAdmin]);

  // Vistas disponibles: siempre solo Día / Semana / Mes ("Doctores" ya no existe como botón).
  const views: AgendaView[] = ["day", "week", "month"];

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

  async function sendReminders() {
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-reminders", { method: "POST" });
      const body = await res.json();
      if (res.ok) toast("Recordatorios enviados", "success");
      else toast(body.error ?? "No se pudieron enviar los recordatorios", "error");
    } catch {
      toast("Error de conexión con el servicio de WhatsApp", "error");
    } finally {
      setSending(false);
    }
  }

  const base = new Date(date + "T00:00:00");
  const monthLabel =
    view === "day"
      ? base.toLocaleDateString("es-BO", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : base.toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  // Compartido por todas las vistas que muestran DayView
  const dayViewHandlers = {
    onPick: (start: Date, end: Date, dentist?: string) =>
      setModal({ start, end, dentist }),
    onEdit: (a: MonthAppt) =>
      setModal({
        start: new Date(a.starts_at),
        end: a.ends_at
          ? new Date(a.ends_at)
          : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
        appt: a,
      }),
    onLink: (a: MonthAppt) => setLinkAppt(a),
  };

  return (
    <DoctorColorContext.Provider value={doctorColor}>
    <div className="space-y-4">
      <SearchBar onSearch={runSearch} message={searchMsg} />

      {/* Barra de controles: Toggle de vista | Dropdown doctor | Navegación */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Botones Día / Semana / Mes */}
        <div className="relative flex rounded-lg bg-slate-100 p-0.5 text-sm shadow-inner">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`relative z-10 rounded-md px-3 py-1.5 capitalize transition-colors duration-150 ${
                view === v
                  ? "bg-white font-semibold text-clinic shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Dropdown de doctor — permanente, solo visible para admin */}
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            {activeDoctor !== ALL_DOCTORS && activeDoctor && (
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${doctorColor(activeDoctor).dot}`}
              />
            )}
            <select
              value={activeDoctor}
              onChange={(e) => setActiveDoctor(e.target.value)}
              className="rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-sm font-medium text-slate-700 shadow-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            >
              <option value={myName}>Mi Agenda</option>
              <option value={ALL_DOCTORS}>Todos los doctores</option>
              {doctors
                .filter((d) => d.full_name !== myName)
                .map((d) => (
                  <option key={d.id} value={d.full_name}>
                    {d.full_name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Navegación anterior / hoy / siguiente */}
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

        {canWrite && (whatsappEnabled || whatsappManualEnabled) && (
          <div className="ml-auto flex items-center gap-2">
            {whatsappEnabled && (
              <button
                onClick={sendReminders}
                disabled={sending}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? "Enviando..." : "Enviar recordatorios"}
              </button>
            )}
            {whatsappManualEnabled && (
              <button
                onClick={() => setShowWaManual(true)}
                className="flex items-center gap-1.5 rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Enviar recordatorios
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vista Mes: calendario filtrado + DayView del día seleccionado */}
      {view === "month" && (
        <>
          <MonthView
            month={date}
            byDay={filteredByDay}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          {selectedDay && (
            <DayView
              day={selectedDay}
              appts={filteredByDay.get(selectedDay) ?? []}
              canWrite={canWrite}
              highlightId={highlightId}
              forcedColumns={forcedCols}
              {...dayViewHandlers}
            />
          )}
        </>
      )}

      {/* Vista Día filtrada */}
      {view === "day" && (
        <DayView
          day={date}
          appts={filteredByDay.get(date) ?? []}
          canWrite={canWrite}
          highlightId={highlightId}
          forcedColumns={forcedCols}
          {...dayViewHandlers}
        />
      )}

      {/* Vista Semana filtrada */}
      {view === "week" && (
        <WeekView
          date={date}
          byDay={filteredByDay}
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
          onLink={(a) => setLinkAppt(a)}
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
      {showWaManual && (
        <WhatsAppManualModal onClose={() => setShowWaManual(false)} />
      )}
    </div>
    </DoctorColorContext.Provider>
  );
}
