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

import { regularizeHistoricalWork } from "@/app/(dashboard)/auditoria/regularization-actions";

const ids = {
  clinic: "11111111-1111-4111-8111-111111111111",
  patient: "22222222-2222-4222-8222-222222222222",
  work: "33333333-3333-4333-8333-333333333333",
  item: "44444444-4444-4444-8444-444444444444",
};

describe("regularizeHistoricalWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue({ role: "admin", clinicId: ids.clinic });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("bloquea cualquier rol que no sea administrador", async () => {
    mocks.getProfile.mockResolvedValue({ role: "recepcionista", clinicId: ids.clinic });
    const result = await regularizeHistoricalWork({
      action: "link",
      patientId: ids.patient,
      workId: ids.work,
      treatmentItemId: ids.item,
      reason: "Correccion revisada",
    });
    expect(result).toEqual({ error: "Solo el administrador puede regularizar datos historicos." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("delega la vinculacion a una transaccion de base de datos", async () => {
    const result = await regularizeHistoricalWork({
      action: "link",
      patientId: ids.patient,
      workId: ids.work,
      treatmentItemId: ids.item,
      reason: "Corresponde al tratamiento existente",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("regularize_historical_doctor_work", expect.objectContaining({
      p_action: "link",
      p_clinic_id: ids.clinic,
      p_patient_id: ids.patient,
      p_work_id: ids.work,
      p_treatment_item_id: ids.item,
    }));
  });

  it("exige motivo para eliminar un duplicado", async () => {
    const result = await regularizeHistoricalWork({
      action: "delete_duplicate",
      patientId: ids.patient,
      workId: ids.work,
      reason: "",
    });
    expect(result.error).toContain("motivo");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
