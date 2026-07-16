import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFeatures } from "@/lib/features";
import { runAgent, type AgentMessage } from "@/lib/agent/runAgent";
import { getClinicAgentInfo } from "@/lib/agent/clinicInfo";

// Webhook llamado por el whatsapp-service (Baileys) por CADA mensaje entrante de
// un paciente. Corre el agente de IA y devuelve el texto a responder. Si la
// conversación está en pausa (derivada a humano) o el addon está apagado,
// devuelve reply: null y el servicio no responde nada.
export const dynamic = "force-dynamic";

const PAUSE_MS = 24 * 60 * 60 * 1000; // la pausa por handoff expira a las 24h
const HISTORY_MAX = 20; // turnos recientes que se conservan como memoria

export async function POST(req: NextRequest) {
  // Autenticación: secreto compartido con el whatsapp-service.
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { clinicId?: string; from?: string; text?: string; phoneVerified?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const clinicId = body.clinicId?.trim();
  const phone = body.from?.trim();
  const text = body.text?.trim();
  // phoneVerified=false: chat @lid sin senderPn → `from` es un id ficticio de
  // WhatsApp, no un celular. Sirve como clave de conversación pero NO se guarda
  // como teléfono del paciente; el agente le pedirá su número. Se asume true si
  // el servicio (versión vieja) no manda el campo.
  const phoneVerified = body.phoneVerified !== false;
  if (!clinicId || !phone || !text) {
    return NextResponse.json({ error: "Faltan clinicId, from o text" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Addon encendido para esta clínica?
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, features")
    .eq("id", clinicId)
    .single();
  const features = normalizeFeatures(clinic?.features);
  if (!features.agente_ia) {
    return NextResponse.json({ reply: null, skipped: "addon_off" });
  }
  // T2 (premium): habilita consultar/reprogramar/cancelar citas existentes.
  // Con solo T1 el agente únicamente agenda citas nuevas y deriva el resto.
  const canManage = features.agente_ia_t2;
  // T3 (premium): habilita check_availability (consulta real de la agenda) al
  // agendar y reprogramar. Sin T3 el agente agenda/reprograma con la hora que
  // pida el paciente y solo avisa si choca.
  const canCheckAvailability = features.agente_ia_t3;
  // Addon "disponibilidad": el agente no ofrece ni agenda en horarios donde el
  // doctor no está disponible (mismos bloques que la agenda humana).
  const availabilityEnabled = features.disponibilidad;

  // Conversación existente (historial + estado) y ficha ya registrada con este
  // número (si el teléfono es verificado): con ficha conocida el agente saluda
  // por nombre y NO pide carnet; sin ella exige carnet para dejar la solicitud
  // de registro pendiente en "Registros entrantes".
  const [{ data: convo }, { data: knownPatient }, clinicInfo] = await Promise.all([
    admin
      .from("wa_conversations")
      .select("status, messages, paused_at")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .maybeSingle(),
    phoneVerified
      ? admin
          .from("patients")
          .select("full_name")
          .eq("clinic_id", clinicId)
          .eq("phone", phone)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Addon "agente_ia_info": información oficial (precios/horarios/FAQ) que
    // el agente puede responder directamente. null si el addon está apagado o
    // no hay entradas → comportamiento de siempre (precios → humano).
    features.agente_ia_info ? getClinicAgentInfo(clinicId) : Promise.resolve(null),
  ]);

  // En pausa: el humano atiende. Solo se reanuda cuando pasan 24h desde la
  // derivación (el paciente vuelve a escribir después). Mientras tanto, silencio.
  if (convo?.status === "paused") {
    const pausedAt = convo.paused_at ? new Date(convo.paused_at).getTime() : 0;
    const expired = Date.now() - pausedAt > PAUSE_MS;
    if (!expired) {
      return NextResponse.json({ reply: null, skipped: "paused" });
    }
  }

  const history = (Array.isArray(convo?.messages) ? convo!.messages : []) as AgentMessage[];

  // Correr el agente. Si el modelo falla, el paciente recibe un mensaje neutro
  // (nunca silencio) y el error NO se guarda en la memoria: el próximo mensaje
  // retoma desde el último estado bueno de la conversación.
  let reply: string;
  let handoff: boolean;
  try {
    const out = await runAgent({
      clinicId,
      clinicName: clinic?.name ?? "la clínica",
      history,
      userText: text,
      patientPhone: phoneVerified ? phone : undefined,
      canManage,
      canCheckAvailability,
      availabilityEnabled,
      knownPatientName: knownPatient?.full_name ?? undefined,
      clinicInfo,
    });
    reply = out.reply;
    handoff = out.handoff;
  } catch (e) {
    console.error("[agent] runAgent error:", e);
    return NextResponse.json(
      {
        reply:
          "Disculpa, tuve un inconveniente técnico al procesar tu mensaje. ¿Podrías escribirme de nuevo en un momento? 🙏",
        error: "agent_error",
      },
      { status: 200 },
    );
  }

  // Guardar memoria + estado.
  const combined: AgentMessage[] = [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: reply },
  ];
  const newHistory = combined.slice(-HISTORY_MAX);

  await admin.from("wa_conversations").upsert(
    {
      clinic_id: clinicId,
      phone,
      messages: newHistory,
      status: handoff ? "paused" : "active",
      paused_at: handoff ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id,phone" },
  );

  return NextResponse.json({ reply });
}
