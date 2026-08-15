import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/superadmin", () => ({
  getClinicCurrency: vi.fn(),
  getClinicFeatures: vi.fn(),
}));

import { createDoctorWork } from "@/app/(dashboard)/mis-trabajos/actions";

function queryResult(data: unknown) {
  const result = {
    select: vi.fn(() => result),
    eq: vi.fn(() => result),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
    insert: vi.fn(() => result),
  };
  return result;
}

describe("createDoctorWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      clinicId: "22222222-2222-4222-8222-222222222222",
      role: "admin",
      fullName: "Administradora",
    });
    const patient = queryResult({
      id: "33333333-3333-4333-8333-333333333333",
      full_name: "Paciente Uno",
      national_id: null,
    });
    const doctor = queryResult({ clinic_id: "22222222-2222-4222-8222-222222222222" });
    const work = queryResult({ id: "55555555-5555-4555-8555-555555555555" });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "patients") return patient;
        if (table === "profiles") return doctor;
        return work;
      }),
    });
  });

  it("rechaza un trabajo que no pertenece a un item del plan", async () => {
    const form = new FormData();
    form.set("patient_id", "33333333-3333-4333-8333-333333333333");
    form.set("description", "Exodoncia");
    form.set("cost", "500");
    form.set("commission_pct", "0");
    form.set("amount_paid", "0");
    form.set("invoiced", "false");
    form.set("performed_at", "2026-08-14");
    form.set("doctor_id", "44444444-4444-4444-8444-444444444444");

    const state = await createDoctorWork({}, form);

    expect(state).toEqual({
      error: "Selecciona un tratamiento del plan antes de registrar el trabajo.",
    });
  });

  it("rechaza un item del plan que pertenece a otro paciente", async () => {
    const patient = queryResult({
      id: "33333333-3333-4333-8333-333333333333",
      full_name: "Paciente Uno",
      national_id: null,
    });
    const foreignItem = queryResult({
      id: "66666666-6666-4666-8666-666666666666",
      clinic_id: "22222222-2222-4222-8222-222222222222",
      treatment_phases: {
        treatment_plans: {
          patient_id: "77777777-7777-4777-8777-777777777777",
          clinic_id: "22222222-2222-4222-8222-222222222222",
        },
      },
    });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) =>
        table === "patients" ? patient : table === "treatment_items" ? foreignItem : queryResult(null),
      ),
    });

    const form = new FormData();
    form.set("patient_id", "33333333-3333-4333-8333-333333333333");
    form.set("treatment_item_id", "66666666-6666-4666-8666-666666666666");
    form.set("description", "Exodoncia");
    form.set("cost", "500");
    form.set("commission_pct", "0");
    form.set("amount_paid", "0");
    form.set("invoiced", "false");
    form.set("performed_at", "2026-08-14");
    form.set("doctor_id", "44444444-4444-4444-8444-444444444444");

    const state = await createDoctorWork({}, form);

    expect(state).toEqual({ error: "El tratamiento seleccionado no pertenece a este paciente." });
  });
});
