// components/patients/PrescriptionsPanel.tsx
"use client";

import { useState } from "react";
import { type PrescriptionRow } from "@/app/(dashboard)/pacientes/prescription-actions";
import { PrescriptionModal } from "./PrescriptionModal";
import { fmtBoliviaDateTime } from "@/lib/format";

const fmtDateTime = fmtBoliviaDateTime;

export function PrescriptionsPanel({
  patientId,
  prescriptions,
  canWrite,
}: {
  patientId: string;
  prescriptions: PrescriptionRow[];
  canWrite: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Emitir Receta
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[10rem_1fr_7rem_6rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Doctor</span>
          <span>Medicamentos</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr_7rem_6rem]"
            >
              <span className="tabular-nums text-slate-500">
                {fmtDateTime(rx.issuedAt)}
              </span>
              <span className="font-medium">
                {rx.doctorName ?? (
                  <span className="text-slate-300">—</span>
                )}
              </span>
              <span className="text-slate-500">
                {rx.medications.length}{" "}
                {rx.medications.length === 1 ? "med." : "meds."}
              </span>
              <div className="flex justify-end">
                <a
                  href={`/pacientes/${patientId}/receta/${rx.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-clinic hover:underline"
                >
                  Ver / imprimir
                </a>
              </div>
            </div>
          ))}
          {prescriptions.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Sin recetas emitidas.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <PrescriptionModal
          patientId={patientId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
