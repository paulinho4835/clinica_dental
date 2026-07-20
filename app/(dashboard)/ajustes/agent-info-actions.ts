"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { money } from "@/lib/format";
import { getClinicCurrency } from "@/lib/superadmin";

export type ActionState = { error?: string; ok?: boolean };

// Tope de contenido por entrada. El compilado total que se inyecta al prompt
// del agente también tiene tope (ver lib/agent/clinicInfo.ts): entradas cortas
// y concretas responden mejor que párrafos largos.
const CONTENT_MAX = 2000;

const EntrySchema = z.object({
  title: z.string().trim().min(1, "Ingresa un título.").max(80),
  content: z
    .string()
    .trim()
    .min(1, "Ingresa el contenido.")
    .max(CONTENT_MAX, `Máximo ${CONTENT_MAX} caracteres por entrada.`),
});

export async function addAgentInfoEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const parsed = EntrySchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  // La entrada nueva va al final: position = max actual + 1.
  const { data: last } = await supabase
    .from("agent_info_entries")
    .select("position")
    .eq("clinic_id", profile.clinicId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("agent_info_entries").insert({
    clinic_id: profile.clinicId,
    title: parsed.data.title,
    content: parsed.data.content,
    position: ((last?.position as number | null) ?? 0) + 1,
  });
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function updateAgentInfoEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Entrada inválida." };

  const parsed = EntrySchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_info_entries")
    .update({
      title: parsed.data.title,
      content: parsed.data.content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// Pausar/reactivar una entrada sin borrarla (ej. una promoción que terminó).
export async function setAgentInfoEntryActive(
  id: string,
  active: boolean,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_info_entries")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function deleteAgentInfoEntry(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_info_entries")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// Devuelve el catálogo de tratamientos formateado como texto para PRE-LLENAR
// el formulario de una entrada nueva. NO guarda nada: el admin revisa y edita
// antes (quita tratamientos, redondea a "desde Bs X"...) porque el catálogo es
// interno y no todo precio debe publicarse tal cual.
export async function buildCatalogDraft(): Promise<
  { ok: true; content: string } | { error: string }
> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };
  const currency = await getClinicCurrency();

  const supabase = await createClient();
  const { data: procs, error } = await supabase
    .from("procedure_catalog")
    .select("name, base_price")
    .eq("active", true)
    .order("name");
  if (error) return { error: error.message };
  if (!procs?.length) return { error: "El catálogo de tratamientos está vacío." };

  const lines = procs.map((p) => `- ${p.name}: ${money(Number(p.base_price), currency)}`);
  const content = lines.join("\n").slice(0, CONTENT_MAX);
  return { ok: true, content };
}
