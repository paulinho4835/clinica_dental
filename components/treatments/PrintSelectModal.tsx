"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { money, fmtBoliviaDateTime } from "@/lib/format";
import type { Work } from "./TreatmentPlanPanel";

export function PrintSelectModal({
  patientId,
  works,
  currency,
}: {
  patientId: string;
  works: Work[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === works.length ? new Set() : new Set(works.map((w) => w.id)),
    );
  }

  function handlePrint() {
    const ids = Array.from(selected).join(",");
    window.open(`/pacientes/${patientId}/imprimir?items=${ids}`, "_blank", "noopener,noreferrer");
    setOpen(false);
    setSelected(new Set());
  }

  const total = works
    .filter((w) => selected.has(w.id))
    .reduce((s, w) => s + w.price, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Presupuesto
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Elegir tratamientos a imprimir"
        subtitle="Marca los tratamientos que quieres incluir en el presupuesto."
        size="lg"
      >
        <div className="mb-3 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={toggleAll}
            className="font-medium text-clinic hover:underline"
          >
            {selected.size === works.length ? "Desmarcar todos" : "Marcar todos"}
          </button>
          <span className="text-slate-500">
            Total seleccionado:{" "}
            <span data-testid="print-select-total" className="font-semibold text-slate-800">
              {money(total, currency)}
            </span>
          </span>
        </div>

        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
          {works.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos en el plan.</p>
          )}
          {works.map((w) => (
            <label
              key={w.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(w.id)}
                onChange={() => toggle(w.id)}
                className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              <span className="w-28 shrink-0 text-xs tabular-nums text-slate-400">
                {fmtBoliviaDateTime(w.createdAt)}
              </span>
              <span className="flex-1 font-medium">{w.name}</span>
              <span className="tabular-nums text-slate-600">{money(w.price, currency)}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={handlePrint}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Imprimir
          </button>
        </div>
      </Modal>
    </>
  );
}
