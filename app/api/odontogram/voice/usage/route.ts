import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  transcriptCharCount: z.number().int().min(0).max(20_000),
  proposedCount: z.number().int().min(0).max(20),
  appliedCount: z.number().int().min(0).max(20),
  uncertaintyCount: z.number().int().min(0).max(10),
  outcome: z.enum(["applied", "cancelled", "error"]),
  latencyMs: z.number().int().min(0).max(120_000).nullable(),
}).strict();

export async function POST(request: Request) {
  const profile = await getProfile();
  if (!profile || !canEditAnamnesis(profile.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.appliedCount > body.data.proposedCount) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("odontogram_voice_usage").insert({
    clinic_id: profile.clinicId, actor_id: profile.userId,
    transcript_char_count: body.data.transcriptCharCount, proposed_count: body.data.proposedCount,
    applied_count: body.data.appliedCount, uncertainty_count: body.data.uncertaintyCount,
    outcome: body.data.outcome, latency_ms: body.data.latencyMs,
  });
  if (error) return NextResponse.json({ error: "No se pudo registrar la métrica" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
