import { describe, it, expect } from "vitest";
import { canEditAnamnesis } from "@/lib/rbac";

describe("canEditAnamnesis", () => {
  it("permite a roles clínicos", () => {
    for (const r of ["admin", "odontologo_general", "especialista", "colega"]) {
      expect(canEditAnamnesis(r)).toBe(true);
    }
  });
  it("niega a recepcionista, asistente y desconocidos", () => {
    for (const r of ["recepcionista", "asistente", undefined, "otro"]) {
      expect(canEditAnamnesis(r as string | undefined)).toBe(false);
    }
  });
});
