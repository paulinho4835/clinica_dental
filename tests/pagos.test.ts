import { describe, it, expect } from "vitest";
import { COMMISSION_ROLES, sumPendingCommissions } from "@/lib/pagos";

describe("COMMISSION_ROLES", () => {
  it("incluye a los roles clínicos y al admin, no a recepcionista/asistente", () => {
    expect(COMMISSION_ROLES.has("odontologo_general")).toBe(true);
    expect(COMMISSION_ROLES.has("especialista")).toBe(true);
    expect(COMMISSION_ROLES.has("colega")).toBe(true);
    expect(COMMISSION_ROLES.has("admin")).toBe(true);
    expect(COMMISSION_ROLES.has("recepcionista")).toBe(false);
    expect(COMMISSION_ROLES.has("asistente")).toBe(false);
  });
});

describe("sumPendingCommissions", () => {
  it("suma el restante por doctor (comisión + lab − abonado)", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 20, commission_paid_amount: 0 },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 30 },
      { doctor_id: "b", commission_amount: 200, lab_commission_amount: 0, commission_paid_amount: 0 },
    ]);
    expect(map.get("a")).toBe(140); // 120 + 20
    expect(map.get("b")).toBe(200);
  });

  it("ignora trabajos con comisión saldada (restante ≤ 0.005)", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 0, commission_paid_amount: 100 },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 49.996 },
    ]);
    expect(map.has("a")).toBe(false);
  });

  it("redondea a 2 decimales los acumulados con flotantes", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 0.1, lab_commission_amount: 0, commission_paid_amount: 0 },
      { doctor_id: "a", commission_amount: 0.2, lab_commission_amount: 0, commission_paid_amount: 0 },
    ]);
    expect(map.get("a")).toBe(0.3);
  });

  it("devuelve mapa vacío sin filas", () => {
    expect(sumPendingCommissions([]).size).toBe(0);
  });
});
