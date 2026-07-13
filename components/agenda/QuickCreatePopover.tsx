"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createAppointment, type ActionState } from "@/app/(dashboard)/agenda/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { type DoctorOption } from "./apptHelpers";
import { mins } from "@/lib/agenda";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmmInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const initial: ActionState = {};

/** Datos que el usuario ya escribió aquí y que viajan al modal completo. */
export type QuickDraft = {
  patient: PatientOption | null;
  patientName: string;
  reason: string;
  dentistName: string;
  startTime: string;
  endTime: string;
};

// Creación rápida al estilo Google Calendar: tarjeta flotante anclada a la
// franja clickeada, con lo mínimo para agendar. Para cobro / sobre-cupo se
// escala al modal completo con "Más opciones" sin perder lo ya escrito.
export function QuickCreatePopover({
  patients,
  doctors,
  start,
  end,
  dentist,
  anchor,
  onMoreOptions,
  onClose,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  start: Date;
  end: Date;
  /** Odontólogo precargado (al agendar desde la columna de un doctor). */
  dentist?: string;
  anchor: DOMRect;
  onMoreOptions: (draft: QuickDraft) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createAppointment, initial);

  const [selected, setSelected] = useState<PatientOption | null>(null);
  const [mode, setMode] = useState<"registered" | "new">("registered");
  const [patientName, setPatientName] = useState("");
  const [reason, setReason] = useState("");
  const [startTime, setStartTime] = useState(hhmmInput(start));
  const [endTime, setEndTime] = useState(hhmmInput(end));
  const [dentistName, setDentistName] = useState(dentist ?? "");

  const dentistId = useMemo(
    () => doctors.find((d) => d.full_name === dentistName)?.id ?? "",
    [doctors, dentistName],
  );

  const patientOk = mode === "registered" ? !!selected : patientName.trim().length > 0;
  const validRange = endTime > startTime;

  // Mismo criterio que ApptModal: offset de Bolivia explícito para que el
  // instante no dependa de la TZ del server (Vercel corre en UTC).
  const dateKey = dayKey(start);
  const startsAt = `${dateKey}T${startTime}:00-04:00`;
  const endsAt = `${dateKey}T${endTime}:00-04:00`;
  const duration = validRange ? mins(new Date(startsAt), new Date(endsAt)) : 0;

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state.ok, router, onClose]);

  // Cerrar al hacer clic fuera. El retraso evita que el mismo clic que abrió el
  // popover lo cierre de inmediato.
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      // Si el nodo clickeado ya no está en el DOM, fue removido por un
      // re-render en pleno mousedown (ej. elegir una opción del buscador de
      // pacientes desmonta la lista). No es un clic fuera: ignorar.
      if (!document.body.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handle), 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handle);
    };
  }, [onClose]);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const POPOVER_W = 300;
  // El formulario real (horario + toggle + buscador + odontólogo + motivo +
  // botones) mide más que esto en la mayoría de los casos; se usa solo para
  // decidir de qué lado clampear "top". El maxHeight + overflow de abajo es
  // la red de seguridad real para que nunca quede contenido inalcanzable.
  const ESTIMATED_H = 460;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = anchor.right + 8;
  if (left + POPOVER_W > vw - 8) left = anchor.left - POPOVER_W - 8;
  if (left < 8) left = 8;

  let top = anchor.top - 40;
  if (top + ESTIMATED_H > vh - 8) top = vh - ESTIMATED_H - 8;
  if (top < 8) top = 8;
  const maxHeight = vh - top - 8;

  const header = start.toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Nueva cita"
      style={{ position: "fixed", top, left, width: POPOVER_W, maxHeight, zIndex: 9999 }}
      className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-100"
    >
      <form action={formAction} className="space-y-2.5">
        <input type="hidden" name="starts_at" value={startsAt} />
        <input type="hidden" name="ends_at" value={endsAt} />
        <input type="hidden" name="dentist_id" value={dentistId} />

        <div className="border-b border-slate-100 pb-2">
          <p className="text-sm font-semibold text-slate-800">Nueva cita</p>
          <p className="text-xs capitalize text-clinic">{header}</p>
        </div>

        {/* Horario */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500">Inicio</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500">Fin</span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 ${
                validRange
                  ? "border-slate-300 focus:border-clinic focus:ring-clinic"
                  : "border-red-400 focus:border-red-500 focus:ring-red-500"
              }`}
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-400">
          {validRange ? `Duración: ${duration} min` : "El fin debe ser posterior al inicio."}
        </p>

        {/* Registrado / nuevo */}
        <div className="flex rounded-md bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => { setMode("registered"); setPatientName(""); }}
            className={`flex-1 rounded px-2 py-1 transition ${
              mode === "registered" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Registrado
          </button>
          <button
            type="button"
            onClick={() => { setMode("new"); setSelected(null); }}
            className={`flex-1 rounded px-2 py-1 transition ${
              mode === "new" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Nuevo
          </button>
        </div>

        {mode === "registered" ? (
          <PatientPicker
            patients={patients}
            selected={selected}
            onSelect={setSelected}
            autoFocus
            openOnFocus={false}
          />
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Paciente *</span>
            <input
              type="text"
              autoFocus
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="ej. Carlos Ruiz (sin registrar)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
            <input type="hidden" name="patient_name" value={patientName.trim()} />
          </label>
        )}

        {/* Odontólogo */}
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Odontólogo *</span>
          {doctors.length > 0 ? (
            <select
              name="dentist_name"
              required
              value={dentistName}
              onChange={(e) => setDentistName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            >
              <option value="" disabled>Selecciona un odontólogo…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.full_name}>{d.full_name}</option>
              ))}
            </select>
          ) : (
            <input
              name="dentist_name"
              type="text"
              required
              value={dentistName}
              onChange={(e) => setDentistName(e.target.value)}
              placeholder="Nombre del odontólogo"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Motivo</span>
          <input
            name="reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ej. Control, limpieza…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>

        {state.error && <p className="text-xs text-red-600">{state.error}</p>}

        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="submit"
            disabled={pending || !patientOk || !validRange}
            className="rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Agendar"}
          </button>
          <button
            type="button"
            onClick={() =>
              onMoreOptions({
                patient: selected,
                patientName,
                reason,
                dentistName,
                startTime,
                endTime,
              })
            }
            className="rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Más opciones
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Descartar"
            className="ml-auto rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            Descartar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
