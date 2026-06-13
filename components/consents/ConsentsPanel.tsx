"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ConsentModal,
  type ConsentTemplate,
  type ConsentAppointment,
} from "./ConsentModal";
import { deleteConsent } from "@/app/(dashboard)/pacientes/consent-actions";

export type ConsentRow = {
  id: string;
  title: string;
  status: "pendiente" | "firmado";
  createdAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function StatusBadge({ status }: { status: "pendiente" | "firmado" }) {
  return status === "firmado" ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Firmado
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Pendiente
    </span>
  );
}

export function ConsentsPanel({
  patientId,
  patientName,
  doctorName,
  clinicName,
  consents,
  templates,
  appointments,
  canWrite,
}: {
  patientId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  consents: ConsentRow[];
  templates: ConsentTemplate[];
  appointments: ConsentAppointment[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete(consentId: string) {
    if (!confirm("¿Eliminar este consentimiento?")) return;
    startTransition(async () => {
      await deleteConsent(consentId, patientId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
          >
            + Nuevo consentimiento
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[9rem_1fr_7rem_8rem_2rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Título</span>
          <span>Estado</span>
          <span />
          <span />
        </div>

        <div className="divide-y divide-slate-100">
          {consents.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[9rem_1fr_7rem_8rem_2rem]"
            >
              <span className="tabular-nums text-slate-500">
                {fmtDate(c.createdAt)}
              </span>
              <span className="font-medium">{c.title}</span>
              <StatusBadge status={c.status} />
              <a
                href={`/pacientes/${patientId}/consentimiento/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-clinic hover:underline"
              >
                Ver / imprimir
              </a>
              <div className="text-right">
                {canWrite && (
                  <button
                    disabled={pending}
                    onClick={() => handleDelete(c.id)}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-50"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          {consents.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Sin consentimientos emitidos.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <ConsentModal
          patientId={patientId}
          patientName={patientName}
          doctorName={doctorName}
          clinicName={clinicName}
          templates={templates}
          appointments={appointments}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
