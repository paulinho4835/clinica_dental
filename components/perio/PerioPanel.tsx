"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PerioChart } from "./PerioChart";
import { PerioIndicesPanel } from "./PerioIndices";
import { computeIndices } from "@/lib/perio/indices";
import { boliviaTodayISO } from "@/lib/format";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { savePerioExam, deletePerioExam } from "@/app/(dashboard)/pacientes/perio-actions";
import type { PerioMeasurements } from "@/lib/perio/types";

export type PerioExamRow = {
  id: string;
  examDate: string; // YYYY-MM-DD
  authorName: string | null;
  measurements: PerioMeasurements;
  diagnosis: string;
  notes: string;
};

type Draft = {
  examId: string | null;
  examDate: string;
  measurements: PerioMeasurements;
  diagnosis: string;
  notes: string;
};

export function PerioPanel({
  patientId,
  exams,
  canWrite,
  canDelete,
}: {
  patientId: string;
  exams: PerioExamRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Examen mostrado: el seleccionado, o el más reciente por defecto.
  const selected = exams.find((e) => e.id === selectedId) ?? exams[0] ?? null;
  const editing = draft !== null;

  const shownMeasurements: PerioMeasurements = editing
    ? draft.measurements
    : (selected?.measurements ?? {});
  const indices = computeIndices(shownMeasurements);

  function startNew() {
    setError(null);
    setDraft({
      examId: null,
      examDate: boliviaTodayISO(),
      measurements: {},
      diagnosis: "",
      notes: "",
    });
  }

  function startEdit() {
    if (!selected) return;
    setError(null);
    setDraft({
      examId: selected.id,
      examDate: selected.examDate,
      measurements: selected.measurements,
      diagnosis: selected.diagnosis,
      notes: selected.notes,
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await savePerioExam({
      examId: draft.examId,
      patientId,
      examDate: draft.examDate,
      measurements: draft.measurements,
      diagnosis: draft.diagnosis,
      notes: draft.notes,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDraft(null);
    // Examen nuevo → tras refrescar, ver el más reciente (selectedId null).
    if (!draft.examId) setSelectedId(null);
    toast("Periodontograma guardado");
    router.refresh();
  }

  async function remove() {
    if (!selected) return;
    const ok = await confirm({
      title: "Eliminar examen",
      message: `¿Eliminar el periodontograma del ${selected.examDate}? Esta acción no se puede deshacer.`,
      tone: "danger",
      confirmText: "Eliminar",
    });
    if (!ok) return;
    const res = await deletePerioExam(selected.id, patientId);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    setSelectedId(null);
    toast("Examen eliminado");
    router.refresh();
  }

  // Estado vacío: sin exámenes y sin borrador en curso.
  if (exams.length === 0 && !editing) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">Sin periodontogramas registrados.</p>
        {canWrite && (
          <button
            type="button"
            onClick={startNew}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
          >
            <Plus className="h-4 w-4" /> Nuevo examen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra: selector de examen + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!editing && exams.length > 0 && (
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.examDate}
                  {e.authorName ? ` · ${e.authorName}` : ""}
                </option>
              ))}
            </select>
          )}
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Fecha del examen
              <input
                type="date"
                value={draft.examDate}
                onChange={(e) => setDraft({ ...draft, examDate: e.target.value })}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              />
            </label>
          )}
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <button
                  type="button"
                  onClick={startNew}
                  className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
                >
                  <Plus className="h-4 w-4" /> Nuevo
                </button>
                {selected && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )}
                {selected && canDelete && (
                  <button
                    type="button"
                    onClick={remove}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Índices en vivo */}
      <PerioIndicesPanel indices={indices} />

      {/* Carta periodontal */}
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <PerioChart
          measurements={shownMeasurements}
          onChange={(m) => draft && setDraft({ ...draft, measurements: m })}
          canWrite={editing}
        />
      </div>

      {/* Diagnóstico y notas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Diagnóstico periodontal
          </label>
          {editing ? (
            <textarea
              value={draft.diagnosis}
              onChange={(e) => setDraft({ ...draft, diagnosis: e.target.value })}
              rows={3}
              placeholder="Ej. Periodontitis generalizada, considerando los índices a la vista…"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          ) : (
            <p className="min-h-[3rem] whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
              {selected?.diagnosis || <span className="text-slate-400">—</span>}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Observaciones</label>
          {editing ? (
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          ) : (
            <p className="min-h-[3rem] whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
              {selected?.notes || <span className="text-slate-400">—</span>}
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar examen"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Evolución: índices clave por examen para ver la tendencia */}
      {!editing && exams.length > 1 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Evolución
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-1.5 pr-4 font-medium">Fecha</th>
                  <th className="py-1.5 pr-4 font-medium">% Sangrado</th>
                  <th className="py-1.5 pr-4 font-medium">% Placa</th>
                  <th className="py-1.5 pr-4 font-medium">Bolsa máx.</th>
                  <th className="py-1.5 pr-4 font-medium">Bolsas ≥6mm</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => {
                  const ix = computeIndices(e.measurements);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`cursor-pointer border-b border-slate-100 tabular-nums hover:bg-slate-50 ${
                        e.id === selected?.id ? "bg-clinic/5" : ""
                      }`}
                    >
                      <td className="py-1.5 pr-4">{e.examDate}</td>
                      <td className="py-1.5 pr-4">{ix.bopPercent === null ? "—" : `${ix.bopPercent}%`}</td>
                      <td className="py-1.5 pr-4">{ix.plaquePercent === null ? "—" : `${ix.plaquePercent}%`}</td>
                      <td className="py-1.5 pr-4">{ix.deepestPocket === null ? "—" : `${ix.deepestPocket} mm`}</td>
                      <td className="py-1.5 pr-4">{ix.pockets6plus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
