import { describe, it, expect } from "vitest";
import {
  COMMISSION_ROLES,
  sumPendingCommissions,
  OVERDUE_DAYS,
  daysSince,
  isOverdue,
  summarizePendingByDoctor,
} from "@/lib/pagos";

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

describe("daysSince", () => {
  it("calcula días completos entre dos fechas YYYY-MM-DD", () => {
    expect(daysSince("2026-06-01", "2026-07-01")).toBe(30);
    expect(daysSince("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("ignora la hora si la fecha viene con timestamp", () => {
    expect(daysSince("2026-06-01T23:59:00Z", "2026-07-01T00:00:00Z")).toBe(30);
  });
});

describe("isOverdue", () => {
  it(`es true cuando pasaron más de ${OVERDUE_DAYS} días`, () => {
    expect(isOverdue("2026-05-01", "2026-07-01")).toBe(true);
  });

  it(`es false a los ${OVERDUE_DAYS} días exactos o menos`, () => {
    expect(isOverdue("2026-06-01", "2026-07-01")).toBe(false);
    expect(isOverdue("2026-06-30", "2026-07-01")).toBe(false);
  });
});

describe("summarizePendingByDoctor", () => {
  it("suma el restante y guarda la fecha más antigua con comisión pendiente", () => {
    const map = summarizePendingByDoctor([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 0, commission_paid_amount: 0, performed_at: "2026-06-10" },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 0, performed_at: "2026-05-01" },
      { doctor_id: "b", commission_amount: 200, lab_commission_amount: 0, commission_paid_amount: 0, performed_at: "2026-06-20" },
    ]);
    expect(map.get("a")).toEqual({ amount: 150, oldestPerformedAt: "2026-05-01" });
    expect(map.get("b")).toEqual({ amount: 200, oldestPerformedAt: "2026-06-20" });
  });

  it("ignora filas con comisión saldada (restante ≤ 0.005) al calcular monto y fecha", () => {
    const map = summarizePendingByDoctor([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 0, commission_paid_amount: 100, performed_at: "2026-01-01" },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 0, performed_at: "2026-06-10" },
    ]);
    expect(map.get("a")).toEqual({ amount: 50, oldestPerformedAt: "2026-06-10" });
  });

  it("devuelve mapa vacío sin filas pendientes", () => {
    expect(summarizePendingByDoctor([]).size).toBe(0);
  });
});
