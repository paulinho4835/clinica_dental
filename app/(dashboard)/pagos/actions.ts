"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const StaffPaymentSchema = z
  .object({
    // Exactamente uno: empleado con cuenta (profiles) o recepcionista sin cuenta.
    employee_id: z.string().uuid().optional().nullable(),
    receptionist_id: z.string().uuid().optional().nullable(),
    amount: z.coerce.number().positive("El monto debe ser mayor a 0."),
    method: z.enum(["cash", "qr", "card"]),
    concept: z.string().trim().max(200).optional().nullable(),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  })
  .refine((d) => Boolean(d.employee_id) !== Boolean(d.receptionist_id), {
    message: "Selecciona a quién pagar.",
  });

// Tolerancia de centavos al comparar acumulado vs comisión total (evita que
// un redondeo de 0.001 deje un trabajo eternamente "pendiente" por Bs 0.00).
const EPSILON = 0.005;

export async function createStaffPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const parsed = StaffPaymentSchema.safeParse({
    employee_id: formData.get("employee_id") || null,
    receptionist_id: formData.get("receptionist_id") || null,
    amount: formData.get("amount"),
    method: formData.get("method"),
    concept: formData.get("concept") || null,
    paid_at: formData.get("paid_at"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  // Abonos de comisión por trabajo: pares alineados work_ids[i] ↔ work_amounts[i].
  // Solo aplican a empleados con cuenta (los trabajos clínicos se registran
  // contra un doctor_id de profiles). Una recepcionista no tiene works.
  const workIds = d.employee_id
    ? formData.getAll("work_ids").map(String).filter(Boolean)
    : [];
  const workAmounts = d.employee_id
    ? formData.getAll("work_amounts").map((v) => Number(v))
    : [];

  if (workIds.length !== workAmounts.length)
    return { error: "Datos de comisiones inconsistentes. Recarga la página." };
  if (workAmounts.some((a) => !Number.isFinite(a) || a <= 0))
    return { error: "Cada abono de comisión debe ser mayor a 0." };

  const supabase = await createClient();

  // Validación anti-duplicidad EN SERVIDOR: cada abono no puede exceder el
  // restante de la comisión de su trabajo (comisión total − ya abonado).
  if (workIds.length > 0) {
    const { data: workRows, error: worksError } = await supabase
      .from("doctor_works")
      .select("id, commission_amount, lab_commission_amount, commission_paid_amount")
      .eq("clinic_id", profile.clinicId)
      .eq("doctor_id", d.employee_id!)
      .in("id", workIds);
    if (worksError) return { error: worksError.message };
    const byId = new Map((workRows ?? []).map((w) => [w.id as string, w]));

    for (let i = 0; i < workIds.length; i++) {
      const w = byId.get(workIds[i]);
      if (!w) return { error: "Uno de los trabajos ya no existe o no es de este doctor." };
      const total = Number(w.commission_amount) + Number(w.lab_commission_amount);
      const remaining = total - Number(w.commission_paid_amount);
      if (workAmounts[i] > remaining + EPSILON)
        return {
          error: `Un abono excede el restante de la comisión (restan Bs ${remaining.toFixed(2)}). Recarga la página: puede que ya se haya registrado otro pago.`,
        };
    }

    // Con trabajos seleccionados, el monto del pago es la suma de los abonos
    // (la UI lo fija así; se revalida aquí para que nunca queden desalineados).
    const sum = workAmounts.reduce((s, a) => s + a, 0);
    if (Math.abs(sum - d.amount) > EPSILON)
      return { error: "El monto no coincide con la suma de los abonos seleccionados." };
  }

  const { data: paymentData, error } = await supabase
    .from("staff_payments")
    .insert({
      clinic_id: profile.clinicId,
      employee_id: d.employee_id ?? null,
      receptionist_id: d.receptionist_id ?? null,
      amount: d.amount,
      method: d.method,
      concept: d.concept ?? null,
      paid_at: d.paid_at,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const paymentId = paymentData?.id as string;

  if (workIds.length > 0) {
    // Bitácora de abonos (historial por trabajo, evita pagos duplicados).
    const { error: ledgerError } = await supabase.from("staff_payment_works").insert(
      workIds.map((id, i) => ({
        clinic_id: profile.clinicId,
        staff_payment_id: paymentId,
        work_id: id,
        amount: workAmounts[i],
      })),
    );
    if (ledgerError) {
      // Sin bitácora el pago quedaría sin rastro contra los trabajos: revertir.
      await supabase.from("staff_payments").delete().eq("id", paymentId);
      return { error: ledgerError.message };
    }

    // Acumular el abono en cada trabajo y derivar el boolean: pagado solo
    // cuando el acumulado cubre la comisión completa. staff_payment_id guarda
    // el último pago que tocó el trabajo (compat con datos históricos).
    for (let i = 0; i < workIds.length; i++) {
      const { data: w } = await supabase
        .from("doctor_works")
        .select("commission_amount, lab_commission_amount, commission_paid_amount")
        .eq("id", workIds[i])
        .single();
      if (!w) continue;
      const total = Number(w.commission_amount) + Number(w.lab_commission_amount);
      const newPaid = Number(w.commission_paid_amount) + workAmounts[i];
      await supabase
        .from("doctor_works")
        .update({
          commission_paid_amount: Math.round(newPaid * 100) / 100,
          commission_paid: newPaid >= total - EPSILON,
          staff_payment_id: paymentId,
        })
        .eq("id", workIds[i])
        .eq("clinic_id", profile.clinicId);
    }
  }

  revalidatePath("/pagos");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}

export async function toggleDisbursed(id: string, disbursed: boolean): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_payments")
    .update({ disbursed })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/pagos");
  return { ok: true };
}

export async function deleteStaffPayment(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();

  // Revertir los abonos del pago ANTES de borrarlo: restar cada abono del
  // acumulado del trabajo y recalcular el boolean. Sin esto, los trabajos
  // quedaban marcados "comisión pagada" sin ningún pago que lo respalde.
  const { data: ledger } = await supabase
    .from("staff_payment_works")
    .select("work_id, amount")
    .eq("staff_payment_id", id)
    .eq("clinic_id", profile.clinicId);

  for (const row of ledger ?? []) {
    const { data: w } = await supabase
      .from("doctor_works")
      .select("commission_amount, lab_commission_amount, commission_paid_amount")
      .eq("id", row.work_id as string)
      .single();
    if (!w) continue;
    const total = Number(w.commission_amount) + Number(w.lab_commission_amount);
    const newPaid = Math.max(0, Number(w.commission_paid_amount) - Number(row.amount));
    await supabase
      .from("doctor_works")
      .update({
        commission_paid_amount: Math.round(newPaid * 100) / 100,
        commission_paid: newPaid >= total - EPSILON,
      })
      .eq("id", row.work_id as string)
      .eq("clinic_id", profile.clinicId);
  }

  // Caso legacy (pagos anteriores a la bitácora): trabajos vinculados solo por
  // staff_payment_id, sin filas de abono. Se revierten por completo.
  const ledgerWorkIds = new Set((ledger ?? []).map((r) => r.work_id as string));
  const { data: legacyWorks } = await supabase
    .from("doctor_works")
    .select("id, commission_amount, lab_commission_amount")
    .eq("clinic_id", profile.clinicId)
    .eq("staff_payment_id", id);
  for (const w of legacyWorks ?? []) {
    if (ledgerWorkIds.has(w.id as string)) continue;
    await supabase
      .from("doctor_works")
      .update({ commission_paid_amount: 0, commission_paid: false })
      .eq("id", w.id as string)
      .eq("clinic_id", profile.clinicId);
  }

  const { error } = await supabase
    .from("staff_payments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/pagos");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}
