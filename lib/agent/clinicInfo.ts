import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Tope del bloque compilado que se inyecta al system prompt del agente.
// ~4000 chars ≈ 1000 tokens extra por turno: despreciable en costo, pero
// suficiente para tratamientos+precios, horarios, dirección y varias FAQ.
const COMPILED_MAX = 4000;

// Compila las entradas activas de "Información para el Agente IA" de la
// clínica en un solo bloque de texto listo para el system prompt. Devuelve
// null si no hay entradas (el prompt mantiene el comportamiento de siempre:
// derivar precios a un humano).
export async function getClinicAgentInfo(clinicId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: entries } = await admin
    .from("agent_info_entries")
    .select("title, content")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("position");

  if (!entries?.length) return null;

  let out = "";
  for (const e of entries) {
    const block = `### ${e.title}\n${e.content}\n\n`;
    if (out.length + block.length > COMPILED_MAX) break;
    out += block;
  }
  return out.trim() || null;
}
