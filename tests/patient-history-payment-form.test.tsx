// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  updatePatientPayment: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/pacientes/history-actions", () => ({
  addPatientPayment: vi.fn(),
  deletePatientPayment: vi.fn(),
  updatePatientPayment: actionMocks.updatePatientPayment,
}));
vi.mock("@/app/(dashboard)/pacientes/treatment-actions", () => ({
  setWorkDone: vi.fn(),
}));

import { PatientHistoryPanel } from "@/components/history/PatientHistoryPanel";

describe("formulario de pago del paciente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updatePatientPayment.mockResolvedValue({ ok: true });
  });

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

  it("permite añadir costo de técnico al editar un pago", async () => {
    render(
      <PatientHistoryPanel
        patientId="33333333-3333-4333-8333-333333333333"
        canBilling={false}
        canManagePayments
        payments={[{
          id: "77777777-7777-4777-8777-777777777777",
          amount: 900,
          method: "cash",
          note: "Extracción compleja",
          receivedAt: "2026-07-20T12:00:00Z",
          doctorName: "Dra. Uno",
          labWork: null,
          labCost: 0,
        }]}
        doctors={[]}
        totalQuoted={900}
        totalPaid={900}
        currency="Bs"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar pago" }));
    fireEvent.change(screen.getByLabelText("Trabajo o técnico"), {
      target: { value: "Técnico dental" },
    });
    fireEvent.change(screen.getByLabelText("Costo (Bs)"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(actionMocks.updatePatientPayment).toHaveBeenCalledWith(
        "77777777-7777-4777-8777-777777777777",
        expect.objectContaining({ lab_work: "Técnico dental", lab_cost: "200" }),
      );
    });
  });
});
