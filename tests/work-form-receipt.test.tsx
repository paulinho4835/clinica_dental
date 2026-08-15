// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/mis-trabajos/actions", () => ({
  createDoctorWork: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WorkForm } from "@/components/mis-trabajos/WorkForm";

describe("WorkForm con add-on de recibos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ofrece emitir un recibo físico solo cuando el add-on está habilitado", () => {
    render(
      <WorkForm
        patients={[]}
        today="2026-08-10"
        currency="Bs"
        {...({ receiptsEnabled: true } as object)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /registrar trabajo/i }));

    expect(screen.getByLabelText(/emitir recibo de pago/i)).toBeTruthy();
  });

  it("mantiene bloqueado Registrar hasta elegir un tratamiento del plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => ({
        json: async () =>
          input.includes("plan-items")
            ? {
                items: [
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
                ],
              }
            : { totalWorked: 1000, totalPaid: 0 },
      })),
    );

    render(
      <WorkForm
        patients={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            full_name: "Paciente Uno",
          },
        ]}
        today="2026-08-14"
        currency="Bs"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /registrar trabajo/i }));
    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o ci/i), {
      target: { value: "Paciente" },
    });
    fireEvent.mouseDown(screen.getByText("Paciente Uno"));

    await screen.findByText("Endodoncia");

    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });
});
