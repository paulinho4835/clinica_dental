"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Send, MessageCircle, Printer, Stethoscope, Plus } from "lucide-react";
import { STEP_MIN, OPEN_HOUR, CLOSE_HOUR, boliviaMinutesOfDay } from "@/lib/agenda";
import { boliviaTodayISO, boliviaDateISO } from "@/lib/format";
import { type PatientOption } from "./PatientPicker";
import { SearchBar } from "./SearchBar";
import { MonthView } from "./MonthView";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { ApptModal } from "./ApptModal";
import { type QuickDraft } from "./QuickCreatePopover";
import { LinkPatientModal } from "./LinkPatientModal";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  apptCI,
} from "./apptHelpers";
import { WhatsAppManualModal } from "./WhatsAppManualModal";
import { DoctorAgendaWhatsAppModal } from "./DoctorAgendaWhatsAppModal";
import { StatusLegend } from "./StatusLegend";
import {
  buildDoctorColorResolver,
  DoctorColorContext,
} from "@/lib/agenda/doctorColor";
import { toast } from "@/lib/toast";
import { type AvailabilityBlock } from "@/lib/availability";

export type AgendaView = "day" | "week" | "month" | "overview";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type ModalState = {
  start: Date;
  end: Date;
  appt?: MonthAppt;
  dentist?: string;
  /** Lo ya escrito en el popover rápido, al pulsar "Más opciones". */
  prefill?: QuickDraft;
};

const VIEW_LABELS: Record<AgendaView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  overview: "Doctores", // mantenido solo para compatibilidad de tipo
};

// Opción especial: muestra TODAS las columnas de doctores en DayView
const ALL_DOCTORS = "__all__";

// Etiqueta con la que el agente IA de WhatsApp guarda sus citas (dentist_name)
// cuando el paciente no eligió doctor. Debe coincidir con AI_DENTIST de
// lib/agent/tools.ts. Se ofrece como opción de filtro solo si hay citas así en
// el rango visible, para que no queden invisibles en "Mi Agenda".
const AI_DENTIST = "Asistente Virtual";

export function AgendaShell({
  patients,
  appts,
  date,
  view,
  canWrite,
  doctors,
  isAdmin,
  myName,
  recordatoriosEnabled,
  whatsappManualEnabled,
  avisoDoctoresEnabled,
  availability = [],
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
  /** Addon "Recordatorios Automáticos": muestra el botón de envío por Baileys. */
  recordatoriosEnabled: boolean;
  whatsappManualEnabled: boolean;
  avisoDoctoresEnabled: boolean;
  /** Addon "Disponibilidad": bloques de no disponibilidad para pintar en gris. */
  availability?: AvailabilityBlock[];
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
  const [showDoctorAviso, setShowDoctorAviso] = useState(false);
  // Filtro de doctor: nombre del doctor, ALL_DOCTORS para todos, o myName por defecto.
  // Solo el admin puede cambiar esto; el resto siempre ve solo sus citas (filtradas en servidor).
  const [activeDoctor, setActiveDoctor] = useState<string>(myName);
  // Filtro por estado (multi-selección). Vacío = se muestran todos los estados.
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());

  function toggleStatus(status: string) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  // Resolver de color por doctor SIN colisiones: cada doctor recibe un color
  // distinto según su posición (ordenado por nombre). Compartido vía contexto.
  const doctorColor = useMemo(
    () => buildDoctorColorResolver(doctors.map((d) => d.full_name)),
    [doctors],
  );

  // ¿Hay citas agendadas por el agente IA en el rango cargado? Si sí, se agrega
  // "Inteligencia Artificial" al dropdown y a las columnas de la vista Día.
  const hasAI = useMemo(
    () => appts.some((a) => a.dentist_name?.trim() === AI_DENTIST),
    [appts],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, MonthAppt[]>();
    for (const a of appts) {
      const k = boliviaDateISO(new Date(a.starts_at));
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

  // Segunda etapa: filtra por estado encima del filtro de doctor. Alimenta las
  // tres vistas. Vacío = sin filtro, devuelve filteredByDay tal cual.
  const visibleByDay = useMemo(() => {
    if (activeStatuses.size === 0) return filteredByDay;
    const map = new Map<string, MonthAppt[]>();
    for (const [k, list] of filteredByDay) {
      const filtered = list.filter((a) => activeStatuses.has(a.status));
      if (filtered.length) map.set(k, filtered);
    }
    return map;
  }, [filteredByDay, activeStatuses]);

  // Alcance para los conteos de la leyenda (antes del filtro de estado, para que
  // los números no cambien al alternar chips). Día → ese día; mes con día
  // seleccionado → ese día; resto → toda la ventana cargada.
  const scopeAppts = useMemo<MonthAppt[]>(() => {
    if (view === "day") return filteredByDay.get(date) ?? [];
    if (view === "month" && selectedDay)
      return filteredByDay.get(selectedDay) ?? [];
    return [...filteredByDay.values()].flat();
  }, [view, date, selectedDay, filteredByDay]);

  const statusCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const a of scopeAppts) counts[a.status] = (counts[a.status] ?? 0) + 1;
    return counts;
  }, [scopeAppts]);

  // columnas forzadas para DayView: si es ALL_DOCTORS → una columna por doctor;
  // si hay un doctor específico → una sola columna con su nombre.
  const forcedCols = useMemo<string[] | undefined>(() => {
    if (!isAdmin) return undefined; // no-admin: sin columnas forzadas
    if (activeDoctor === ALL_DOCTORS)
      return [...doctors.map((d) => d.full_name), ...(hasAI ? [AI_DENTIST] : [])];
    return [activeDoctor];
  }, [activeDoctor, doctors, isAdmin, hasAI]);

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
    router.push(`/agenda?date=${boliviaTodayISO()}&view=${view}`);
  }

  // Abre la hoja imprimible del día enfocado (en mes, el día seleccionado).
  // Pasa el doctor activo si hay uno específico filtrado.
  function openPrint() {
    const printDate = view === "month" && selectedDay ? selectedDay : date;
    const params = new URLSearchParams();
    if (activeDoctor && activeDoctor !== ALL_DOCTORS) params.set("doctor", activeDoctor);
    const qs = params.toString();
    window.open(`/agenda/${printDate}${qs ? `?${qs}` : ""}`, "_blank");
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
    const k = boliviaDateISO(new Date(hit.starts_at));
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

  // Botón explícito "+ Nueva cita": antes solo se podía agendar haciendo clic
  // en una casilla vacía de las vistas Día/Semana, lo cual no es obvio (en Mes
  // no existía ninguna forma). Calcula una hora de inicio razonable: si el día
  // de referencia es hoy, la próxima media hora libre dentro del horario de
  // atención; si es otro día, las 9:00.
  function openNewAppt() {
    const baseDay = view === "month" && selectedDay ? selectedDay : date;
    const day = new Date(baseDay + "T00:00:00");
    const isToday = baseDay === boliviaTodayISO();

    let start: Date;
    if (isToday) {
      const nowMin = boliviaMinutesOfDay(new Date());
      const nowHour = Math.floor(nowMin / 60);
      const roundedMin = Math.ceil((nowMin % 60) / STEP_MIN) * STEP_MIN;
      start = new Date(day);
      start.setHours(nowHour, roundedMin, 0, 0);
      const openTime = new Date(day);
      openTime.setHours(OPEN_HOUR, 0, 0, 0);
      const lastSlot = new Date(day);
      lastSlot.setHours(CLOSE_HOUR, -STEP_MIN, 0, 0);
      if (start < openTime) start = openTime;
      if (start > lastSlot) start = lastSlot;
    } else {
      start = new Date(day);
      start.setHours(Math.min(9, CLOSE_HOUR - 1), 0, 0, 0);
    }
    const end = new Date(start.getTime() + STEP_MIN * 60_000);
    setModal({ start, end });
  }

  // Clic en una fecha del calendario (vista Mes): flujo estilo Google Calendar.
  // Ya NO abre el formulario de golpe: selecciona el día (la fecha queda
  // capturada — la grilla de abajo se renderiza con ese día) y hace scroll
  // suave hasta ella, con un resaltado breve para guiar la vista. Ahí el
  // usuario elige la hora clickeando una franja, y la tarjeta rápida se abre
  // con fecha y hora ya rellenas.
  const dayDetailRef = useRef<HTMLDivElement>(null);
  // Contador-disparador: cambia en cada clic (aunque sea el mismo día), para
  // que el scroll/resaltado se repita también al re-seleccionar.
  const [dayFocusTick, setDayFocusTick] = useState(0);

  function handleSelectDay(k: string) {
    setSelectedDay(k);
    setDayFocusTick(Date.now());
  }

  useEffect(() => {
    if (!dayFocusTick || !selectedDay) return;
    // Corre después del render: la grilla del día ya está montada.
    dayDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setDayFocusTick(0), 1600); // apaga el resaltado
    return () => clearTimeout(t);
  }, [dayFocusTick, selectedDay]);

  // Escalada del popover rápido al modal completo: conserva lo ya escrito
  // (paciente, motivo, doctor) y las horas que el usuario haya ajustado ahí.
  function openFullModal(
    start: Date,
    end: Date,
    dentist?: string,
    draft?: QuickDraft,
  ) {
    if (!draft) {
      setModal({ start, end, dentist });
      return;
    }
    const at = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(start);
      d.setHours(h, m, 0, 0);
      return d;
    };
    setModal({
      start: at(draft.startTime),
      end: at(draft.endTime),
      dentist: draft.dentistName || dentist,
      prefill: draft,
    });
  }

  // Compartido por todas las vistas que muestran DayView
  const dayViewHandlers = {
    onPick: openFullModal,
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
              {hasAI && <option value={AI_DENTIST}>{AI_DENTIST}</option>}
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

        {/* "+ Nueva cita" en la barra (escritorio). En móvil vive como botón
            flotante abajo a la derecha — ver al final del componente. */}
        {canWrite && (
          <button
            onClick={openNewAppt}
            className="ml-auto hidden items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg sm:flex"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva cita
          </button>
        )}

        <button
          onClick={openPrint}
          title="Imprimir agenda del día"
          className={`flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 ${canWrite ? "" : "ml-auto"}`}
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Imprimir día</span>
        </button>

        {canWrite && (recordatoriosEnabled || whatsappManualEnabled) && (
          <div className="flex items-center gap-2">
            {recordatoriosEnabled && (
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

        {canWrite && avisoDoctoresEnabled && (
          <button
            onClick={() => setShowDoctorAviso(true)}
            title="Enviar a cada doctor su agenda del día por WhatsApp"
            className="flex items-center gap-1.5 rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            <Stethoscope className="h-3.5 w-3.5" />
            Avisar a doctores
          </button>
        )}
      </div>

      {/* Leyenda + filtro por estado */}
      <StatusLegend
        counts={statusCounts}
        active={activeStatuses}
        onToggle={toggleStatus}
        onReset={() => setActiveStatuses(new Set())}
      />

      {/* Vista Mes: calendario filtrado + DayView del día seleccionado */}
      {view === "month" && (
        <>
          <MonthView
            month={date}
            byDay={visibleByDay}
            selectedDay={selectedDay}
            onSelectDay={handleSelectDay}
            onSwipeMonth={shift}
          />
          {selectedDay && (
            // scroll-mt compensa el banner fijo de vista previa del superadmin;
            // el ring parpadea ~1.6s tras el scroll para enfocar la vista ahí.
            <div
              ref={dayDetailRef}
              className={`scroll-mt-16 rounded-lg transition-shadow duration-500 ${
                dayFocusTick ? "ring-2 ring-clinic shadow-lg" : "ring-0"
              }`}
            >
              <DayView
                day={selectedDay}
                appts={visibleByDay.get(selectedDay) ?? []}
                canWrite={canWrite}
                highlightId={highlightId}
                patients={patients}
                doctors={doctors}
                forcedColumns={forcedCols}
                availability={availability}
                {...dayViewHandlers}
              />
            </div>
          )}
        </>
      )}

      {/* Vista Día filtrada */}
      {view === "day" && (
        <DayView
          day={date}
          appts={visibleByDay.get(date) ?? []}
          canWrite={canWrite}
          highlightId={highlightId}
          patients={patients}
          doctors={doctors}
          forcedColumns={forcedCols}
          availability={availability}
          onSwipeDay={shift}
          {...dayViewHandlers}
        />
      )}

      {/* Vista Semana filtrada */}
      {view === "week" && (
        <WeekView
          date={date}
          byDay={visibleByDay}
          canWrite={canWrite}
          patients={patients}
          doctors={doctors}
          availability={availability}
          selectedDoctor={activeDoctor === ALL_DOCTORS ? null : activeDoctor}
          onOpenDay={(k) => router.push(`/agenda?date=${k}&view=day`)}
          onPick={openFullModal}
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
          onSwipeWeek={shift}
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
          prefill={modal.prefill}
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
      {showDoctorAviso && (
        <DoctorAgendaWhatsAppModal onClose={() => setShowDoctorAviso(false)} />
      )}

      {/* Botón flotante "+" (solo móvil), como Google Calendar: en el teléfono
          la grilla horaria no existe (se usa la lista), así que este es el
          camino para crear una cita en el día/fecha que se está viendo. */}
      {canWrite && (
        <button
          type="button"
          onClick={openNewAppt}
          aria-label="Nueva cita"
          className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-clinic text-white shadow-xl shadow-clinic/30 transition active:scale-95 sm:hidden"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}
    </div>
    </DoctorColorContext.Provider>
  );
}
