// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/mis-trabajos/actions", () => ({
  createDoctorWork: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WorkForm } from "@/components/mis-trabajos/WorkForm";

describe("WorkForm con add-on de recibos", () => {
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
});
