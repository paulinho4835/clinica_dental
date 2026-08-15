"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const Base = {
  patientId: z.string().uuid(),
  workId: z.string().uuid(),
  reason: z.string().trim().min(5, "Escribe el motivo de la regularizacion."),
  paymentId: z.string().uuid().nullable().optional(),
};
const Schema = z.discriminatedUnion("action", [
  z.object({ ...Base, action: z.literal("link"), treatmentItemId: z.string().uuid() }),
  z.object({ ...Base, action: z.literal("create"), name: z.string().trim().min(1), price: z.coerce.number().min(0) }),
  z.object({ ...Base, action: z.literal("delete_duplicate") }),
]);

export type HistoricalRegularizationInput = z.input<typeof Schema>;
export type RegularizationState = { ok?: boolean; error?: string };

export async function regularizeHistoricalWork(input: HistoricalRegularizationInput): Promise<RegularizationState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesion expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede regularizar datos historicos." };
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos invalidos." };
  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("regularize_historical_doctor_work", {
    p_work_id: data.workId,
    p_patient_id: data.patientId,
    p_clinic_id: profile.clinicId,
    p_action: data.action,
    p_treatment_item_id: data.action === "link" ? data.treatmentItemId : null,
    p_payment_id: data.paymentId ?? null,
    p_name: data.action === "create" ? data.name : null,
    p_price: data.action === "create" ? data.price : null,
    p_reason: data.reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/auditoria");
  revalidatePath(`/pacientes/${data.patientId}`);
  revalidatePath("/cuentas");
  revalidatePath("/pagos");
  return { ok: true };
}
