"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Trash2, Plus, Lock, History, ChevronDown } from "lucide-react";
import {
  addEvolutionNote,
  updateEvolutionNote,
  deleteEvolutionNote,
  type EvolutionNote,
  type EvolutionNoteHistory,
} from "@/app/(dashboard)/pacientes/actions";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EvolutionPanel({
  patientId,
  notes,
  history,
  legacyEvolution,
  canWrite,
  canSeeHistory,
  currentUserId,
}: {
  patientId: string;
  notes: EvolutionNote[];
  /** Versiones anteriores (editadas/borradas), capturadas por el trigger. */
  history: EvolutionNoteHistory[];
  legacyEvolution: string | null;
  /** true solo para admin y doctores (no recepcionista). */
  canWrite: boolean;
  /** true solo para admin: ver el historial de ediciones/borrados. */
  canSeeHistory: boolean;
  /** id del usuario logueado, para saber qué notas puede editar. */
  currentUserId: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();

  function handleAdd() {
    start(async () => {
      const res = await addEvolutionNote(patientId, draft);
      if (res.error) {
        toast(res.error, "error");
      } else {
        setDraft("");
        setAdding(false);
        router.refresh();
        toast("Nota agregada", "success");
      }
    });
  }

  function handleUpdate(noteId: string) {
    start(async () => {
      const res = await updateEvolutionNote(noteId, patientId, editValue);
      if (res.error) {
        toast(res.error, "error");
      } else {
        setEditingId(null);
        router.refresh();
        toast("Nota actualizada", "success");
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("¿Borrar esta nota de evolución? No se puede deshacer.")) return;
    start(async () => {
      const res = await deleteEvolutionNote(noteId, patientId);
      if (res.error) {
        toast(res.error, "error");
      } else {
        router.refresh();
        toast("Nota borrada", "success");
      }
    });
  }

  const total = notes.length + (legacyEvolution ? 1 : 0);
  const isEmpty = total === 0;

  return (
    <div className="space-y-3">
      {/* Barra superior: contador + agregar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {isEmpty
            ? "Sin notas de evolución aún."
            : `${total} nota${total !== 1 ? "s" : ""}`}
        </span>
        {canWrite && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar nota
          </button>
        )}
      </div>

      {/* Formulario para agregar nota */}
      {canWrite && adding && (
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-clinic/40 space-y-3">
          <textarea
            autoFocus
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe la nota de evolución…"
            className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleAdd} disabled={pending || !draft.trim()}>
              <Check className="h-3.5 w-3.5" />
              {pending ? "Guardando…" : "Guardar nota"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista única, compacta y con scroll (más recientes primero) */}
      {!isEmpty && (
        <div className="max-h-[28rem] overflow-y-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => {
              const mine = n.author_id === currentUserId;
              const editedFlag = n.updated_at !== n.created_at;
              return (
                <li key={n.id} className="px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="font-semibold text-slate-700">{n.author_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{fmt(n.created_at)}</span>
                      {editedFlag && <span className="italic text-slate-400">(editado)</span>}
                    </div>
                    {canWrite &&
                      (mine ? (
                        editingId === n.id ? null : (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(n.id);
                                setEditValue(n.body);
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-clinic"
                              title="Editar mi nota"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(n.id)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Borrar mi nota"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        <span
                          className="shrink-0 text-slate-300"
                          title="Solo el autor puede editar esta nota"
                        >
                          <Lock className="h-3 w-3" />
                        </span>
                      ))}
                  </div>

                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        autoFocus
                        rows={4}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleUpdate(n.id)} disabled={pending || !editValue.trim()}>
                          <Check className="h-3.5 w-3.5" />
                          {pending ? "Guardando…" : "Guardar"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={pending}>
                          <X className="h-3.5 w-3.5" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {n.body}
                    </p>
                  )}
                </li>
              );
            })}

            {/* Nota histórica del campo libre anterior (solo lectura) */}
            {legacyEvolution && (
              <li className="bg-slate-50 px-4 py-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="h-3 w-3" />
                  Nota histórica (sin autor registrado)
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {legacyEvolution}
                </p>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Historial de cambios (versiones editadas/borradas): solo admin */}
      {canSeeHistory && history.length > 0 && (
        <div className="rounded-lg ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <History className="h-3.5 w-3.5" />
              Historial de cambios ({history.length})
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${showHistory ? "rotate-180" : ""}`}
            />
          </button>

          {showHistory && (
            <div className="max-h-80 overflow-y-auto border-t border-slate-100">
              <ul className="divide-y divide-slate-100">
                {history.map((h) => (
                  <li key={h.id} className="px-4 py-3">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          h.action === "deleted"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {h.action === "deleted" ? "Borrada" : "Versión anterior"}
                      </span>
                      <span className="font-semibold text-slate-700">{h.author_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{fmt(h.changed_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                      {h.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
