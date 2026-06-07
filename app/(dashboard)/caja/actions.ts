"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PaymentSchema } from "@/lib/schemas/payment";

export type ActionState = { error?: string; ok?: boolean };

export async function registerPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "billing:write"))
    return { error: "Sin permiso para registrar pagos." };

  const parsed = PaymentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    kind: formData.get("kind") || "payment",
    note: formData.get("note") || null,
    doctor_id: formData.get("doctor_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  // Trigger en DB crea el account_movement (crédito) y actualiza el saldo.
  const { error } = await supabase.from("payments").insert({
    clinic_id: profile.clinicId,
    patient_id: parsed.data.patient_id,
    amount: parsed.data.amount,
    method: parsed.data.method,
    kind: parsed.data.kind,
    note: parsed.data.note ?? null,
    doctor_id: parsed.data.doctor_id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/caja");
  return { ok: true };
}

const ExpenseSchema = z.object({
  category: z.string().min(1, "Categoría requerida"),
  amount: z.coerce.number().positive("Monto debe ser > 0"),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function registerExpense(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "expenses:write"))
    return { error: "Solo administración registra gastos." };

  const parsed = ExpenseSchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    vendor: formData.get("vendor") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    clinic_id: profile.clinicId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    vendor: parsed.data.vendor,
    notes: parsed.data.notes,
  });
  if (error) return { error: error.message };

  revalidatePath("/caja");
  return { ok: true };
}

// Liquidar comisión (pasar a pagada). Solo expenses:write.
export async function payCommission(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "expenses:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("commissions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/caja");
  return { ok: true };
}

// Apertura de caja con fondo inicial. Solo una sesión abierta a la vez por clínica.
export async function openCashSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "billing:write")) return { error: "Sin permiso." };

  const float = Number(formData.get("opening_float") ?? 0);
  if (Number.isNaN(float) || float < 0) return { error: "Fondo inicial inválido." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cash_sessions")
    .select("id")
    .is("closed_at", null)
    .limit(1);
  if (existing && existing.length > 0)
    return { error: "Ya hay una caja abierta. Ciérrala antes de abrir otra." };

  const { error } = await supabase.from("cash_sessions").insert({
    clinic_id: profile.clinicId,
    opened_by: profile.userId,
    opening_float: float,
  });
  if (error) return { error: error.message };

  revalidatePath("/caja");
  return { ok: true };
}

// Cierre de caja: closing_total = fondo inicial + pagos en efectivo desde la apertura.
export async function closeCashSession(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "billing:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("cash_sessions")
    .select("opened_at, opening_float")
    .eq("id", id)
    .single();
  if (!session) return { error: "Sesión de caja no encontrada." };

  const { data: cashPays } = await supabase
    .from("payments")
    .select("amount")
    .eq("method", "cash")
    .gte("received_at", session.opened_at);
  const cashTotal = (cashPays ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const { error } = await supabase
    .from("cash_sessions")
    .update({
      closed_at: new Date().toISOString(),
      closing_total: Number(session.opening_float) + cashTotal,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/caja");
  return { ok: true };
}
