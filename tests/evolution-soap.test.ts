import { describe, it, expect } from "vitest";
import type { EvolutionNote, SoapFields } from "@/app/(dashboard)/pacientes/actions";

describe("EvolutionNote SOAP fields", () => {
  it("nota libre: body obligatorio, campos SOAP vacíos", () => {
    const note: EvolutionNote = {
      id: "x", author_id: "a", author_name: "Dr. A",
      body: "Texto libre", note_type: "free",
      appointment_id: null,
      subjective: "", objective: "", assessment: "", plan: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.note_type).toBe("free");
    expect(note.body).not.toBe("");
  });

  it("nota SOAP: body vacío, al menos un campo SOAP", () => {
    const note: EvolutionNote = {
      id: "y", author_id: "b", author_name: "Dr. B",
      body: "", note_type: "soap",
      appointment_id: "appt-123",
      subjective: "Dolor molar", objective: "Caries clase II",
      assessment: "Caries dentina", plan: "Obturación resina",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.note_type).toBe("soap");
    expect(note.body).toBe("");
    expect(note.subjective).not.toBe("");
  });

  it("nota SOAP sin cita asignada es válida", () => {
    const note: EvolutionNote = {
      id: "z", author_id: "c", author_name: "Dr. C",
      body: "", note_type: "soap",
      appointment_id: null,
      subjective: "Revisión", objective: "Normal",
      assessment: "Sin hallazgos", plan: "Control en 6 meses",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.appointment_id).toBeNull();
    expect(note.plan).not.toBe("");
  });

  it("SoapFields tiene exactamente las 4 claves SOAP", () => {
    const s: SoapFields = {
      subjective: "a", objective: "b", assessment: "c", plan: "d",
    };
    expect(Object.keys(s)).toHaveLength(4);
  });
});
