"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  setAppointmentStatus,
  linkAppointmentPatient,
  type ActionState,
} from "@/app/(dashboard)/agenda/actions";
import { createPatientQuick } from "@/app/(dashboard)/pacientes/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { bs } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import { STEP_MIN, mins, buildTimeline } from "@/lib/agenda";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Pencil,
  RotateCcw,
  Check,
  X,
} from "lucide-react";

export type MonthAppt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  dentist_name: string | null;
  patient_id: string | null; // expediente vinculado (null en consulta rápida)
  patient_name: string | null; // nombre suelto (paciente no registrado)
  reason: string | null;
  consult_price: number | null;
  deposit: number | null;
  deposit_method: string | null;
  patients: { full_name?: string; national_id?: string | null } | null;
};

// Nombre a mostrar: paciente registrado o, si no, el nombre suelto.
const apptName = (a: MonthAppt) => a.patients?.full_name ?? a.patient_name ?? "Cita";

// CI del paciente (solo registrados lo tienen).
const apptCI = (a: MonthAppt) => a.patients?.national_id ?? null;

// Consulta rápida = sin paciente registrado pero con nombre suelto.
const isQuickConsult = (a: MonthAppt) => !a.patients?.full_name && !!a.patient_name;

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── Helpers de fecha (todo en hora local) ───────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

// Clave de día local YYYY-MM-DD a partir de un instante.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

const initial: ActionState = {};

// Estado del modal: nueva cita (slot libre) o edición (cita existente).
type ModalState = { start: Date; end: Date; appt?: MonthAppt };

export type DoctorOption = { id: string; full_name: string };

export function AgendaCalendar({
  patients,
  appts,
  month, // YYYY-MM-DD (cualquier día del mes visible)
  canWrite,
  doctors,
}: {
  patients: PatientOption[];
  appts: MonthAppt[];
  month: string;
  canWrite: boolean;
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [linkAppt, setLinkAppt] = useState<MonthAppt | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const base = new Date(month + "T00:00:00");
  const year = base.getFullYear();
  const mon = base.getMonth();

  // Citas agrupadas por día local.
  const byDay = useMemo(() => {
    const map = new Map<string, MonthAppt[]>();
    for (const a of appts) {
      const k = dayKey(new Date(a.starts_at));
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return map;
  }, [appts]);

  // Grilla de 6 semanas (lunes primero).
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

  function shiftMonth(delta: number) {
    const d = new Date(year, mon + delta, 1);
    setSelectedDay(null);
    router.push(`/agenda?date=${dayKey(d)}`);
  }

  // ── Búsqueda: ubica la cita de un paciente (nombre o CI) en el mes visible,
  // salta a su día y la resalta. Se prioriza el día ya seleccionado.
  function runSearch(raw: string) {
    const q = raw.trim().toLowerCase();
    setSearchMsg(null);
    setHighlightId(null);
    if (!q) return;

    const matches = (a: MonthAppt) =>
      apptName(a).toLowerCase().includes(q) ||
      (apptCI(a) ?? "").toLowerCase().includes(q);

    // 1) buscar primero en el día abierto; 2) si no, en todo el mes.
    const inDay = selectedDay ? (byDay.get(selectedDay) ?? []).find(matches) : undefined;
    const hit = inDay ?? appts.find(matches);

    if (!hit) {
      setSearchMsg(`Sin citas para “${raw.trim()}” en este mes.`);
      return;
    }
    const k = dayKey(new Date(hit.starts_at));
    setSelectedDay(k);
    setHighlightId(hit.id);
  }

  // Limpia el resaltado tras la animación (3 pulsos ≈ 2.7s).
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const todayKey = dayKey(new Date());
  const monthLabel = base.toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* ── Buscador de pacientes en la agenda ── */}
      <SearchBar onSearch={runSearch} message={searchMsg} />

      {/* ── Navegación del mes ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Mes anterior"
          className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setSelectedDay(todayKey); shiftMonth(0); }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Hoy
        </button>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Mes siguiente"
          className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-2 text-lg font-semibold capitalize text-slate-700">
          {monthLabel}
        </span>
      </div>

      {/* ── Calendario mensual ── */}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium uppercase text-slate-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === mon;
            const dayAppts = byDay.get(k) ?? [];
            const isSelected = selectedDay === k;
            const isToday = k === todayKey;
            return (
              <button
                key={k}
                type="button"
                disabled={!inMonth}
                onClick={() => setSelectedDay(k)}
                className={`flex min-h-[68px] flex-col items-start gap-1 border-b border-r border-slate-100 p-2 text-left transition ${
                  !inMonth
                    ? "cursor-default bg-slate-50/60 text-slate-300"
                    : "hover:bg-clinic/5"
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
                  <div className="flex flex-col gap-0.5">
                    <span className="rounded bg-clinic/10 px-1.5 py-0.5 text-[11px] font-medium text-clinic">
                      {dayAppts.length} cita{dayAppts.length > 1 ? "s" : ""}
                    </span>
                    <div className="flex gap-0.5">
                      {dayAppts.some(a => a.status === "finished") && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Atendidos" />
                      )}
                      {dayAppts.some(a => a.status === "scheduled") && (
                        <span className="h-1.5 w-1.5 rounded-full bg-clinic" title="Pendientes" />
                      )}
                      {dayAppts.some(a => a.status === "no_show") && (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" title="No vino" />
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Línea de tiempo dinámica del día elegido ── */}
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
              end: a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
              appt: a,
            })
          }
          onLink={(a) => setLinkAppt(a)}
        />
      )}

      {/* ── Modal de nueva cita / edición ── */}
      {modal && (
        <ApptModal
          patients={patients}
          doctors={doctors}
          start={modal.start}
          end={modal.end}
          appt={modal.appt}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Modal: vincular consulta rápida a paciente registrado ── */}
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

// ─── Buscador de la agenda ───────────────────────────────────────────────────
function SearchBar({
  onSearch,
  message,
}: {
  onSearch: (q: string) => void;
  message: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(value);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (!e.target.value.trim()) onSearch(""); // limpiar resaltado al vaciar
            }}
            placeholder="Buscar cita por nombre o CI del paciente…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
        >
          Buscar
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-amber-600">{message}</p>}
    </div>
  );
}

// ─── Control de asistencia (simple) ──────────────────────────────────────────
// Dos resultados: "Atendido" (vino → migra dinero al historial) o "No vino".
// Mientras está pendiente, muestra ambos botones; ya resuelto, muestra el
// resultado con opción de deshacer.
function MiniStatus({
  id,
  status,
  canWrite,
}: {
  id: string;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(next: string) {
    start(async () => {
      const res = await setAppointmentStatus(id, next);
      if (res.error) toast(res.error, "error");
      else router.refresh();
    });
  }

  // Solo lectura para roles sin permiso.
  if (!canWrite) {
    const label =
      status === "finished" ? "Atendido" : status === "no_show" ? "No vino" : "Pendiente";
    const color =
      status === "finished"
        ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
        : status === "no_show"
          ? "bg-red-100 text-red-700 ring-red-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
    return <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${color}`}>{label}</span>;
  }

  // Ya resuelto: muestra resultado + deshacer.
  if (status === "finished" || status === "no_show") {
    const done = status === "finished";
    return (
      <span className="flex items-center gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            done
              ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
              : "bg-red-100 text-red-700 ring-red-200"
          }`}
        >
          {done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {done ? "Atendido" : "No vino"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => set("scheduled")}
          aria-label="Deshacer"
          title="Deshacer"
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  // Pendiente: ofrece los dos resultados.
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => set("finished")}
        className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500 hover:text-white disabled:opacity-50"
      >
        <Check className="h-3 w-3" /> Atendido
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("no_show")}
        className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-50"
      >
        <X className="h-3 w-3" /> No vino
      </button>
    </span>
  );
}

// ─── Helpers de color por estado de cita ────────────────────────────────────
function apptRowStyle(status: string) {
  if (status === "finished") return "border-l-2 border-emerald-400 bg-emerald-50/60";
  if (status === "no_show") return "border-l-2 border-slate-300 bg-slate-50/60 opacity-60";
  return "border-l-2 border-clinic/60 bg-clinic/5"; // scheduled
}

const apptNameColor = (status: string) =>
  status === "finished" ? "text-emerald-700" :
  status === "no_show" ? "text-slate-400 line-through" :
  "text-slate-800";


// ─── Línea de tiempo dinámica de un día ──────────────────────────────────────
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

  // Al resaltar una cita, desplaza la vista hasta ella.
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
                    const e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + STEP_MIN * 60_000);
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

          // Hueco libre — la duración por defecto al agendar es STEP_MIN,
          // sin pasarse del fin del hueco.
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

// ─── Modal de creación / edición de cita ─────────────────────────────────────
const hhmmInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function ApptModal({
  patients,
  doctors,
  start,
  end,
  appt, // si viene → modo edición
  onClose,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  start: Date;
  end: Date;
  appt?: MonthAppt;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEditing = !!appt;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateAppointment : createAppointment,
    initial,
  );

  // Precarga: paciente registrado ligado a la cita (si lo hay).
  const preselected = useMemo(
    () => (appt?.patient_id ? patients.find((p) => p.id === appt.patient_id) ?? null : null),
    [appt, patients],
  );

  const [selected, setSelected] = useState<PatientOption | null>(preselected);
  const [mode, setMode] = useState<"registered" | "new">(
    appt && isQuickConsult(appt) ? "new" : "registered",
  );
  const [patientName, setPatientName] = useState(appt?.patient_name ?? "");
  const [startTime, setStartTime] = useState(hhmmInput(start));
  const [endTime, setEndTime] = useState(hhmmInput(end));
  const [price, setPrice] = useState(appt?.consult_price ? String(appt.consult_price) : "");
  const [deposit, setDeposit] = useState(appt?.deposit ? String(appt.deposit) : "");

  // Cancelación de cita (modo edición).
  const [canceling, startCancel] = useTransition();
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  // Paciente válido: uno registrado elegido, o un nombre suelto escrito.
  const patientOk = mode === "registered" ? !!selected : patientName.trim().length > 0;

  // Saldo pendiente = cotización − adelanto (en vivo).
  const priceN = Number(price) || 0;
  const depositN = Number(deposit) || 0;
  const saldo = priceN - depositN;

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state.ok, router, onClose]);

  const dateKey = dayKey(start); // mismo día de la cita / hueco elegido
  // Offset Bolivia (-04:00, sin horario de verano) explícito: así el instante es
  // inequívoco sin importar la TZ del server (Vercel corre en UTC). Sin esto el
  // server interpretaba "14:30" como UTC y la hora aparecía 4h corrida.
  const startsAt = `${dateKey}T${startTime}:00-04:00`;
  const endsAt = `${dateKey}T${endTime}:00-04:00`;
  const validRange = endTime > startTime;
  const duration = validRange ? mins(new Date(startsAt), new Date(endsAt)) : 0;

  const header = start.toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  async function handleCancel() {
    if (!appt) return;
    const ok = await confirm({
      title: "Cancelar cita",
      message: `¿Cancelar la cita de ${apptName(appt)}? Esta acción no se puede deshacer.`,
      confirmText: "Sí, cancelar",
      cancelText: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    setCancelErr(null);
    startCancel(async () => {
      const res = await cancelAppointment(appt.id);
      if (res.error) setCancelErr(res.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEditing ? "Editar cita" : "Nueva cita"}
      subtitle={<span className="capitalize text-clinic">{header}</span>}
    >
      <form action={formAction} className="space-y-3">
        {/* En edición viaja el id de la cita a actualizar. */}
        {isEditing && <input type="hidden" name="appointment_id" value={appt!.id} />}

        {/* Horario personalizado: inicio y fin libres. Viajan ocultos al server. */}
        <input type="hidden" name="starts_at" value={startsAt} />
        <input type="hidden" name="ends_at" value={endsAt} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Inicio *</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Fin *</span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                validRange
                  ? "border-slate-300 focus:border-clinic focus:ring-clinic"
                  : "border-red-400 focus:border-red-500 focus:ring-red-500"
              }`}
            />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          {validRange ? `Duración: ${duration} min` : "El fin debe ser posterior al inicio."}
        </p>

        {/* Selector de tipo de paciente */}
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => { setMode("registered"); setPatientName(""); }}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              mode === "registered" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Registrado
          </button>
          <button
            type="button"
            onClick={() => { setMode("new"); setSelected(null); }}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              mode === "new" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Nuevo / consulta rápida
          </button>
        </div>

        {mode === "registered" ? (
          <PatientPicker
            patients={patients}
            selected={selected}
            onSelect={setSelected}
            autoFocus={!isEditing}
          />
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Nombre del paciente *</span>
            <input
              type="text"
              autoFocus={!isEditing}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="ej. Carlos Ruiz (sin registrar)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
            {/* Nombre suelto: viaja como patient_name; sin patient_id. */}
            <input type="hidden" name="patient_name" value={patientName.trim()} />
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Odontólogo *</span>
          <input
            name="dentist_name"
            type="text"
            required
            list="agenda-doctors-list"
            defaultValue={appt?.dentist_name ?? ""}
            placeholder={doctors.length > 0 ? "Elige o escribe un nombre…" : "Nombre del odontólogo"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          {doctors.length > 0 && (
            <datalist id="agenda-doctors-list">
              {doctors.map((d) => (
                <option key={d.id} value={d.full_name} />
              ))}
            </datalist>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Motivo / notas</span>
          <input
            name="reason"
            type="text"
            defaultValue={appt?.reason ?? ""}
            placeholder="ej. Control, limpieza…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>

        {/* ── Capa financiera (opcional) ── */}
        <fieldset className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <legend className="px-1 text-xs font-medium text-slate-500">
            Cobro (opcional)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Cotización / consulta (Bs)</span>
              <input
                name="consult_price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Adelanto / seña (Bs)</span>
              <input
                name="deposit"
                type="number"
                step="0.01"
                min="0"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          </div>
          {depositN > 0 && (
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-slate-600">Método de pago</span>
              <select
                name="deposit_method"
                defaultValue={appt?.deposit_method ?? "cash"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
              >
                <option value="cash">Efectivo</option>
                <option value="qr">QR</option>
              </select>
            </label>
          )}
          {(priceN > 0 || depositN > 0) && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
              <span className="text-slate-500">Saldo pendiente</span>
              <span
                className={`tabular-nums font-semibold ${
                  saldo > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {bs(saldo)}
              </span>
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="overbooked" type="checkbox" /> Permitir sobre-cupo
        </label>

        {(state.error || cancelErr) && (
          <p className="text-sm text-red-600">{state.error ?? cancelErr}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={pending || canceling || !patientOk || !validRange}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Guardando…" : isEditing ? "Actualizar cambios" : "Agendar"}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={canceling || pending}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {canceling ? "Cancelando…" : "Cancelar cita"}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cerrar
          </button>
          {!patientOk && (
            <span className="text-xs text-amber-600">
              {mode === "registered"
                ? "Elige un paciente de la lista."
                : "Escribe el nombre del paciente."}
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal: vincular consulta rápida → paciente registrado ───────────────────
// Asocia la cita (y su dinero) a un expediente. Si la cita ya fue atendida,
// el server migra cotización + adelanto al historial en el acto.
function LinkPatientModal({
  patients,
  appt,
  onClose,
}: {
  patients: PatientOption[];
  appt: MonthAppt;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"existing" | "quick">("existing");
  const [selected, setSelected] = useState<PatientOption | null>(null);
  // Registro rápido: prellena el nombre con el de la consulta suelta.
  const [name, setName] = useState(appt.patient_name ?? "");
  const [ci, setCi] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canConfirm = tab === "existing" ? !!selected : name.trim().length > 0;

  function confirm() {
    if (!canConfirm) return;
    setError(null);
    start(async () => {
      // En modo rápido: crea el paciente y usa su id; si no, el ya elegido.
      let patientId = selected?.id;
      if (tab === "quick") {
        const created = await createPatientQuick({
          full_name: name.trim(),
          national_id: ci.trim() || null,
          phone: phone.trim() || null,
        });
        if (created.error || !created.patientId) {
          setError(created.error ?? "No se pudo registrar.");
          return;
        }
        patientId = created.patientId;
      }
      if (!patientId) return;

      const res = await linkAppointmentPatient(appt.id, patientId);
      if (res.error) setError(res.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Vincular a paciente"
      subtitle={
        <>
          Consulta rápida de <span className="font-medium">{appt.patient_name}</span>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          El dinero registrado (cotización y adelanto) quedará ligado al expediente.
          Si la cita ya fue atendida, migra al historial de inmediato.
        </p>

        {/* Pestañas: usar paciente existente o registrar uno nuevo al vuelo. */}
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setTab("existing")}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              tab === "existing" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Paciente existente
          </button>
          <button
            type="button"
            onClick={() => setTab("quick")}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              tab === "quick" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Registro rápido
          </button>
        </div>

        {tab === "existing" ? (
          <PatientPicker patients={patients} selected={selected} onSelect={setSelected} autoFocus />
        ) : (
          <div className="space-y-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Nombre completo *</span>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre y apellido"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">CI</span>
                <input
                  type="text"
                  value={ci}
                  onChange={(e) => setCi(e.target.value)}
                  placeholder="Cédula"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Teléfono</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Celular"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Crea el expediente con lo mínimo. Podés completar el resto luego en la ficha.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={confirm}
            disabled={pending || !canConfirm}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? tab === "quick"
                ? "Registrando…"
                : "Vinculando…"
              : tab === "quick"
                ? "Registrar y vincular"
                : "Vincular"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          {!canConfirm && (
            <span className="text-xs text-amber-600">
              {tab === "existing" ? "Elige el paciente registrado." : "Escribe el nombre."}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
