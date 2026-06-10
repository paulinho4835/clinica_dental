export type Medication = {
  name: string;
  dosage: string;
  instructions: string;
};

export type PrescriptionRow = {
  id: string;
  doctorName: string | null;
  medications: Medication[];
  notes: string | null;
  issuedAt: string; // ISO
};

export function validateMedications(meds: Medication[]): string | null {
  if (meds.length === 0) return "Agrega al menos un medicamento.";
  for (const m of meds) {
    if (!m.name.trim()) return "El nombre del medicamento es requerido.";
    if (!m.dosage.trim()) return "La dosis del medicamento es requerida.";
  }
  return null;
}
