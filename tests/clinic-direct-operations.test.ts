import { describe, expect, it, vi } from "vitest";

const patient = {
  full_name: "Ana Perez",
  national_id: "1234567",
  dob: "1990-04-12",
  sex: "F",
  phone: "70000000",
  email: "ana@example.com",
  address: "La Paz",
  allergies: "Penicilina, Latex",
  medical_alerts: "Diabetes",
};

const payment = {
  patient_id: "33333333-3333-4333-8333-333333333333",
  amount: 500,
  method: "cash" as const,
  doctor_id: "44444444-4444-4444-8444-444444444444",
  commission_pct: 40,
  note: "Endodoncia",
  collected_by_id: null,
  received_at: "2026-08-21",
  treatment_item_id: "66666666-6666-4666-8666-666666666666",
};

describe("operaciones directas de clinica", () => {
  it("crea pacientes mediante la RPC protegida de Supabase", async () => {
    const module = await import("@/lib/clinic-direct-operations").catch(() => null);
    expect(module).not.toBeNull();
    if (!module) return;

    const submitPatientRpc = vi.fn().mockResolvedValue({
      data: { patientId: "patient-1" },
      error: null,
    });
    const result = await module.submitPatient(
      { input: patient, idempotencyKey: "patient-key" },
      {
        hashRequest: vi.fn().mockResolvedValue("patient-hash"),
        submitPatientRpc,
        submitPaymentRpc: vi.fn(),
      },
    );

    expect(submitPatientRpc).toHaveBeenCalledWith({
      p_input: {
        ...patient,
        allergies: ["Penicilina", "Latex"],
        medical_alerts: ["Diabetes"],
      },
      p_idempotency_key: "patient-key",
      p_request_hash: "patient-hash",
    });
    expect(result).toEqual({ patientId: "patient-1" });
  });

  it("registra pagos directamente con idempotencia", async () => {
    const module = await import("@/lib/clinic-direct-operations").catch(() => null);
    expect(module).not.toBeNull();
    if (!module) return;

    const submitPaymentRpc = vi.fn().mockResolvedValue({
      data: { paymentId: "payment-1" },
      error: null,
    });
    const result = await module.submitPatientPayment(
      { input: payment, idempotencyKey: "payment-key" },
      {
        hashRequest: vi.fn().mockResolvedValue("payment-hash"),
        submitPatientRpc: vi.fn(),
        submitPaymentRpc,
      },
    );

    expect(submitPaymentRpc).toHaveBeenCalledWith({
      p_patient_id: payment.patient_id,
      p_amount: payment.amount,
      p_method: payment.method,
      p_received_at: "2026-08-21T12:00:00Z",
      p_doctor_id: payment.doctor_id,
      p_commission_pct: payment.commission_pct,
      p_note: payment.note,
      p_collected_by_id: null,
      p_treatment_item_id: payment.treatment_item_id,
      p_idempotency_key: "payment-key",
      p_request_hash: "payment-hash",
    });
    expect(result).toEqual({ paymentId: "payment-1" });
  });

  it("no expone mensajes internos de PostgreSQL", async () => {
    const module = await import("@/lib/clinic-direct-operations").catch(() => null);
    expect(module).not.toBeNull();
    if (!module) return;

    await expect(module.submitPatientPayment(
      { input: payment, idempotencyKey: "payment-key" },
      {
        hashRequest: vi.fn().mockResolvedValue("payment-hash"),
        submitPatientRpc: vi.fn(),
        submitPaymentRpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "42501", message: "internal_policy_name" },
        }),
      },
    )).rejects.toMatchObject({
      status: 403,
      message: "No tienes permiso para realizar esta operacion",
    });
  });

  it("carga plan y saldo del paciente con una sola RPC", async () => {
    const module = await import("@/lib/clinic-direct-operations");
    expect(module).toHaveProperty("loadPatientFinancialSummary");
    if (!("loadPatientFinancialSummary" in module)) return;

    const loadSummaryRpc = vi.fn().mockResolvedValue({
      data: { items: [], totalWorked: 1000, totalPaid: 400 },
      error: null,
    });
    const result = await module.loadPatientFinancialSummary(payment.patient_id, { loadSummaryRpc });

    expect(loadSummaryRpc).toHaveBeenCalledWith({ p_patient_id: payment.patient_id });
    expect(result).toEqual({ items: [], totalWorked: 1000, totalPaid: 400 });
  });
});
