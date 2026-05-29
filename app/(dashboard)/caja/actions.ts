"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const PaymentSchema = z.object({
  patient_id: z.string().uuid("Paciente requerido"),
  amount: z.coerce.number().positive("Monto debe ser > 0"),
  method: z.enum(["cash", "card", "transfer"]),
  kind: z.enum(["payment", "credit"]).default("payment"),
});

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
