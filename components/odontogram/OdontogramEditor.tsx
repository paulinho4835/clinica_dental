"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, FilePenLine, Pencil, Trash2 } from "lucide-react";
import { saveOdontogram } from "@/app/(dashboard)/pacientes/odontogram-actions";
import { Odontogram } from "./Odontogram";
import { VoiceDictationButton } from "./VoiceDictationButton";
import { applyVoiceOperations, type VoiceOperation } from "@/lib/odontogram/voice";
import {
  CONDITION_COLORS,
  CONDITION_LABELS,
  CUSTOM_NOTE_COLOR,
  MARK_COLORS,
  MARK_LABELS,
  SURFACE_CONDITIONS,
  WHOLE_CONDITIONS,
  markWhole,
  type MarkColor,
  type Surface,
  type TeethMap,
  type ToothNote,
  type ToothState,
} from "@/lib/odontogram/types";

const DEFAULT_TOOTH: ToothState = { present: true, whole: null, surfaces: {} };

type Tool =
  | { kind: "surface"; code: string }
  | { kind: "whole"; code: string }
  | { kind: "mark"; code: MarkColor }
  | { kind: "note" }
  | { kind: "erase" };

type SaveAction = (
  patientId: string,
  prevTeeth: TeethMap,
  nextTeeth: TeethMap,
) => Promise<{ error?: string; ok?: boolean }>;

export function OdontogramEditor({
  patientId,
  initialTeeth,
  canWrite,
  quadrants,
  quadrantNumbers,
  saveAction = saveOdontogram,
  voiceEnabled = false,
}: {
  patientId: string;
  initialTeeth: TeethMap;
  canWrite: boolean;
  quadrants?: string[][];
  quadrantNumbers?: [number, number, number, number];
  saveAction?: SaveAction;
  voiceEnabled?: boolean;
}) {
  const router = useRouter();
  const [teeth, setTeeth] = useState<TeethMap>(initialTeeth);
  const [baseline, setBaseline] = useState<TeethMap>(initialTeeth);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: "surface", code: "caries" });
  const [noteTarget, setNoteTarget] = useState<{ fdi: string; surface?: Surface } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState<{ fdi: string; id: string } | null>(null);

  function applyWhole(fdi: string, code: string | null) {
    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      return { ...prev, [fdi]: { ...tooth, whole: tooth.whole === code ? null : code } };
    });
    setDirty(true);
  }

  function beginNote(fdi: string, surface?: Surface, note?: ToothNote) {
    setNoteTarget({ fdi, surface });
    setEditingNote(note ? { fdi, id: note.id } : null);
    setNoteText(note?.text ?? "");
    setError(null);
  }

  function onSurfaceClick(fdi: string, surface: Surface) {
    if (tool.kind === "whole") return applyWhole(fdi, tool.code);
    if (tool.kind === "mark") return applyWhole(fdi, markWhole(tool.code));
    if (tool.kind === "note") return beginNote(fdi, surface);

    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const surfaces = { ...tooth.surfaces };
      if (tool.kind === "erase") delete surfaces[surface];
      else surfaces[surface] = tool.code;
      return { ...prev, [fdi]: { ...tooth, surfaces } };
    });
    setDirty(true);
  }

  function onWholeClick(fdi: string) {
    if (tool.kind === "surface") return;
    if (tool.kind === "erase") return applyWhole(fdi, null);
    if (tool.kind === "mark") return applyWhole(fdi, markWhole(tool.code));
    if (tool.kind === "note") return beginNote(fdi);
    applyWhole(fdi, tool.code);
  }

  function saveNote() {
    const text = noteText.trim();
    if (!noteTarget) return;
    if (!text) return setError("Escribe la nota antes de agregarla.");
    if (text.length > 500) return setError("La nota puede tener como maximo 500 caracteres.");

    setTeeth((prev) => {
      const tooth = prev[noteTarget.fdi] ?? DEFAULT_TOOTH;
      const notes = tooth.notes ?? [];
      const nextNote: ToothNote = editingNote
        ? { id: editingNote.id, text, ...(noteTarget.surface ? { surface: noteTarget.surface } : {}) }
        : { id: crypto.randomUUID(), text, ...(noteTarget.surface ? { surface: noteTarget.surface } : {}) };
      const nextNotes = editingNote
        ? notes.map((note) => (note.id === editingNote.id ? nextNote : note))
        : [...notes, nextNote];
      return { ...prev, [noteTarget.fdi]: { ...tooth, notes: nextNotes } };
    });
    setDirty(true);
    setNoteTarget(null);
    setEditingNote(null);
    setNoteText("");
  }

  function deleteNote(fdi: string, id: string) {
    setTeeth((prev) => {
      const tooth = prev[fdi];
      if (!tooth) return prev;
      return { ...prev, [fdi]: { ...tooth, notes: (tooth.notes ?? []).filter((note) => note.id !== id) } };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveAction(patientId, baseline, teeth);
    setSaving(false);
    if (res.error) return setError(res.error);
    setBaseline(teeth);
    setDirty(false);
    router.refresh();
  }

  function applyVoice(operations: VoiceOperation[]) {
    setTeeth((prev) => applyVoiceOperations(prev, operations));
    setDirty(true);
  }

  const isActive = (candidate: Tool): boolean => {
    if (candidate.kind !== tool.kind) return false;
    if (candidate.kind === "erase" || candidate.kind === "note") return true;
    if (tool.kind === "erase" || tool.kind === "note") return false;
    return candidate.code === tool.code;
  };

  const swatchBtn = (candidate: Extract<Tool, { code: string }>, color: string, label: string) => (
    <button key={`${candidate.kind}-${candidate.code}`} type="button" onClick={() => setTool(candidate)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${isActive(candidate) ? "bg-clinic/10 text-clinic-fg ring-clinic" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}>
      <span className="inline-block h-3.5 w-3.5 rounded-sm ring-1 ring-slate-300" style={{ background: color }} />
      {label}
    </button>
  );

  if (!canWrite) {
    return <div className="space-y-3"><p className="text-sm text-slate-500">Vista de solo lectura. Solo los doctores y el administrador pueden modificar el odontograma.</p><Odontogram teeth={teeth} quadrants={quadrants} quadrantNumbers={quadrantNumbers} /></div>;
  }

  const notes = Object.entries(teeth).flatMap(([fdi, tooth]) => (tooth.notes ?? []).map((note) => ({ fdi, note })));

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Elige una condicion y haz clic en la <strong>cara</strong> del diente. Para condiciones de <strong>diente completo</strong> y <strong>marcas X</strong>, haz clic en el numero o sobre el diente. Para una <strong>nota personalizada</strong>, selecciona la herramienta, elige una cara o diente y escribe el detalle.</p>
      {voiceEnabled && <VoiceDictationButton patientId={patientId} onApply={applyVoice} />}

      <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Caras</p><div className="flex flex-wrap gap-1.5">{SURFACE_CONDITIONS.map((code) => swatchBtn({ kind: "surface", code }, CONDITION_COLORS[code], CONDITION_LABELS[code]))}</div></div>
        <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Diente completo</p><div className="flex flex-wrap gap-1.5">{WHOLE_CONDITIONS.map((code) => swatchBtn({ kind: "whole", code }, CONDITION_COLORS[code], CONDITION_LABELS[code]))}</div></div>
        <div className="flex flex-wrap items-end gap-4">
          <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Marcas X</p><div className="flex flex-wrap gap-1.5">{(["rojo", "azul"] as MarkColor[]).map((color) => { const candidate: Tool = { kind: "mark", code: color }; return <button key={color} type="button" onClick={() => setTool(candidate)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${isActive(candidate) ? "bg-clinic/10 text-clinic-fg ring-clinic" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}><span className="text-sm font-bold" style={{ color: MARK_COLORS[color] }}>X</span>{MARK_LABELS[color]}</button>; })}</div></div>
          <button type="button" onClick={() => setTool({ kind: "note" })} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${tool.kind === "note" ? "bg-clinic/10 text-clinic-fg ring-clinic" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}><FilePenLine className="h-3.5 w-3.5" style={{ color: CUSTOM_NOTE_COLOR }} />Nota personalizada</button>
          <button type="button" onClick={() => setTool({ kind: "erase" })} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${tool.kind === "erase" ? "bg-clinic/10 text-clinic-fg ring-clinic" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}><Eraser className="h-3.5 w-3.5" />Borrar</button>
        </div>
      </div>

      {noteTarget && <div className="rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200"><label className="block text-sm font-medium text-violet-950" htmlFor="odontogram-note">Nota para diente {noteTarget.fdi}{noteTarget.surface ? `, cara ${noteTarget.surface}` : " (diente completo)"}</label><textarea id="odontogram-note" value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={500} rows={3} autoFocus placeholder="Describe el hallazgo u observacion clinica..." className="mt-2 w-full rounded-md border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200" /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-violet-700">{noteText.length}/500</span><div className="flex gap-2"><button type="button" onClick={() => { setNoteTarget(null); setEditingNote(null); setNoteText(""); }} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-white">Cancelar</button><button type="button" onClick={saveNote} className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800">{editingNote ? "Actualizar nota" : "Agregar nota"}</button></div></div></div>}

      <Odontogram teeth={teeth} onSurfaceClick={onSurfaceClick} onWholeClick={onWholeClick} quadrants={quadrants} quadrantNumbers={quadrantNumbers} hideNotes />

      {notes.length > 0 && <div className="rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200"><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">Notas personalizadas</p><ul className="space-y-2">{notes.map(({ fdi, note }) => <li key={`${fdi}-${note.id}`} className="flex items-start justify-between gap-3 text-sm text-slate-700"><span><strong>Diente {fdi}{note.surface ? ` - cara ${note.surface}` : " - diente completo"}:</strong> {note.text}</span><span className="flex shrink-0 gap-1"><button type="button" onClick={() => beginNote(fdi, note.surface, note)} className="rounded p-1 text-violet-700 hover:bg-violet-100" aria-label={`Editar nota del diente ${fdi}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => deleteNote(fdi, note.id)} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Eliminar nota del diente ${fdi}`}><Trash2 className="h-3.5 w-3.5" /></button></span></li>)}</ul></div>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={save} disabled={!dirty || saving} className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50">{saving ? "Guardando..." : dirty ? "Guardar cambios" : "Sin cambios"}</button>
    </div>
  );
}
