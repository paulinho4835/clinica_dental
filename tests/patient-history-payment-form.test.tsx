// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/pacientes/history-actions", () => ({
  addPatientPayment: vi.fn(),
  deletePatientPayment: vi.fn(),
  updatePatientPayment: vi.fn(),
}));
vi.mock("@/app/(dashboard)/pacientes/treatment-actions", () => ({
  setWorkDone: vi.fn(),
}));

import { PatientHistoryPanel } from "@/components/history/PatientHistoryPanel";

describe("formulario de pago del paciente", () => {
  it("bloquea el pago si se elige doctor sin elegir tratamiento", () => {
    render(
      <PatientHistoryPanel
        patientId="33333333-3333-4333-8333-333333333333"
        canBilling
        payments={[]}
        planItems={[
          {
            id: "66666666-6666-4666-8666-666666666666",
            name: "Endodoncia",
            price: 1000,
            paidAmount: 0,
            labCost: 0,
            doctorId: null,
            doctorName: null,
            defaultCommissionPct: 0,
          },
        ]}
        doctors={[{ id: "44444444-4444-4444-8444-444444444444", full_name: "Dra. Uno" }]}
        totalQuoted={1000}
        totalPaid={0}
        currency="Bs"
      />,
    );

    fireEvent.change(screen.getByLabelText("Doctor (opcional)"), {
      target: { value: "44444444-4444-4444-8444-444444444444" },
    });

    expect(screen.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
  });
});
