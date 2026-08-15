import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { addPatientPayment } from "@/app/(dashboard)/pacientes/history-actions";

describe("addPatientPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      clinicId: "22222222-2222-4222-8222-222222222222",
      role: "admin",
      fullName: "Administradora",
    });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("no crea un trabajo para un doctor si el pago no apunta a un item del plan", async () => {
    const form = new FormData();
    form.set("patient_id", "33333333-3333-4333-8333-333333333333");
    form.set("amount", "500");
    form.set("method", "cash");
    form.set("doctor_id", "44444444-4444-4444-8444-444444444444");
    form.set("commission_pct", "40");

    const state = await addPatientPayment({}, form);

    expect(state).toEqual({
      error: "Selecciona un tratamiento del plan para asignar el pago a un doctor.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
