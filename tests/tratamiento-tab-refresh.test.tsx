// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getTratamientoTabData = vi.hoisted(() => vi.fn());

vi.mock("@/app/(dashboard)/pacientes/[id]/tab-data-actions", () => ({
  getTratamientoTabData,
}));

vi.mock("@/components/treatments/TreatmentPlanPanel", () => ({
  TreatmentPlanPanel: ({
    works,
    onWorkAdded,
  }: {
    works: { name: string }[];
    onWorkAdded?: () => void;
  }) => (
    <div>
      {works.map((work) => <span key={work.name}>{work.name}</span>)}
      <button type="button" onClick={onWorkAdded}>Simular trabajo agregado</button>
    </div>
  ),
}));

vi.mock("@/components/history/PatientHistoryPanel", () => ({
  WorkStatusPanel: () => null,
  AdHocWorkList: () => null,
  VisitasPanel: () => null,
}));
vi.mock("@/components/patients/EvolutionPanel", () => ({ EvolutionPanel: () => null }));
vi.mock("@/components/patients/lazy-tabs/TabSkeleton", () => ({ TabSkeleton: () => <p>Cargando</p> }));

import { TratamientoTab } from "@/components/patients/lazy-tabs/TratamientoTab";

function data(workName: string) {
  return {
    works: [{ id: workName, name: workName, price: 100, done: false, createdAt: "2026-08-10T10:00:00Z" }],
    dentists: [],
    catalog: [],
    recetasEnabled: false,
    currency: "BOB",
    adHocWorkRows: [],
    apptRows: [],
    evolutionNotes: [],
    evolutionHistory: [],
    permissions: {
      canClinical: true,
      canEditClinical: true,
      canSeeHistory: true,
      canDelete: true,
      canEditPlanItemName: true,
      canEditPrice: true,
      currentUserId: "user-1",
    },
  };
}

describe("TratamientoTab", () => {
  it("vuelve a consultar y muestra el plan nuevo al terminar de agregar un trabajo", async () => {
    getTratamientoTabData.mockResolvedValueOnce(data("Trabajo inicial")).mockResolvedValueOnce(data("Trabajo nuevo"));

    render(<TratamientoTab patientId="patient-1" legacyEvolution={null} />);
    expect(await screen.findByText("Trabajo inicial")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Simular trabajo agregado" }));

    expect(await screen.findByText("Trabajo nuevo")).toBeTruthy();
  });
});
