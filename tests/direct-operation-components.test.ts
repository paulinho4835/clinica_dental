import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("formularios directos a Supabase", () => {
  it("crea pacientes sin ejecutar una Server Action de Vercel", () => {
    const source = readFileSync(resolve(process.cwd(), "components/patients/NewPatientForm.tsx"), "utf8");
    expect(source).toContain("submitPatient(");
    expect(source).not.toContain("useActionState(createPatient");
    expect(source).not.toContain("@/app/(dashboard)/pacientes/actions");
  });

  it("registra pagos sin ejecutar addPatientPayment en Vercel", () => {
    const source = readFileSync(resolve(process.cwd(), "components/history/PatientHistoryPanel.tsx"), "utf8");
    expect(source).toContain("submitPatientPayment(");
    expect(source).not.toContain("useActionState(addPatientPayment");
  });

  it("crea el paciente rapido de agenda directamente en Supabase", () => {
    const source = readFileSync(resolve(process.cwd(), "components/agenda/LinkPatientModal.tsx"), "utf8");
    expect(source).toContain("submitPatient(");
    expect(source).not.toContain("createPatientQuick");
  });

  it("carga plan y saldo de Mis trabajos sin APIs de Vercel", () => {
    const source = readFileSync(resolve(process.cwd(), "components/mis-trabajos/WorkForm.tsx"), "utf8");
    expect(source).toContain("loadPatientFinancialSummary(");
    expect(source).not.toContain("/api/patients/");
  });
});
