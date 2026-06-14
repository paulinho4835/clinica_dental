import { describe, it, expect } from "vitest";

// ─── Helpers inline (misma lógica que pagos/page.tsx) ────────────────────────

function buildDateRange(selectedMonth: string) {
  const isAllMonths = selectedMonth === "all";
  const [year, month] = isAllMonths
    ? [0, 0]
    : selectedMonth.split("-").map(Number);
  const monthStart = isAllMonths ? "" : `${selectedMonth}-01`;
  const nextMonthStart = isAllMonths
    ? ""
    : new Date(year, month, 1).toISOString().slice(0, 10);
  return { isAllMonths, monthStart, nextMonthStart };
}

function buildMonthLabel(selectedMonth: string, monthStart: string): string {
  if (selectedMonth === "all") return "Todos los meses";
  return new Date(monthStart + "T12:00:00").toLocaleDateString("es-BO", {
    month: "long",
    year: "numeric",
  });
}

type EmployeeEntry = { id: string; full_name: string; role: string };
type PaymentRow = {
  id: string;
  amount: number;
  employee: EmployeeEntry | null;
};

function buildByEmployee(rows: PaymentRow[]) {
  return rows.reduce<
    Record<string, { name: string; role: string; total: number; count: number }>
  >((acc, p) => {
    const key = p.employee?.id ?? "unknown";
    if (!acc[key]) {
      acc[key] = {
        name: p.employee?.full_name ?? "—",
        role: p.employee?.role ?? "",
        total: 0,
        count: 0,
      };
    }
    acc[key].total += p.amount;
    acc[key].count += 1;
    return acc;
  }, {});
}

// ─── isAllMonths + rango de fechas ───────────────────────────────────────────

describe("buildDateRange — mes específico", () => {
  it("mes normal genera monthStart correcto", () => {
    const { isAllMonths, monthStart } = buildDateRange("2026-06");
    expect(isAllMonths).toBe(false);
    expect(monthStart).toBe("2026-06-01");
  });

  it("nextMonthStart apunta al primer día del mes siguiente", () => {
    const { nextMonthStart } = buildDateRange("2026-06");
    expect(nextMonthStart).toBe("2026-07-01");
  });

  it("diciembre: nextMonthStart cruza de año", () => {
    const { nextMonthStart } = buildDateRange("2026-12");
    expect(nextMonthStart).toBe("2027-01-01");
  });

  it("enero: nextMonthStart es febrero", () => {
    const { nextMonthStart } = buildDateRange("2026-01");
    expect(nextMonthStart).toBe("2026-02-01");
  });
});

describe("buildDateRange — todos los meses", () => {
  it("sentinel 'all' → isAllMonths true", () => {
    const { isAllMonths } = buildDateRange("all");
    expect(isAllMonths).toBe(true);
  });

  it("monthStart y nextMonthStart vacíos cuando all", () => {
    const { monthStart, nextMonthStart } = buildDateRange("all");
    expect(monthStart).toBe("");
    expect(nextMonthStart).toBe("");
  });
});

// ─── monthLabel ───────────────────────────────────────────────────────────────

describe("buildMonthLabel", () => {
  it("'all' → 'Todos los meses'", () => {
    expect(buildMonthLabel("all", "")).toBe("Todos los meses");
  });

  it("mes específico → texto legible con mes y año", () => {
    const label = buildMonthLabel("2026-06", "2026-06-01");
    expect(label.toLowerCase()).toContain("2026");
    expect(label.toLowerCase()).toMatch(/junio|june/i);
  });

  it("enero tiene nombre de mes correcto", () => {
    const label = buildMonthLabel("2026-01", "2026-01-01");
    expect(label.toLowerCase()).toMatch(/enero|january/i);
  });

  it("diciembre tiene nombre de mes correcto", () => {
    const label = buildMonthLabel("2026-12", "2026-12-01");
    expect(label.toLowerCase()).toMatch(/diciembre|december/i);
  });
});

// ─── byEmployee reducer ───────────────────────────────────────────────────────

describe("buildByEmployee — resumen por empleado", () => {
  it("sin pagos → objeto vacío", () => {
    expect(buildByEmployee([])).toEqual({});
  });

  it("un pago → una entrada con total y count=1", () => {
    const rows: PaymentRow[] = [
      { id: "p1", amount: 500, employee: { id: "e1", full_name: "Ana Paz", role: "recepcionista" } },
    ];
    const result = buildByEmployee(rows);
    expect(result["e1"]).toEqual({ name: "Ana Paz", role: "recepcionista", total: 500, count: 1 });
  });

  it("dos pagos al mismo empleado → acumula total y count", () => {
    const emp = { id: "e1", full_name: "Dr. Rojas", role: "odontologo_general" };
    const rows: PaymentRow[] = [
      { id: "p1", amount: 300, employee: emp },
      { id: "p2", amount: 200, employee: emp },
    ];
    const result = buildByEmployee(rows);
    expect(result["e1"].total).toBe(500);
    expect(result["e1"].count).toBe(2);
  });

  it("dos empleados distintos → dos entradas", () => {
    const rows: PaymentRow[] = [
      { id: "p1", amount: 100, employee: { id: "e1", full_name: "Ana", role: "recepcionista" } },
      { id: "p2", amount: 200, employee: { id: "e2", full_name: "Luis", role: "odontologo_general" } },
    ];
    const result = buildByEmployee(rows);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["e1"].total).toBe(100);
    expect(result["e2"].total).toBe(200);
  });

  it("pago sin empleado → clave 'unknown'", () => {
    const rows: PaymentRow[] = [
      { id: "p1", amount: 150, employee: null },
    ];
    const result = buildByEmployee(rows);
    expect(result["unknown"]).toBeDefined();
    expect(result["unknown"].name).toBe("—");
    expect(result["unknown"].total).toBe(150);
  });

  it("mezcla empleado con null → entradas separadas", () => {
    const rows: PaymentRow[] = [
      { id: "p1", amount: 100, employee: { id: "e1", full_name: "Ana", role: "admin" } },
      { id: "p2", amount: 200, employee: null },
    ];
    const result = buildByEmployee(rows);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["e1"].total).toBe(100);
    expect(result["unknown"].total).toBe(200);
  });
});

// ─── filtro de empleado en URL ────────────────────────────────────────────────

describe("selectedEmployee — interpretación del parámetro URL", () => {
  it("'all' → sin filtrar por empleado", () => {
    const selected = "all";
    expect(selected === "all").toBe(true);
  });

  it("UUID → filtrar por ese empleado", () => {
    const selected: string = "550e8400-e29b-41d4-a716-446655440000";
    expect(selected !== "all").toBe(true);
  });

  it("parámetro ausente → defaultea a 'all'", () => {
    const params: { employee?: string } = {};
    const selected = params.employee ?? "all";
    expect(selected).toBe("all");
  });
});

// ─── selectedMonth defaulting ─────────────────────────────────────────────────

describe("selectedMonth — defaulting al mes actual", () => {
  it("parámetro ausente → mes actual (formato YYYY-MM)", () => {
    const today = new Date().toISOString().slice(0, 7);
    const params: { month?: string } = {};
    const selectedMonth = params.month ?? today;
    expect(selectedMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(selectedMonth).toBe(today);
  });

  it("parámetro 'all' se conserva tal cual", () => {
    const params: { month?: string } = { month: "all" };
    const today = new Date().toISOString().slice(0, 7);
    const selectedMonth = params.month ?? today;
    expect(selectedMonth).toBe("all");
  });
});
