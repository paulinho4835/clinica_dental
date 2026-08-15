import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { registerPayment } from "@/app/(dashboard)/caja/actions";

describe("registerPayment de Caja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({
      clinicId: "22222222-2222-4222-8222-222222222222",
      role: "admin",
    });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
    });
  });

  it("rechaza asignar doctor porque Caja no registra trabajos clinicos", async () => {
    const form = new FormData();
    form.set("patient_id", "33333333-3333-4333-8333-333333333333");
    form.set("amount", "500");
    form.set("method", "cash");
    form.set("kind", "payment");
    form.set("doctor_id", "44444444-4444-4444-8444-444444444444");
    form.set("commission_pct", "40");

    const state = await registerPayment({}, form);

    expect(state).toEqual({
      error: "Los pagos con doctor deben registrarse desde la cuenta del paciente y vincularse a su plan.",
    });
  });
});
