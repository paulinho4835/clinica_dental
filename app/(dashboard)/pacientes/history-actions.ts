"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, isReceptionistLike } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean; warning?: string };

const PaymentSchema = z.object({
  patient_id: z.string().uuid(),
  amount: z.coerce.number().positive("Monto debe ser > 0"),
  method: z.enum(["cash", "qr", "card"]),
  doctor_id: z.string().uuid().optional().nullable(),
  commission_pct: z.coerce.number().min(0).max(100).default(0),
  note: z.string().max(120).optional().nullable(),
  collected_by_id: z.string().uuid().optional().nullable(),
  received_at: z.string().optional().nullable(),
  treatment_item_id: z.string().uuid().optional().nullable(),
});

// Registra un pago/adelanto del paciente desde la ficha.
// El trigger payment_to_ledger crea el movimiento de cuenta automáticamente.
export async function addPatientPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "billing:write"))
    return { error: "Sin permiso para registrar pagos." };

  const isRecepcionista = isReceptionistLike(profile.role);

  const parsed = PaymentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    doctor_id: formData.get("doctor_id") || null,
    commission_pct: formData.get("commission_pct") || 0,
    note: formData.get("note") || null,
    collected_by_id: formData.get("collected_by_id") || null,
    received_at: formData.get("received_at") || null,
    treatment_item_id: formData.get("treatment_item_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;

  // Elegir doctor crea tambien una fila en Mis trabajos. Ese trabajo clinico
  // debe pertenecer siempre a un tratamiento previamente planificado.
  if (d.doctor_id && !d.treatment_item_id) {
    return { error: "Selecciona un tratamiento del plan para asignar el pago a un doctor." };
  }

  // Recepcionista debe indicar quién cobró.
  if (isRecepcionista && !d.collected_by_id)
    return { error: "Selecciona la recepcionista que realizó el cobro." };

  const supabase = await createClient();

  // Un solo RPC transaccional (migración 0103): si hay doctor, el pago y su
  // comisión en Mis trabajos se crean juntos o no se crea ninguno. Antes eran
  // dos inserts sueltos y uno podía fallar dejando el pago sin su comisión,
  // sin rastro (bug real: pago de Tayra Rocha Esprella, 2026-07-22).
  const { error } = await supabase.rpc("create_payment_with_work", {
    p_clinic_id: profile.clinicId,
    p_patient_id: d.patient_id,
    p_amount: d.amount,
    p_method: d.method,
    p_kind: "payment",
    // Mediodía UTC = 8:00 en Bolivia: la fecha elegida se muestra tal cual.
    // (Una fecha "pelada" se interpretaba como medianoche UTC = 20:00 del día
    // anterior en Bolivia, y el pago aparecía con la fecha corrida.)
    p_received_at: d.received_at
      ? `${d.received_at}T12:00:00Z`
      : new Date().toISOString(),
    p_doctor_id: d.doctor_id ?? null,
    p_commission_pct: d.commission_pct,
    p_note: d.note ?? null,
    p_collected_by_id: d.collected_by_id ?? null,
    p_treatment_item_id: d.treatment_item_id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${d.patient_id}`);
  revalidatePath("/cuentas");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}

type PaymentSnapshot = {
  amount: number;
  method: string;
  note: string | null;
  received_at: string;
};

// Deja constancia en audit_log (tabla solo-insert: RLS bloquea update/delete).
// Guardamos nombres en el diff para que Auditoría no dependa de joins que
// pueden romperse si el paciente o el perfil se eliminan después.
// Best-effort: si el insert falla no revertimos el cambio (no hay transacción
// entre llamadas), pero queda rastro en los logs de Vercel.
async function logPaymentAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    clinicId: string;
    actorId: string;
    actorName: string;
    action: "payment_deleted" | "payment_updated";
    paymentId: string;
    patientName: string;
    before: PaymentSnapshot;
    after?: PaymentSnapshot;
  },
) {
  const { error } = await supabase.from("audit_log").insert({
    clinic_id: params.clinicId,
    actor_id: params.actorId,
    action: params.action,
    entity: "payment",
    entity_id: params.paymentId,
    diff: {
      actor_name: params.actorName,
      patient_name: params.patientName,
      before: params.before,
      ...(params.after ? { after: params.after } : {}),
    },
  });
  if (error) console.error("audit_log payment insert failed:", error.message);
}

// Elimina un pago del paciente registrado por error. SOLO administradores.
// Borra también el movimiento de crédito que el trigger payment_to_ledger creó
// en account_movements, para no dejar el estado de cuenta descuadrado.
export async function deletePatientPayment(paymentId: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo un administrador puede eliminar pagos." };

  const supabase = await createClient();

  // Leer el pago antes de borrarlo: necesitamos el patient_id para revalidar,
  // saber si tenía doctor (comisión asociada en Mis trabajos sin vínculo
  // directo) y conservar la foto del pago en el registro de auditoría.
  const { data: payment, error: readErr } = await supabase
    .from("payments")
    .select("id, patient_id, doctor_id, amount, method, note, received_at, patients(full_name)")
    .eq("id", paymentId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!payment) return { error: "No se encontró el pago (o ya fue eliminado)." };

  // Movimiento de cuenta generado por el trigger (ref_type='payment').
  await supabase
    .from("account_movements")
    .delete()
    .eq("clinic_id", profile.clinicId)
    .eq("ref_type", "payment")
    .eq("ref_id", paymentId);

  const { error: delErr } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId)
    .eq("clinic_id", profile.clinicId);
  if (delErr) return { error: delErr.message };

  await logPaymentAudit(supabase, {
    clinicId: profile.clinicId,
    actorId: profile.userId,
    actorName: profile.fullName,
    action: "payment_deleted",
    paymentId,
    patientName:
      (payment.patients as { full_name?: string } | null)?.full_name ?? "—",
    before: {
      amount: Number(payment.amount),
      method: payment.method,
      note: payment.note,
      received_at: payment.received_at,
    },
  });

  revalidatePath("/cuentas");
  revalidatePath(`/pacientes/${payment.patient_id}`);
  revalidatePath("/mis-trabajos");

  // Si el pago tenía doctor, addPatientPayment creó una comisión en Mis trabajos
  // que no tiene vínculo con este pago: avisar para que el admin la revise.
  return { ok: true };
}

const PaymentUpdateSchema = z.object({
  amount: z.coerce.number().positive("Monto debe ser > 0"),
  method: z.enum(["cash", "qr", "card", "transfer"]),
  note: z.string().max(120).optional().nullable(),
  // Solo llega si el admin cambió la fecha en el formulario.
  received_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional()
    .nullable(),
});

// Corrige un pago mal registrado (monto, método, concepto o fecha).
// SOLO administradores. Mantiene consistente el movimiento del ledger y deja
// constancia del antes/después en Auditoría.
export async function updatePatientPayment(
  paymentId: string,
  input: {
    amount: number | string;
    method: string;
    note?: string | null;
    received_date?: string | null;
  },
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo un administrador puede editar pagos." };

  const parsed = PaymentUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;

  const supabase = await createClient();

  const { data: payment, error: readErr } = await supabase
    .from("payments")
    .select("id, patient_id, doctor_id, amount, method, note, received_at, patients(full_name)")
    .eq("id", paymentId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!payment) return { error: "No se encontró el pago (o fue eliminado)." };

  const before: PaymentSnapshot = {
    amount: Number(payment.amount),
    method: payment.method,
    note: payment.note,
    received_at: payment.received_at,
  };

  const after: PaymentSnapshot = {
    amount: d.amount,
    method: d.method,
    note: d.note?.trim() || null,
    // Mediodía UTC = 8:00 en Bolivia, para que la fecha no se corra un día.
    received_at: d.received_date
      ? `${d.received_date}T12:00:00Z`
      : payment.received_at,
  };

  const changed =
    after.amount !== before.amount ||
    after.method !== before.method ||
    after.note !== before.note ||
    after.received_at !== before.received_at;
  if (!changed) return { ok: true };

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      amount: after.amount,
      method: after.method,
      note: after.note,
      received_at: after.received_at,
    })
    .eq("id", paymentId)
    .eq("clinic_id", profile.clinicId);
  if (updErr) return { error: updErr.message };

  // Si el pago creó un trabajo, ambos son el mismo hecho financiero. El enlace
  // explícito evita depender de coincidencias ambiguas de fecha, monto o texto.
  const { error: workError } = await supabase
    .from("doctor_works")
    .update({
      description: after.note ?? "Pago desde ficha de paciente",
      cost: after.amount,
      amount_paid: after.amount,
      payment_method: after.method,
    })
    .eq("payment_id", paymentId)
    .eq("clinic_id", profile.clinicId);
  if (workError) return { error: workError.message };

  // Mantener el crédito del ledger alineado con el nuevo monto.
  if (after.amount !== before.amount) {
    const { error: ledgerErr } = await supabase
      .from("account_movements")
      .update({ amount: after.amount })
      .eq("clinic_id", profile.clinicId)
      .eq("ref_type", "payment")
      .eq("ref_id", paymentId);
    if (ledgerErr)
      console.error("account_movements update failed:", ledgerErr.message);
  }

  await logPaymentAudit(supabase, {
    clinicId: profile.clinicId,
    actorId: profile.userId,
    actorName: profile.fullName,
    action: "payment_updated",
    paymentId,
    patientName:
      (payment.patients as { full_name?: string } | null)?.full_name ?? "—",
    before,
    after,
  });

  revalidatePath("/cuentas");
  revalidatePath(`/pacientes/${payment.patient_id}`);
  revalidatePath("/mis-trabajos");

  // La comisión en Mis trabajos no está vinculada al pago: si cambió el monto
  // y había doctor, el admin debe ajustarla a mano.
  return { ok: true };
}
