"use client";

import type { VoiceOperation } from "@/lib/odontogram/voice";
import { describeVoiceOperation } from "@/lib/odontogram/voice";

export function VoiceReviewDialog({
  transcript,
  operations,
  uncertainties,
  warnings,
  onRemove,
  onDismissUncertainty,
  onApply,
  onCancel,
}: {
  transcript: string;
  operations: VoiceOperation[];
  uncertainties: string[];
  warnings: string[];
  onRemove: (index: number) => void;
  onDismissUncertainty: (index: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const canApply = uncertainties.length === 0 && operations.length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <section aria-modal="true" aria-labelledby="voice-review-title" role="dialog" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="voice-review-title" className="text-lg font-semibold text-slate-900">Revisar cambios dictados</h3>
            <p className="mt-1 text-sm text-slate-500">Nada se guarda hasta usar «Guardar cambios» en el odontograma.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cerrar revisión" className="rounded p-1 text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-700"><strong>Transcripción:</strong> {transcript}</div>
        {uncertainties.length > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Requiere revisión manual</strong>
            <p className="mt-1 text-amber-800">Corrige estos casos desde la paleta y descártalos aquí para poder aplicar el resto.</p>
            <ul className="mt-2 space-y-2">
              {uncertainties.map((item, i) => (
                <li key={`${item}-${i}`} className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-white/60 p-2">
                  <span>{item}</span>
                  <button type="button" onClick={() => onDismissUncertainty(i)} className="shrink-0 rounded px-2 py-1 text-amber-900 hover:bg-amber-100">Descartar</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Propuestas descartadas por seguridad</strong><ul className="mt-1 list-disc pl-5">{warnings.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul></div>}
        <ul className="mt-4 space-y-2" aria-label="Cambios propuestos">
          {operations.map((operation, index) => <li key={`${operation.action}-${operation.tooth}-${index}`} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-3 text-sm"><span>{describeVoiceOperation(operation)}</span><button type="button" onClick={() => onRemove(index)} className="rounded px-2 py-1 text-red-700 hover:bg-red-50">Descartar</button></li>)}
        </ul>
        {operations.length === 0 && <p className="mt-4 text-sm text-slate-500">No hay cambios seguros para aplicar.</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Cancelar</button><button type="button" onClick={onApply} disabled={!canApply} className="rounded-md bg-clinic px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Aplicar al odontograma</button></div>
      </section>
    </div>
  );
}
