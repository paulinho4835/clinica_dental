import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
  fetchPatientPlanItems: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/treatments/planItems", () => ({
  fetchPatientPlanItems: mocks.fetchPatientPlanItems,
}));

import { GET } from "@/app/api/patients/[id]/balance/route";

function queryResult(data: unknown[]) {
  const result = {
    select: vi.fn(() => result),
    eq: vi.fn(() => result),
    then: (resolve: (value: { data: unknown[] }) => unknown) =>
      Promise.resolve({ data }).then(resolve),
  };
  return result;
}

describe("balance de cuenta del paciente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({ clinicId: "clinic-1" });
  });

  it("usa una sola vez el precio del plan aunque existan varias cuotas del mismo tratamiento", async () => {
    const works = queryResult([
      { cost: 1000, treatment_item_id: "item-1" },
      { cost: 1000, treatment_item_id: "item-1" },
      { cost: 500, treatment_item_id: null },
    ]);
    const payments = queryResult([{ amount: 500 }, { amount: 500 }]);
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === "doctor_works" ? works : payments)),
    });
    mocks.fetchPatientPlanItems.mockResolvedValue([
      {
        id: "item-1",
        name: "Endodoncia",
        price: 1000,
        paidAmount: 1000,
        labCost: 0,
        doctorId: "doctor-1",
        doctorName: "Dra. Uno",
        defaultCommissionPct: 0,
      },
    ]);

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: "patient-1" }),
    });

    expect(await response.json()).toEqual({ totalWorked: 1000, totalPaid: 1000 });
  });
});
