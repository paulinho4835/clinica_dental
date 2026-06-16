"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createPrescription,
  type Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";
import { useDismissable } from "@/components/ui/useDismissable";

const emptyMed = (): Medication => ({ name: "", dosage: "", instructions: "" });

export function PrescriptionModal({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  useDismissable(onClose);
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateMed(idx: number, field: keyof Medication, value: string) {
    setMedications((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );
  }

  function addMed() {
    setMedications((prev) => [...prev, emptyMed()]);
  }

  function removeMed(idx: number) {
    setMedications((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createPrescription(patientId, medications, notes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
      window.open(`/pacientes/${patientId}/receta/${result.id}`, "_blank");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Emitir Receta</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            Agrega los medicamentos que deseas prescribir. Los campos marcados con * son obligatorios.
          </p>

          {medications.map((m, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
            >
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Medicamento *</span>
                <input
                  value={m.name}
                  onChange={(e) => updateMed(idx, "name", e.target.value)}
                  placeholder="Amoxicilina"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Dosis *</span>
                <input
                  value={m.dosage}
                  onChange={(e) => updateMed(idx, "dosage", e.target.value)}
                  placeholder="500mg c/8h"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Indicaciones</span>
                <input
                  value={m.instructions}
                  onChange={(e) => updateMed(idx, "instructions", e.target.value)}
                  placeholder="Con las comidas"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <button
                type="button"
                onClick={() => removeMed(idx)}
                disabled={medications.length === 1}
                title="Eliminar medicamento"
                aria-label="Eliminar medicamento"
                className="pb-2 text-slate-300 hover:text-red-500 disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addMed}
            className="mt-1 text-sm text-clinic hover:underline"
          >
            + Agregar medicamento
          </button>

          <label className="block text-xs mt-2">
            <span className="mb-1 block text-slate-500">
              Notas generales (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Evitar alcohol. Tomar con abundante agua..."
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar y generar receta"}
          </button>
        </div>
      </div>
    </div>
  );
}
