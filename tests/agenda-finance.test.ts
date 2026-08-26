import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  directAppointmentInsert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/google-calendar/sync", () => ({
  syncAppointmentToGoogle: vi.fn(),
}));

import { createAppointment } from "@/app/(dashboard)/agenda/actions";

const patientId = "33333333-3333-4333-8333-333333333333";
const clinicId = "22222222-2222-4222-8222-222222222222";

function appointmentForm(consultPrice = "450") {
  const form = new FormData();
  form.set("patient_id", patientId);
  form.set("dentist_name", "Paulo Leon");
  form.set("starts_at", "2026-08-27T13:30:00-04:00");
  form.set("ends_at", "2026-08-27T14:00:00-04:00");
  form.set("reason", "Coronas");
  form.set("consult_price", consultPrice);
  form.set("deposit", "250");
  form.set("deposit_method", "cash");
  form.set("overbooked", "on");
  form.set("idempotency_key", "appointment-test-key");
  return form;
}

describe("finanzas al agendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      clinicId,
      role: "admin",
    });
    mocks.rpc.mockResolvedValue({
      data: { appointmentId: "appointment-1", paymentId: "payment-1" },
      error: null,
    });
    mocks.directAppointmentInsert.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: "legacy-appointment" },
          error: null,
        }),
      })),
    });
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return { insert: mocks.directAppointmentInsert };
        }
        if (table === "clinics") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { features: {}, settings: {} },
                  error: null,
                }),
              })),
            })),
          };
        }
        throw new Error(`Tabla inesperada: ${table}`);
      }),
    });
  });

  it("rechaza un adelanto sin cotización", async () => {
    const state = await createAppointment({}, appointmentForm("0"));

    expect(state).toEqual({
      error: "La cotización es obligatoria cuando registras un adelanto.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.directAppointmentInsert).not.toHaveBeenCalled();
  });

  it("registra cita, tratamiento y adelanto mediante una sola RPC atomica", async () => {
    const state = await createAppointment({}, appointmentForm());

    expect(state).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_appointment_with_finance_atomic",
      expect.objectContaining({
        p_input: expect.objectContaining({
          patient_id: patientId,
          reason: "Coronas",
          consult_price: 450,
          deposit: 250,
          deposit_method: "cash",
        }),
        p_idempotency_key: "appointment-test-key",
        p_request_hash: expect.any(String),
      }),
    );
    expect(mocks.directAppointmentInsert).not.toHaveBeenCalled();
  });
});
