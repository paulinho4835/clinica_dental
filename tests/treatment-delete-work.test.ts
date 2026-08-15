import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { deleteWork } from "@/app/(dashboard)/pacientes/treatment-actions";

describe("deleteWork", () => {
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

  it("elimina atomicamente el item y sus trabajos pendientes de comision", async () => {
    const result = await deleteWork(
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_treatment_item_with_pending_works", {
      p_item_id: "33333333-3333-4333-8333-333333333333",
      p_patient_id: "44444444-4444-4444-8444-444444444444",
      p_clinic_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/pacientes/44444444-4444-4444-8444-444444444444",
    );
  });

  it("muestra el bloqueo cuando el trabajo ya tiene comision pagada", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: "No se puede eliminar: la comisión del doctor ya tiene pagos." },
    });

    const result = await deleteWork(
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(result).toEqual({
      error: "No se puede eliminar: la comisión del doctor ya tiene pagos.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
