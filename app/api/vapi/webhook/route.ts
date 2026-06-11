import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInboundAssistant } from "@/lib/vapi";
import { BOLIVIA_TZ } from "@/lib/format";

// Vapi envía todos los eventos de llamada a esta URL:
//   - assistant-request  → devuelve el asistente dinámico para llamadas entrantes
//   - tool-calls         → ejecuta las herramientas que el asistente necesita
//   - end-of-call-report → actualiza el estado del recordatorio en Supabase
//
// Configurar en el dashboard de Vapi:
//   Phone Number → Server URL = https://tu-dominio.vercel.app/api/vapi/webhook
//   (opcional) Server Secret = valor de VAPI_WEBHOOK_SECRET

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return true;
  return req.headers.get("x-vapi-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.message) return NextResponse.json({ ok: true });

  const { message } = body as { message: VapiMessage };
  const admin = createAdminClient();

  // ── 1. Asistente dinámico para llamadas entrantes ─────────────────────────
  if (message.type === "assistant-request") {
    const clinicId = await resolveClinicId(admin, message.call?.phoneNumberId);
    if (!clinicId) {
      return NextResponse.json({ error: { message: "Clínica no encontrada para este número." } });
    }
    const { data: clinic } = await admin
      .from("clinics")
      .select("name")
      .eq("id", clinicId)
      .single();

    return NextResponse.json({
      assistant: {
        ...buildInboundAssistant(clinic?.name ?? "la clínica"),
        // El clinicId viaja en metadata para poder usarlo en tool-calls.
        serverMessages: ["tool-calls", "end-of-call-report"],
        metadata: { clinicId },
      },
    });
  }

  // ── 2. Tool calls (el asistente necesita datos o ejecutar una acción) ──────
  if (message.type === "tool-calls") {
    const toolCall = message.toolCallList?.[0];
    if (!toolCall) return NextResponse.json({ results: [] });

    const fnName = toolCall.function?.name ?? "";
    const args = parseArgs(toolCall.function?.arguments);
    const callMeta = (message.call?.metadata ?? {}) as Record<string, string>;

    // clinicId: viene del metadata (inbound) o del env var (prototipo outbound)
    const clinicId =
      callMeta.clinicId ??
      (await resolveClinicId(admin, message.call?.phoneNumberId));

    const appointmentId = callMeta.appointmentId;
    const reminderId = callMeta.reminderId;

    // ── confirm_appointment (recordatorio outbound) ─────────────────────────
    if (fnName === "confirm_appointment" && appointmentId) {
      await admin
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", appointmentId);
      if (reminderId) await markReminderSent(admin, reminderId);
      return toolResult(toolCall.id, "Cita confirmada.");
    }

    // ── cancel_appointment (recordatorio outbound) ──────────────────────────
    if (fnName === "cancel_appointment" && appointmentId) {
      await admin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId);
      if (reminderId) await markReminderSent(admin, reminderId);
      return toolResult(toolCall.id, "Cita cancelada.");
    }

    // ── check_availability (recepción inbound) ──────────────────────────────
    if (fnName === "check_availability") {
      const date: string = (args.date as string | undefined) ?? new Date().toISOString().slice(0, 10);

      const allSlots = buildSlots(); // 08:00 – 17:00, intervalos de 1h

      if (clinicId) {
        const dayStart = `${date}T00:00:00-04:00`;
        const dayEnd = `${date}T23:59:59-04:00`;
        const { data: booked } = await admin
          .from("appointments")
          .select("starts_at")
          .eq("clinic_id", clinicId)
          .gte("starts_at", dayStart)
          .lte("starts_at", dayEnd)
          .not("status", "in", "(cancelled,no_show)");

        const bookedSet = new Set(
          (booked ?? []).map((a) =>
            new Date(a.starts_at).toLocaleTimeString("es-BO", {
              timeZone: BOLIVIA_TZ,
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
          ),
        );

        const available = allSlots.filter((s) => !bookedSet.has(s));
        const msg = available.length
          ? `Horarios disponibles el ${date}: ${available.join(", ")}.`
          : `No hay horarios disponibles el ${date}. Por favor elige otra fecha.`;
        return toolResult(toolCall.id, msg);
      }

      return toolResult(
        toolCall.id,
        `Horarios habituales: ${allSlots.join(", ")}. Confirma con la clínica.`,
      );
    }

    // ── book_appointment (recepción inbound) ────────────────────────────────
    if (fnName === "book_appointment") {
      const { patient_name, date, time, reason } = args as {
        patient_name?: string;
        date?: string;
        time?: string;
        reason?: string;
      };

      if (!patient_name || !date || !time) {
        return toolResult(toolCall.id, "Faltan datos para agendar. Dime nombre, fecha y hora.");
      }

      if (!clinicId) {
        return toolResult(toolCall.id, "Error interno: clínica no identificada.");
      }

      const startsAt = new Date(`${date}T${String(time)}:00-04:00`).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();

      const { error } = await admin.from("appointments").insert({
        clinic_id: clinicId,
        patient_name: patient_name.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason ?? "Consulta",
        status: "scheduled",
      });

      if (error) {
        console.error("[vapi/book_appointment]", error.message);
        return toolResult(
          toolCall.id,
          "Hubo un error al agendar. Por favor llama directamente a la clínica.",
        );
      }

      return toolResult(
        toolCall.id,
        `¡Cita agendada para ${patient_name} el ${date} a las ${time}! Te esperamos.`,
      );
    }

    return toolResult(toolCall.id, "Acción no reconocida.");
  }

  // ── 3. Fin de llamada (actualiza recordatorio si aún está pendiente) ───────
  if (message.type === "end-of-call-report") {
    const callMeta = (message.call?.metadata ?? {}) as Record<string, string>;
    const reminderId = callMeta.reminderId;
    const endedReason: string = message.endedReason ?? "";

    if (reminderId) {
      const isError = ["error", "pipeline-error", "assistant-error"].some((r) =>
        endedReason.startsWith(r),
      );
      await admin
        .from("appointment_reminders")
        .update({
          status: isError ? "failed" : "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", reminderId)
        .eq("status", "pending"); // no sobrescribe si ya fue marcado por tool call
    }
  }

  return NextResponse.json({ ok: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveClinicId(
  admin: ReturnType<typeof createAdminClient>,
  phoneNumberId: string | undefined,
): Promise<string | null> {
  // Prototipo: variable de entorno tiene prioridad.
  if (process.env.VAPI_CLINIC_ID) return process.env.VAPI_CLINIC_ID;
  if (!phoneNumberId) return null;
  // Multi-clínica: buscar en settings JSONB → { vapi_phone_number_id: "xxx" }
  const { data } = await admin
    .from("clinics")
    .select("id")
    .contains("settings", { vapi_phone_number_id: phoneNumberId })
    .maybeSingle();
  return data?.id ?? null;
}

async function markReminderSent(
  admin: ReturnType<typeof createAdminClient>,
  reminderId: string,
) {
  await admin
    .from("appointment_reminders")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", reminderId);
}

function toolResult(toolCallId: string, result: string) {
  return NextResponse.json({ results: [{ toolCallId, result }] });
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Slots de 08:00 a 17:00 (hora Bolivia) con intervalos de 1 hora.
function buildSlots(): string[] {
  return Array.from({ length: 10 }, (_, i) =>
    `${String(i + 8).padStart(2, "0")}:00`,
  );
}

// ── Tipos mínimos del payload de Vapi ────────────────────────────────────────

type VapiMessage = {
  type: string;
  endedReason?: string;
  call?: {
    id?: string;
    phoneNumberId?: string;
    metadata?: unknown;
  };
  toolCallList?: Array<{
    id: string;
    function?: { name?: string; arguments?: string };
  }>;
};
