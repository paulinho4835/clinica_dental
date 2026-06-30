"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkAppointmentPatient } from "@/app/(dashboard)/agenda/actions";
import { createPatientQuick } from "@/app/(dashboard)/pacientes/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { Modal } from "@/components/ui/Modal";
import { type MonthAppt } from "./apptHelpers";

// ─── Modal: vincular consulta rápida → paciente registrado ───────────────────
// Asocia la cita (y su dinero) a un expediente. Si la cita ya fue atendida,
// el server migra cotización + adelanto al historial en el acto.
export function LinkPatientModal({
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
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
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
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Teléfono</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Celular"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Crea el expediente con lo mínimo. Puedes completar el resto luego en la ficha.
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
