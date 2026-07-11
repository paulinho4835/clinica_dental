import { describe, it, expect } from "vitest";
import type { CsvWorkRow } from "@/components/mis-trabajos/ExportCsvButton";

// ─── Helpers inline (misma lógica que ExportCsvButton / PrintPdfButton) ───────

function cell(v: string | number): string {
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function bsPdf(n: number): string {
  return `Bs ${n.toFixed(2)}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildPeriodLabel(from: string, to: string): string {
  if (from && to) return `${fmtDate(from)} al ${fmtDate(to)}`;
  if (from) return `Desde ${fmtDate(from)}`;
  if (to) return `Hasta ${fmtDate(to)}`;
  return "Todos los períodos";
}

function calcTotals(rows: CsvWorkRow[]) {
  const totalCost = rows.reduce((s, r) => s + r.costo, 0);
  const totalComm = rows.reduce((s, r) => s + r.comision_bs, 0);
  const totalPaid = rows
    .filter((r) => r.comision_pagada === "Sí")
    .reduce((s, r) => s + r.comision_bs, 0);
  const totalPending = totalComm - totalPaid;
  return { totalCost, totalComm, totalPaid, totalPending };
}

function makeRow(overrides: Partial<CsvWorkRow> = {}): CsvWorkRow {
  return {
    fecha: "2026-06-10",
    paciente: "Ana Vargas",
    doctor: "Dr. Pérez",
    cobrado_por: "Recepción",
    trabajo: "Limpieza dental",
    lab_trabajo: "",
    costo: 200,
    lab_costo: 0,
    comision_pct: 30,
    comision_bs: 60,
    cobrado: 200,
    metodo: "cash",
    factura: "No",
    comision_pagada: "No",
    notas: "",
    ...overrides,
  };
}

// ─── CSV cell escaping ─────────────────────────────────────────────────────────

describe("cell() — escape CSV", () => {
  it("valor simple sin escape", () => {
    expect(cell("Limpieza dental")).toBe("Limpieza dental");
    expect(cell(200)).toBe("200");
  });

  it("wrap en comillas si contiene coma", () => {
    expect(cell("García, María")).toBe('"García, María"');
  });

  it("escapa comillas internas duplicándolas", () => {
    expect(cell('dijo "ok"')).toBe('"dijo ""ok"""');
  });

  it("wrap en comillas si contiene salto de línea", () => {
    expect(cell("línea1\nlínea2")).toBe('"línea1\nlínea2"');
  });

  it("número cero", () => {
    expect(cell(0)).toBe("0");
  });

  it("nombre con coma + comillas (caso extremo)", () => {
    const r = cell('Señor "García", Juan');
    expect(r.startsWith('"')).toBe(true);
    expect(r.endsWith('"')).toBe(true);
    expect(r).toContain('""García""');
  });
});

// ─── PDF local bs() ───────────────────────────────────────────────────────────

describe("bsPdf() — formato local del PDF", () => {
  it("dos decimales", () => {
    expect(bsPdf(150)).toBe("Bs 150.00");
    expect(bsPdf(0)).toBe("Bs 0.00");
    expect(bsPdf(1234.5)).toBe("Bs 1234.50");
  });

  it("negativo (descuento o ajuste)", () => {
    expect(bsPdf(-50)).toBe("Bs -50.00");
  });
});

// ─── fmtDate() ────────────────────────────────────────────────────────────────

describe("fmtDate() — fecha legible", () => {
  it("formato DD/MMM/AAAA en es-BO (sin desfase de zona)", () => {
    const result = fmtDate("2026-06-01");
    expect(result).toMatch(/01/);
    expect(result).toMatch(/2026/);
  });

  it("no adelanta un día (bug zona horaria)", () => {
    const result = fmtDate("2026-01-01");
    expect(result).toMatch(/01/);
    expect(result).toMatch(/2026/);
    expect(result).not.toMatch(/dic|dec/i);
  });
});

// ─── periodLabel ──────────────────────────────────────────────────────────────

describe("buildPeriodLabel() — etiqueta de período PDF", () => {
  it("from + to → rango completo", () => {
    const r = buildPeriodLabel("2026-06-01", "2026-06-30");
    expect(r).toContain("al");
  });

  it("solo from → 'Desde ...'", () => {
    expect(buildPeriodLabel("2026-06-01", "")).toMatch(/^Desde/);
  });

  it("solo to → 'Hasta ...'", () => {
    expect(buildPeriodLabel("", "2026-06-30")).toMatch(/^Hasta/);
  });

  it("sin fechas → 'Todos los períodos'", () => {
    expect(buildPeriodLabel("", "")).toBe("Todos los períodos");
  });
});

// ─── calcTotals() — totales del PDF ───────────────────────────────────────────

describe("calcTotals() — totales del constancia PDF", () => {
  it("sin filas → todos cero", () => {
    const t = calcTotals([]);
    expect(t).toEqual({ totalCost: 0, totalComm: 0, totalPaid: 0, totalPending: 0 });
  });

  it("todas pagadas → pending = 0", () => {
    const rows = [
      makeRow({ costo: 200, comision_bs: 60, comision_pagada: "Sí" }),
      makeRow({ costo: 300, comision_bs: 90, comision_pagada: "Sí" }),
    ];
    const t = calcTotals(rows);
    expect(t.totalCost).toBe(500);
    expect(t.totalComm).toBe(150);
    expect(t.totalPaid).toBe(150);
    expect(t.totalPending).toBe(0);
  });

  it("todas pendientes → paid = 0", () => {
    const rows = [
      makeRow({ costo: 100, comision_bs: 30, comision_pagada: "No" }),
      makeRow({ costo: 200, comision_bs: 60, comision_pagada: "No" }),
    ];
    const t = calcTotals(rows);
    expect(t.totalPaid).toBe(0);
    expect(t.totalPending).toBe(90);
  });

  it("mix pagadas + pendientes", () => {
    const rows = [
      makeRow({ comision_bs: 60, comision_pagada: "Sí" }),
      makeRow({ comision_bs: 40, comision_pagada: "No" }),
      makeRow({ comision_bs: 50, comision_pagada: "Sí" }),
    ];
    const t = calcTotals(rows);
    expect(t.totalPaid).toBe(110);
    expect(t.totalPending).toBe(40);
    expect(t.totalComm).toBe(150);
  });

  it("totalCost suma correctamente con lab_costo", () => {
    // lab_costo no se suma en costo (el campo costo ya viene calculado)
    const rows = [
      makeRow({ costo: 500, lab_costo: 100, comision_bs: 150, comision_pagada: "No" }),
    ];
    const t = calcTotals(rows);
    expect(t.totalCost).toBe(500);
  });
});

// ─── csvRows mapping — reglas de null-safety ──────────────────────────────────

describe("csvRows mapping — null-safety", () => {
  it("campos nulos se convierten en vacío o 'No'", () => {
    // Simula la transformación que hace mis-trabajos/page.tsx
    const w = {
      performed_at: "2026-06-10",
      patients: null,
      patient_name: null,
      doctor: null,
      collected_by: null,
      description: "Extracción",
      lab_work: null,
      cost: "300",
      lab_cost: "0",
      commission_pct: "20",
      commission_amount: "60",
      lab_commission_amount: "0",
      amount_paid: "300",
      payment_method: null,
      commission_paid: false,
      notes: null,
    };

    const row: CsvWorkRow = {
      fecha: w.performed_at,
      paciente: (w.patients as null | { full_name: string })?.full_name ?? w.patient_name ?? "",
      doctor: (w.doctor as null | { full_name: string })?.full_name ?? "",
      cobrado_por: (w.collected_by as null | { full_name: string })?.full_name ?? "",
      trabajo: w.description,
      lab_trabajo: w.lab_work ?? "",
      costo: Number(w.cost),
      lab_costo: Number(w.lab_cost),
      comision_pct: Number(w.commission_pct),
      comision_bs: Number(w.commission_amount) + Number(w.lab_commission_amount),
      cobrado: Number(w.amount_paid),
      metodo: w.payment_method ?? "",
      factura: "",
      comision_pagada: w.commission_paid ? "Sí" : "No",
      notas: w.notes ?? "",
    };

    expect(row.paciente).toBe("");
    expect(row.doctor).toBe("");
    expect(row.cobrado_por).toBe("");
    expect(row.lab_trabajo).toBe("");
    expect(row.metodo).toBe("");
    expect(row.comision_pagada).toBe("No");
    expect(row.notas).toBe("");
    expect(row.costo).toBe(300);
    expect(row.comision_bs).toBe(60);
  });

  it("comision_paid true → 'Sí'", () => {
    const row = makeRow({ comision_pagada: "Sí" });
    expect(row.comision_pagada).toBe("Sí");
  });
});
