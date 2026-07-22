import { describe, it, expect } from "vitest";
import { visiblePatientsForDoctor } from "@/lib/agenda/doctorPatientVisibility";

describe("visiblePatientsForDoctor", () => {
  const patients = [
    { id: "p1", full_name: "Julian Uriona" },
    { id: "p2", full_name: "Ana Paz" },
    { id: "p3", full_name: "Luis Rojas" },
  ];

  it("incluye a los pacientes ya atendidos por el doctor", () => {
    const result = visiblePatientsForDoctor(patients, ["p2"], ["p2", "p3"]);
    expect(result.map((p) => p.id)).toContain("p2");
  });

  it("incluye a un paciente NUEVO que ningún doctor atendió aún (bug: doctor Pinto / Julian Uriona)", () => {
    // p1 (Julian Uriona) nunca tuvo cita ni trabajo con NINGÚN doctor todavía.
    // Antes del fix, el doctor Pinto no lo veía en el picker para agendar su
    // primera cita porque el filtro solo dejaba pasar "mis propios pacientes".
    const result = visiblePatientsForDoctor(patients, ["p2"], ["p2", "p3"]);
    expect(result.map((p) => p.id)).toContain("p1");
  });

  it("excluye a un paciente ya atendido por OTRO doctor", () => {
    // p3 ya tiene cita/trabajo (está en claimedIds) pero no es del doctor actual
    // (no está en ownIds) -> no debe verse en el picker de este doctor.
    const result = visiblePatientsForDoctor(patients, ["p2"], ["p2", "p3"]);
    expect(result.map((p) => p.id)).not.toContain("p3");
  });

  it("con ownIds y claimedIds vacíos, todos los pacientes son visibles (clínica nueva)", () => {
    const result = visiblePatientsForDoctor(patients, [], []);
    expect(result.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("acepta Set además de array para ownIds/claimedIds", () => {
    const result = visiblePatientsForDoctor(patients, new Set(["p2"]), new Set(["p2", "p3"]));
    expect(result.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });
});
