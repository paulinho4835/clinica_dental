"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  type ActionState,
} from "@/app/(dashboard)/agenda/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { bs } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { confirm } from "@/lib/confirm";
import { mins } from "@/lib/agenda";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  isQuickConsult,
} from "./apptHelpers";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmmInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const initial: ActionState = {};

// ─── Modal de creación / edición de cita ─────────────────────────────────────
export function ApptModal({
  patients,
  doctors,
  start,
  end,
  appt, // si viene → modo edición
  dentist, // odontólogo precargado (al agendar desde una columna)
  onClose,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  start: Date;
  end: Date;
  appt?: MonthAppt;
  dentist?: string;
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
            defaultValue={appt?.dentist_name ?? dentist ?? ""}
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
