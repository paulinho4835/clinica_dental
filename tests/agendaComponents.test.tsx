// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthView } from "@/components/agenda/MonthView";
import { getDoctorColor } from "@/lib/agenda/doctorColor";
import type { MonthAppt } from "@/components/agenda/apptHelpers";

const makeAppt = (overrides: Partial<MonthAppt> = {}): MonthAppt => ({
  id: "a1",
  starts_at: "2026-06-10T09:00:00",
  ends_at: "2026-06-10T10:00:00",
  status: "scheduled",
  dentist_name: "Dr. Pérez",
  patient_id: null,
  patient_name: null,
  reason: null,
  consult_price: null,
  deposit: null,
  deposit_method: null,
  patients: { full_name: "Ana Vargas", national_id: null },
  ...overrides,
});

describe("MonthView — pastillas de nombre", () => {
  it("muestra el nombre del paciente en lugar de badge contador", () => {
    const byDay = new Map([["2026-06-10", [makeAppt()]]]);
    render(
      <MonthView
        month="2026-06-10"
        byDay={byDay}
        selectedDay={null}
        onSelectDay={() => {}}
      />,
    );
    expect(screen.getByText("Ana Vargas")).toBeInTheDocument();
    expect(screen.queryByText("1 cita")).not.toBeInTheDocument();
  });

  it("con 3 citas muestra 2 pastillas + '+1 más'", () => {
    const appts: MonthAppt[] = [
      makeAppt({ id: "a1", patients: { full_name: "Ana", national_id: null } }),
      makeAppt({ id: "a2", patients: { full_name: "Luis", national_id: null } }),
      makeAppt({ id: "a3", patients: { full_name: "María", national_id: null } }),
    ];
    const byDay = new Map([["2026-06-10", appts]]);
    render(
      <MonthView
        month="2026-06-10"
        byDay={byDay}
        selectedDay={null}
        onSelectDay={() => {}}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
    expect(screen.queryByText("María")).not.toBeInTheDocument();
    expect(screen.getByText("+1 más")).toBeInTheDocument();
  });
});

describe("getDoctorColor — colores distintos para doctores distintos", () => {
  it("doctores con nombres distintos tienen al menos bg distinto en algunos casos", () => {
    const colors = ["Dr. Pérez", "Dr. Soto", "Dr. Rojas", "Dr. Lima"]
      .map((n) => getDoctorColor(n).bg);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});
