"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

type TemplateResult = { error?: string };

export async function createTemplate(
  title: string,
  body: string
): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const t = title.trim();
  const b = body.trim();
  if (!t) return { error: "El título es requerido." };
  if (!b) return { error: "El cuerpo es requerido." };

  const supabase = await createClient();

  const { error } = await supabase.from("consent_templates").insert({
    clinic_id: profile.clinicId,
    title: t,
    body: b,
    is_system: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function updateTemplate(
  templateId: string,
  title: string,
  body: string
): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const t = title.trim();
  const b = body.trim();
  if (!t) return { error: "El título es requerido." };
  if (!b) return { error: "El cuerpo es requerido." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consent_templates")
    .update({ title: t, body: b })
    .eq("id", templateId)
    .eq("clinic_id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function deleteTemplate(templateId: string): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consent_templates")
    .delete()
    .eq("id", templateId)
    .eq("clinic_id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function forkTemplate(templateId: string): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const supabase = await createClient();

  const { data: source, error: fetchErr } = await supabase
    .from("consent_templates")
    .select("title, body")
    .eq("id", templateId)
    .single();

  if (fetchErr || !source) return { error: "Plantilla no encontrada." };

  const { error: insertErr } = await supabase.from("consent_templates").insert({
    clinic_id: profile.clinicId,
    title: `(Copia) ${source.title}`,
    body: source.body,
    is_system: false,
  });

  if (insertErr) return { error: insertErr.message };

  revalidatePath("/ajustes");
  return {};
}
