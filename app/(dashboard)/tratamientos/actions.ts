"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const TreatmentSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  // Precio y comisión son opcionales: si se dejan vacíos, quedan en 0.
  base_price: z.coerce.number().min(0, "Precio inválido").optional().default(0),
  commission_pct: z.coerce.number().min(0).max(100, "Comisión entre 0 y 100").optional().default(0),
});

// Código interno único por clínica (la tabla lo exige). Lo derivamos del nombre
// + sufijo aleatorio para que el admin no tenga que inventarlo.
function slugCode(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug || "trat"}-${rand}`;
}

async function assertAdmin() {
  const profile = await getProfile();
  if (!profile) return { profile: null, error: "Sesión expirada." as const };
  if (profile.role !== "admin")
    return { profile: null, error: "Solo el administrador gestiona el catálogo." as const };
  return { profile, error: null };
}

export async function createTreatment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile, error: authErr } = await assertAdmin();
  if (authErr) return { error: authErr };

  const parsed = TreatmentSchema.safeParse({
    name: formData.get("name"),
    base_price: formData.get("base_price") || undefined,
    commission_pct: formData.get("commission_pct") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("procedure_catalog").insert({
    clinic_id: profile!.clinicId,
    code: slugCode(parsed.data.name),
    name: parsed.data.name,
    base_price: parsed.data.base_price,
    default_commission_pct: parsed.data.commission_pct,
    active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/tratamientos");
  return { ok: true };
}

export async function updateTreatment(
  id: string,
  formData: FormData,
): Promise<ActionState> {
  const { profile, error: authErr } = await assertAdmin();
  if (authErr) return { error: authErr };

  const parsed = TreatmentSchema.safeParse({
    name: formData.get("name"),
    base_price: formData.get("base_price") || undefined,
    commission_pct: formData.get("commission_pct") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("procedure_catalog")
    .update({
      name: parsed.data.name,
      base_price: parsed.data.base_price,
      default_commission_pct: parsed.data.commission_pct,
    })
    .eq("id", id)
    .eq("clinic_id", profile!.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/tratamientos");
  return { ok: true };
}

// Desactiva (no borra: el tratamiento puede estar referenciado por trabajos del
// plan). Deja de aparecer en el catálogo y en el selector del plan.
export async function deactivateTreatment(id: string): Promise<ActionState> {
  const { profile, error: authErr } = await assertAdmin();
  if (authErr) return { error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from("procedure_catalog")
    .update({ active: false })
    .eq("id", id)
    .eq("clinic_id", profile!.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/tratamientos");
  return { ok: true };
}
