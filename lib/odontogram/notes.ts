import type { TeethMap, ToothNote } from "./types";

const SURFACES = new Set(["O", "M", "D", "V", "L"]);
const MAX_NOTES_PER_TOOTH = 20;
const MAX_NOTE_LENGTH = 500;

/** Validación de defensa en profundidad: las server actions no confían en el cliente. */
export function validateToothNotes(teeth: TeethMap): string | null {
  for (const [fdi, tooth] of Object.entries(teeth)) {
    if (tooth.notes === undefined) continue;
    if (!Array.isArray(tooth.notes) || tooth.notes.length > MAX_NOTES_PER_TOOTH)
      return `El diente ${fdi} puede tener como máximo ${MAX_NOTES_PER_TOOTH} notas.`;

    const ids = new Set<string>();
    for (const note of tooth.notes) {
      if (!note || typeof note.id !== "string" || !note.id || note.id.length > 80 || ids.has(note.id))
        return `Una nota del diente ${fdi} no es válida.`;
      if (typeof note.text !== "string" || !note.text.trim() || note.text.trim().length > MAX_NOTE_LENGTH)
        return `Las notas del diente ${fdi} deben tener entre 1 y ${MAX_NOTE_LENGTH} caracteres.`;
      if (note.surface !== undefined && !SURFACES.has(note.surface))
        return `La cara indicada en una nota del diente ${fdi} no es válida.`;
      ids.add(note.id);
    }
  }
  return null;
}

export type NoteAuditEvent = {
  tooth_fdi: string;
  surface: string | null;
  prev_state: string | null;
  new_state: string | null;
};

function auditText(note: ToothNote | undefined): string | null {
  return note ? `Nota: ${note.text}` : null;
}

/** Un evento por alta, edición o eliminación de una nota clínica. */
export function diffToothNotes(prev: TeethMap, next: TeethMap): NoteAuditEvent[] {
  const events: NoteAuditEvent[] = [];
  const fdis = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const fdi of fdis) {
    const before = new Map((prev[fdi]?.notes ?? []).map((note) => [note.id, note]));
    const after = new Map((next[fdi]?.notes ?? []).map((note) => [note.id, note]));
    const ids = new Set([...before.keys(), ...after.keys()]);
    for (const id of ids) {
      const oldNote = before.get(id);
      const newNote = after.get(id);
      if (oldNote?.text === newNote?.text && oldNote?.surface === newNote?.surface) continue;
      events.push({
        tooth_fdi: fdi,
        surface: newNote?.surface ?? oldNote?.surface ?? null,
        prev_state: auditText(oldNote),
        new_state: auditText(newNote),
      });
    }
  }
  return events;
}
