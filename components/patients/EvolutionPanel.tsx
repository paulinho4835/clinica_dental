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
  type SoapFields,
} from "@/app/(dashboard)/pacientes/actions";
import type { ApptRow } from "@/components/history/PatientHistoryPanel";
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

function fmtAppt(a: ApptRow) {
  const d = new Date(a.startsAt).toLocaleDateString("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "America/La_Paz",
  });
  return `${d} — ${a.dentistName ?? "Sin doctor"}${a.reason ? ` (${a.reason})` : ""}`;
}

const SOAP_LABELS: { key: keyof SoapFields; short: string; label: string; placeholder: string }[] = [
  { key: "subjective", short: "S", label: "S — Subjetivo",   placeholder: "¿Qué refiere el paciente?" },
  { key: "objective",  short: "O", label: "O — Objetivo",    placeholder: "Hallazgos clínicos…" },
  { key: "assessment", short: "A", label: "A — Diagnóstico", placeholder: "Diagnóstico…" },
  { key: "plan",       short: "P", label: "P — Plan",        placeholder: "Plan de tratamiento…" },
];

const EMPTY_SOAP: SoapFields = { subjective: "", objective: "", assessment: "", plan: "" };

export function EvolutionPanel({
  patientId,
  notes,
  history,
  legacyEvolution,
  canWrite,
  canSeeHistory,
  currentUserId,
  appointments,
}: {
  patientId: string;
  notes: EvolutionNote[];
  history: EvolutionNoteHistory[];
  legacyEvolution: string | null;
  canWrite: boolean;
  canSeeHistory: boolean;
  currentUserId: string;
  appointments: ApptRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [, start] = useTransition();

  function handleDelete(noteId: string) {
    if (!confirm("¿Borrar esta nota de evolución? No se puede deshacer.")) return;
    start(async () => {
      const res = await deleteEvolutionNote(noteId, patientId);
      if (res.error) toast(res.error, "error");
      else { router.refresh(); toast("Nota borrada", "success"); }
    });
  }

  const total = notes.length + (legacyEvolution ? 1 : 0);
  const isEmpty = total === 0;

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {isEmpty ? "Sin notas de evolución aún." : `${total} nota${total !== 1 ? "s" : ""}`}
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

      {/* Formulario de nueva nota */}
      {canWrite && adding && (
        <NoteForm
          patientId={patientId}
          appointments={appointments}
          onDone={() => { setAdding(false); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Lista de notas */}
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
                      {n.note_type === "soap" && (
                        <span className="rounded bg-clinic/10 px-1.5 py-0.5 text-xs font-semibold text-clinic">
                          SOAP
                        </span>
                      )}
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
                              onClick={() => setEditingId(n.id)}
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
                        <span className="shrink-0 text-slate-300" title="Solo el autor puede editar esta nota">
                          <Lock className="h-3 w-3" />
                        </span>
                      ))}
                  </div>

                  {editingId === n.id ? (
                    <EditNoteForm
                      note={n}
                      patientId={patientId}
                      onDone={() => { setEditingId(null); router.refresh(); }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : n.note_type === "soap" ? (
                    <SoapDisplay note={n} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {n.body}
                    </p>
                  )}
                </li>
              );
            })}

            {/* Nota histórica del campo libre anterior */}
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

      {/* Historial de cambios (solo admin) */}
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
                      {h.note_type === "soap" && (
                        <span className="rounded bg-clinic/10 px-1.5 py-0.5 font-semibold text-clinic">
                          SOAP
                        </span>
                      )}
                      <span className="font-semibold text-slate-700">{h.author_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{fmt(h.changed_at)}</span>
                    </div>
                    {h.note_type === "soap" ? (
                      <dl className="space-y-1">
                        {SOAP_LABELS.map(({ key, short }) =>
                          h[key] ? (
                            <div key={key} className="flex gap-2 text-sm">
                              <dt className="w-5 shrink-0 font-semibold text-slate-400">{short}</dt>
                              <dd className="whitespace-pre-wrap text-slate-500">{h[key]}</dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                        {h.body}
                      </p>
                    )}
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

// ── Sub-componentes ──────────────────────────────────────────────────────────

function NoteForm({
  patientId,
  appointments,
  onDone,
  onCancel,
}: {
  patientId: string;
  appointments: ApptRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"free" | "soap">("free");
  const [apptId, setApptId] = useState("");
  const [draft, setDraft] = useState("");
  const [soap, setSoap] = useState<SoapFields>({ ...EMPTY_SOAP });
  const [pending, start] = useTransition();

  function handleSave() {
    start(async () => {
      const opts =
        mode === "soap"
          ? { appointmentId: apptId || null, soap }
          : { appointmentId: apptId || null };
      const res = await addEvolutionNote(patientId, draft, opts);
      if (res.error) toast(res.error, "error");
      else { toast("Nota agregada", "success"); onDone(); }
    });
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-clinic/40 space-y-3">
      {/* Toggle libre / SOAP */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(["free", "soap"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "free" ? "Nota libre" : "SOAP"}
          </button>
        ))}
      </div>

      {/* Selector de cita (opcional) */}
      {appointments.length > 0 && (
        <label className="block text-xs">
          <span className="mb-1 block text-slate-500">Vincular a cita (opcional)</span>
          <select
            value={apptId}
            onChange={(e) => setApptId(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
          >
            <option value="">— Sin cita asignada —</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>{fmtAppt(a)}</option>
            ))}
          </select>
        </label>
      )}

      {mode === "free" ? (
        <textarea
          autoFocus
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe la nota de evolución…"
          className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOAP_LABELS.map(({ key, label, placeholder }) => (
            <label key={key} className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">{label}</span>
              <textarea
                rows={3}
                value={soap[key]}
                onChange={(e) => setSoap((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Guardando…" : "Guardar nota"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function SoapDisplay({ note }: { note: EvolutionNote }) {
  return (
    <dl className="space-y-1.5">
      {SOAP_LABELS.map(({ key, short }) =>
        note[key] ? (
          <div key={key} className="flex gap-2 text-sm">
            <dt className="w-5 shrink-0 font-semibold text-clinic">{short}</dt>
            <dd className="whitespace-pre-wrap text-slate-700">{note[key]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function EditNoteForm({
  note,
  patientId,
  onDone,
  onCancel,
}: {
  note: EvolutionNote;
  patientId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(note.body);
  const [soap, setSoap] = useState<SoapFields>({
    subjective: note.subjective,
    objective: note.objective,
    assessment: note.assessment,
    plan: note.plan,
  });
  const [pending, start] = useTransition();

  function handleUpdate() {
    start(async () => {
      const opts = note.note_type === "soap" ? { soap } : undefined;
      const res = await updateEvolutionNote(note.id, patientId, draft, opts);
      if (res.error) toast(res.error, "error");
      else { toast("Nota actualizada", "success"); onDone(); }
    });
  }

  if (note.note_type === "soap") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SOAP_LABELS.map(({ key, label }) => (
            <label key={key} className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">{label}</span>
              <textarea
                rows={3}
                value={soap[key]}
                onChange={(e) => setSoap((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleUpdate} disabled={pending}>
            <Check className="h-3.5 w-3.5" />
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleUpdate} disabled={pending || !draft.trim()}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
