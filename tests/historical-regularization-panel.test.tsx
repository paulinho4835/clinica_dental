// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/(dashboard)/auditoria/regularization-actions", () => ({ regularizeHistoricalWork: vi.fn() }));

import { HistoricalRegularizationPanel, type HistoricalWorkRow } from "@/components/audit/HistoricalRegularizationPanel";

function row(commissionState: "paid" | "partial" | "unpaid"): HistoricalWorkRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    patientId: "22222222-2222-4222-8222-222222222222",
    patientName: "Paciente de prueba",
    doctorName: "Doctora de prueba",
    description: "Tratamiento histórico",
    cost: 300,
    performedAt: "2026-08-14",
    commissionState,
    commissionPaidAmount: commissionState === "paid" ? 90 : commissionState === "partial" ? 30 : 0,
    commissionTotal: 90,
    planItems: [{ id: "44444444-4444-4444-8444-444444444444", name: "Tratamiento", price: 300, linkedWorkCount: 0 }],
    payments: [],
  };
}

describe("HistoricalRegularizationPanel", () => {
  it("permite vincular un trabajo con comisión completamente pagada", () => {
    render(<HistoricalRegularizationPanel rows={[row("paid")]} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    expect(screen.getByRole("button", { name: /Vincular al plan/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Eliminar duplicado/ })).toBeDisabled();
  });

  it("bloquea vinculación y eliminación cuando la comisión está parcialmente abonada", () => {
    render(<HistoricalRegularizationPanel rows={[row("partial")]} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    expect(screen.getByRole("button", { name: /Vincular al plan/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Crear item aprobado/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Eliminar duplicado/ })).toBeDisabled();
  });

  it("no ofrece como destino un ítem que ya tiene otro trabajo clínico", () => {
    const paid = row("paid");
    paid.planItems[0].linkedWorkCount = 1;
    render(<HistoricalRegularizationPanel rows={[paid]} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    expect(screen.getByRole("option", { name: /ya tiene 1 trabajo/ })).toBeDisabled();
  });
});
