import { createClient } from "@/lib/supabase/client";

export type PatientDirectInput = {
  full_name: string;
  national_id?: string | null;
  dob?: string | null;
  sex?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  allergies?: string | string[] | null;
  medical_alerts?: string | string[] | null;
};

export type PatientPaymentDirectInput = {
  patient_id: string;
  amount: number;
  method: "cash" | "qr" | "card";
  doctor_id?: string | null;
  commission_pct?: number;
  note?: string | null;
  collected_by_id?: string | null;
  received_at?: string | null;
  treatment_item_id: string;
};

export type DirectPlanItemRow = {
  id: string;
  name: string;
  price: number;
  paidAmount: number;
  labCost: number;
  doctorId: string | null;
  doctorName: string | null;
  defaultCommissionPct: number;
};

export type PatientFinancialSummary = {
  items: DirectPlanItemRow[];
  totalWorked: number;
  totalPaid: number;
};

type RpcError = { code?: string; message: string };

type DirectOperationDependencies = {
  hashRequest: (input: unknown) => Promise<string>;
  submitPatientRpc: (params: {
    p_input: Record<string, unknown>;
    p_idempotency_key: string;
    p_request_hash: string;
  }) => Promise<{ data: unknown; error: RpcError | null }>;
  submitPaymentRpc: (params: {
    p_patient_id: string;
    p_amount: number;
    p_method: PatientPaymentDirectInput["method"];
    p_received_at: string;
    p_doctor_id: string | null;
    p_commission_pct: number;
    p_note: string | null;
    p_collected_by_id: string | null;
    p_treatment_item_id: string;
    p_idempotency_key: string;
    p_request_hash: string;
  }) => Promise<{ data: unknown; error: RpcError | null }>;
};

export class ClinicOperationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ClinicOperationError";
  }
}

function cleanCsv(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

async function sha256(input: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function browserDependencies(): DirectOperationDependencies {
  const supabase = createClient();
  return {
    hashRequest: sha256,
    async submitPatientRpc(params) {
      return supabase.rpc("create_patient_atomic", params);
    },
    async submitPaymentRpc(params) {
      return supabase.rpc("create_patient_payment_atomic", params);
    },
  };
}

function operationError(error: RpcError): never {
  if (!error.code && /fetch|network|conexi[oó]n/i.test(error.message)) {
    throw new TypeError(error.message);
  }
  if (error.code === "42501") {
    throw new ClinicOperationError("No tienes permiso para realizar esta operacion", 403);
  }
  if (error.code === "22023" || error.code === "23514" || error.code === "23505") {
    throw new ClinicOperationError("Los datos enviados no son validos", 400);
  }
  if (error.code === "40001") {
    throw new ClinicOperationError("Los datos cambiaron; actualiza e intenta nuevamente", 409);
  }
  throw new ClinicOperationError("No se pudo completar la operacion", 500);
}

function validateId(value: unknown, key: "patientId" | "paymentId") {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>)[key] !== "string") {
    throw new ClinicOperationError("Supabase devolvio una respuesta invalida", 502);
  }
  return value as Record<typeof key, string>;
}

export async function submitPatient(
  request: { input: PatientDirectInput; idempotencyKey: string },
  dependencies?: DirectOperationDependencies,
) {
  const deps = dependencies ?? browserDependencies();
  const canonicalInput = {
    ...request.input,
    allergies: cleanCsv(request.input.allergies),
    medical_alerts: cleanCsv(request.input.medical_alerts),
  };
  const requestHash = await deps.hashRequest(canonicalInput);
  const { data, error } = await deps.submitPatientRpc({
    p_input: canonicalInput,
    p_idempotency_key: request.idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) operationError(error);
  return validateId(data, "patientId");
}

export async function submitPatientPayment(
  request: { input: PatientPaymentDirectInput; idempotencyKey: string },
  dependencies?: DirectOperationDependencies,
) {
  const deps = dependencies ?? browserDependencies();
  const requestHash = await deps.hashRequest(request.input);
  const { data, error } = await deps.submitPaymentRpc({
    p_patient_id: request.input.patient_id,
    p_amount: request.input.amount,
    p_method: request.input.method,
    p_received_at: request.input.received_at
      ? `${request.input.received_at}T12:00:00Z`
      : new Date().toISOString(),
    p_doctor_id: request.input.doctor_id ?? null,
    p_commission_pct: request.input.commission_pct ?? 0,
    p_note: request.input.note ?? null,
    p_collected_by_id: request.input.collected_by_id ?? null,
    p_treatment_item_id: request.input.treatment_item_id,
    p_idempotency_key: request.idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error) operationError(error);
  return validateId(data, "paymentId");
}

export async function loadPatientFinancialSummary(
  patientId: string,
  dependencies?: {
    loadSummaryRpc: (params: { p_patient_id: string }) => Promise<{ data: unknown; error: RpcError | null }>;
  },
): Promise<PatientFinancialSummary> {
  const supabase = dependencies ? null : createClient();
  const loadSummaryRpc = dependencies?.loadSummaryRpc
    ?? ((params: { p_patient_id: string }) => supabase!.rpc("get_patient_financial_summary", params));
  const { data, error } = await loadSummaryRpc({ p_patient_id: patientId });
  if (error) operationError(error);
  if (
    !data || typeof data !== "object" || !Array.isArray((data as PatientFinancialSummary).items)
    || typeof (data as PatientFinancialSummary).totalWorked !== "number"
    || typeof (data as PatientFinancialSummary).totalPaid !== "number"
  ) {
    throw new ClinicOperationError("Supabase devolvio una respuesta invalida", 502);
  }
  return data as PatientFinancialSummary;
}
