import { describe, it, expect } from "vitest";
import { getDoctorColor, DOCTOR_PALETTE } from "@/lib/agenda/doctorColor";

describe("getDoctorColor", () => {
  it("devuelve objeto con bg, border, text para cualquier id", () => {
    const c = getDoctorColor("abc123");
    expect(c).toHaveProperty("bg");
    expect(c).toHaveProperty("border");
    expect(c).toHaveProperty("text");
  });

  it("el mismo id siempre devuelve el mismo color (determinístico)", () => {
    expect(getDoctorColor("doc-1")).toEqual(getDoctorColor("doc-1"));
  });

  it("ids distintos pueden dar distintos colores", () => {
    const colors = Array.from({ length: 8 }, (_, i) =>
      getDoctorColor(`test-doc-${i}`)
    );
    const unique = new Set(colors.map((c) => c.bg));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("id vacío devuelve color slate (sin asignar)", () => {
    expect(() => getDoctorColor("")).not.toThrow();
    const c = getDoctorColor("");
    expect(c.bg).toBe("bg-slate-100");
  });

  it("la paleta tiene exactamente 8 entradas", () => {
    expect(DOCTOR_PALETTE).toHaveLength(8);
  });

  it("ninguna entrada de la paleta tiene campos vacíos", () => {
    for (const entry of DOCTOR_PALETTE) {
      expect(entry.bg).toBeTruthy();
      expect(entry.border).toBeTruthy();
      expect(entry.text).toBeTruthy();
    }
  });
});
