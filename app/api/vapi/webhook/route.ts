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
  if (!secret) return true; // sin secret configurado, se permite todo
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
    // Vapi envía el tool call en distintos formatos según la versión:
    //  - toolCallList[0] con { function: { name, arguments } } (arguments objeto o string)
    //  - toolCallList[0] plano { id, name, arguments }
    //  - toolCalls[0] (formato OpenAI) con { function: { name, arguments } }
    //  - toolWithToolCallList[0].toolCall
    // Normalizamos a un { id, function: { name, arguments } } para el resto del código.
    const rawToolCall =
      message.toolCallList?.[0] ??
      message.toolCalls?.[0] ??
      message.toolWithToolCallList?.[0]?.toolCall;
    if (!rawToolCall) return NextResponse.json({ results: [] });

    const toolCall = {
      id: rawToolCall.id,
      function: {
        name: rawToolCall.function?.name ?? rawToolCall.name,
        arguments: rawToolCall.function?.arguments ?? rawToolCall.arguments,
      },
    };

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

    // ── reschedule_appointment (recordatorio outbound — reagendar tras cancelar) ─
    if (fnName === "reschedule_appointment" && appointmentId) {
      const new_date = args.new_date as string | undefined;
      const new_time = args.new_time as string | undefined;

      if (!new_date || !new_time) {
        return toolResult(toolCall.id, "Necesito la nueva fecha y hora para reagendar.");
      }

      const newStart = new Date(`${new_date}T${new_time}:00-04:00`);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);

      if (clinicId) {
        const { data: conflict } = await admin
          .from("appointments")
          .select("id")
          .eq("clinic_id", clinicId)
          .neq("id", appointmentId)
          .lt("starts_at", newEnd.toISOString())
          .gt("ends_at", newStart.toISOString())
          .not("status", "in", "(cancelled,no_show)")
          .maybeSingle();

        if (conflict) {
          return toolResult(toolCall.id, `El horario ${new_time} del ${new_date} ya está ocupado. ¿Prefiere otro horario?`);
        }
      }

      await admin
        .from("appointments")
        .update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), status: "scheduled" })
        .eq("id", appointmentId);

      const dateLabel = newStart.toLocaleDateString("es-BO", {
        timeZone: BOLIVIA_TZ,
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      return toolResult(toolCall.id, `Cita reagendada para el ${dateLabel} a las ${new_time}.`);
    }

    // ── lookup_appointment / get_appointment ───────────────────────────────
    if (fnName === "lookup_appointment" || fnName === "get_appointment") {
      const callerNumber: string =
        (args.phone as string | undefined) ??
        (args.phoneNumber as string | undefined) ?? "";
      const identity: string = ((args.identity as string | undefined) ?? "").trim();
      const normalized = normalizeVapiPhone(callerNumber);

      if (!clinicId) {
        return toolResult(toolCall.id, "Error interno: clínica no identificada.");
      }

      let patient: { id: string; full_name: string } | null = null;

      // 1er intento: búsqueda por teléfono
      if (normalized) {
        const { data } = await admin
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", clinicId)
          .or(`phone.eq.${normalized},phone.eq.+${normalized}`)
          .maybeSingle();
        patient = data ?? null;
      }

      // 2do intento: búsqueda por nombre o CI (campo identity)
      if (!patient && identity) {
        const isNumeric = /^\d+$/.test(identity);
        const { data } = await admin
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", clinicId)
          .ilike(isNumeric ? "national_id" : "full_name", `%${identity}%`)
          .limit(1)
          .maybeSingle();
        patient = data ?? null;
      }

      if (!patient && !identity) {
        return toolResult(
          toolCall.id,
          "No encontré un paciente con ese número. ¿Me puedes decir tu nombre completo o número de carnet?",
        );
      }

      if (!patient) {
        return toolResult(
          toolCall.id,
          `No encontré a nadie con "${identity}" en el sistema. ¿Puedes deletrear tu apellido o darme tu número de carnet?`,
        );
      }

      // Buscar próxima cita activa
      const now = new Date().toISOString();
      const { data: appt } = await admin
        .from("appointments")
        .select("id, starts_at, reason, status, dentist_name")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patient.id)
        .gte("starts_at", now)
        .not("status", "in", "(cancelled,no_show,finished)")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!appt) {
        return toolResult(
          toolCall.id,
          `Hola ${patient.full_name}, no tienes citas próximas agendadas. ¿Te gustaría agendar una nueva cita?`,
        );
      }

      const starts = new Date(appt.starts_at);
      const dateLabel = starts.toLocaleDateString("es-BO", {
        timeZone: BOLIVIA_TZ,
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      const timeLabel = starts.toLocaleTimeString("es-BO", {
        timeZone: BOLIVIA_TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const dentistInfo = appt.dentist_name ? ` con ${appt.dentist_name}` : "";
      return toolResult(
        toolCall.id,
        `Encontré tu cita, ${patient.full_name}: el ${dateLabel} a las ${timeLabel}${dentistInfo}${appt.reason ? ` (${appt.reason})` : ""}. El estado actual es: ${appt.status}. ¿En qué puedo ayudarte con esta cita?`,
      );
    }

    // ── update_appointment (confirmar, cancelar o reagendar) ────────────────
    if (fnName === "update_appointment") {
      // Acepta tanto los nombres del webhook propio como los que genera el guide de Vapi
      const rawPhone =
        (args.phone as string | undefined) ??
        (args.phoneNumber as string | undefined);
      const action = args.action as "confirm" | "cancel" | "reschedule" | undefined;

      // newDateTime puede venir como "2026-06-15T10:00" o "2026-06-15 10:00"
      const rawDT = (args.newDateTime as string | undefined) ?? "";
      const dtParts = rawDT.replace("T", " ").split(" ");
      const new_date = (args.new_date as string | undefined) ?? dtParts[0];
      const new_time = (args.new_time as string | undefined) ?? dtParts[1];

      const phone = rawPhone;

      if (!action) {
        return toolResult(toolCall.id, "No entendí qué acción realizar. ¿Quieres confirmar, cancelar o reagendar la cita?");
      }

      const normalized = phone ? normalizeVapiPhone(phone) : null;

      if (!normalized || !clinicId) {
        return toolResult(toolCall.id, "No pude identificar el número de teléfono para actualizar la cita.");
      }

      // Buscar paciente y su próxima cita
      const { data: patient } = await admin
        .from("patients")
        .select("id, full_name")
        .eq("clinic_id", clinicId)
        .or(`phone.eq.${normalized},phone.eq.+${normalized}`)
        .maybeSingle();

      if (!patient) {
        return toolResult(toolCall.id, "No encontré un paciente con ese número para actualizar la cita.");
      }

      const now = new Date().toISOString();
      const { data: appt } = await admin
        .from("appointments")
        .select("id, starts_at")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patient.id)
        .gte("starts_at", now)
        .not("status", "in", "(cancelled,no_show,finished)")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Fallback: citas agendadas por Vapi sin patient_id — buscar por nombre
      if (!appt) {
        const { data: apptByName } = await admin
          .from("appointments")
          .select("id, starts_at")
          .eq("clinic_id", clinicId)
          .ilike("patient_name", `%${patient.full_name}%`)
          .gte("starts_at", now)
          .not("status", "in", "(cancelled,no_show,finished)")
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (apptByName) {
          // Actualizar en paralelo: vincular patient_id ahora que lo tenemos
          await admin
            .from("appointments")
            .update({ patient_id: patient.id })
            .eq("id", apptByName.id);
        }
        // Reasignar para que el resto del handler lo procese normalmente
        // (TypeScript: recast para reutilizar la variable `appt`)
        (appt as typeof apptByName) = apptByName ?? null;
      }

      if (!appt) {
        return toolResult(toolCall.id, `${patient.full_name} no tiene citas próximas para modificar.`);
      }

      if (action === "confirm") {
        await admin.from("appointments").update({ status: "confirmed" }).eq("id", appt.id);
        return toolResult(toolCall.id, `¡Cita confirmada, ${patient.full_name}! Te esperamos. ¿Hay algo más en que pueda ayudarte?`);
      }

      if (action === "cancel") {
        await admin.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
        return toolResult(toolCall.id, `Cita cancelada, ${patient.full_name}. ¿Te gustaría reagendar para otra fecha? Puedo buscarte un horario disponible ahora mismo.`);
      }

      if (action === "reschedule") {
        if (!new_date || !new_time) {
          return toolResult(toolCall.id, "Para reagendar necesito la nueva fecha y hora. ¿Cuándo prefieres?");
        }

        // Verificar disponibilidad del nuevo horario
        const newStart = new Date(`${new_date}T${new_time}:00-04:00`);
        const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
        const slotStart = newStart.toISOString();
        const slotEnd = newEnd.toISOString();

        const { data: conflict } = await admin
          .from("appointments")
          .select("id")
          .eq("clinic_id", clinicId)
          .neq("id", appt.id)
          .lt("starts_at", slotEnd)
          .gt("ends_at", slotStart)
          .not("status", "in", "(cancelled,no_show)")
          .maybeSingle();

        if (conflict) {
          return toolResult(toolCall.id, `El horario ${new_time} del ${new_date} ya está ocupado. ¿Tienes otra opción de horario?`);
        }

        await admin
          .from("appointments")
          .update({ starts_at: slotStart, ends_at: slotEnd, status: "scheduled" })
          .eq("id", appt.id);

        const dateLabel = newStart.toLocaleDateString("es-BO", {
          timeZone: BOLIVIA_TZ,
          weekday: "long",
          day: "2-digit",
          month: "long",
        });
        return toolResult(
          toolCall.id,
          `¡Listo, ${patient.full_name}! Tu cita fue reagendada para el ${dateLabel} a las ${new_time}. ¿Hay algo más en que pueda ayudarte?`,
        );
      }

      return toolResult(toolCall.id, "Acción no reconocida. ¿Quieres confirmar, cancelar o reagendar?");
    }

    // ── get_current_date ────────────────────────────────────────────────────
    if (fnName === "get_current_date") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
      return toolResult(toolCall.id, `Hoy es ${today} (formato YYYY-MM-DD).`);
    }

    // ── get_doctors (recepción inbound) ────────────────────────────────────
    if (fnName === "get_doctors") {
      if (!clinicId) {
        return toolResult(toolCall.id, "Error interno: clínica no identificada.");
      }
      const { data: doctors } = await admin
        .from("profiles")
        .select("full_name")
        .eq("clinic_id", clinicId)
        .in("role", ["odontologo_general", "especialista", "admin"])
        .order("full_name");

      if (!doctors || doctors.length === 0) {
        return toolResult(toolCall.id, "No encontré doctores registrados en la clínica.");
      }
      const names = doctors.map((d) => d.full_name).join(", ");
      return toolResult(toolCall.id, `Los doctores disponibles son: ${names}.`);
    }

    // ── check_availability (recepción inbound) ──────────────────────────────
    if (fnName === "check_availability") {
      const date: string = (args.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
      const doctorFilter = (args.doctor_name as string | undefined)?.trim() ?? null;

      const allSlots = buildSlots(date);

      if (clinicId) {
        const dayStart = `${date}T00:00:00-04:00`;
        const dayEnd = `${date}T23:59:59-04:00`;

        let query = admin
          .from("appointments")
          .select("starts_at, dentist_name")
          .eq("clinic_id", clinicId)
          .gte("starts_at", dayStart)
          .lte("starts_at", dayEnd)
          .not("status", "in", "(cancelled,no_show)");

        // Si se pide un doctor específico, filtrar solo sus citas ocupadas
        if (doctorFilter) {
          query = query.ilike("dentist_name", `%${doctorFilter}%`);
        }

        const { data: booked } = await query;

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
        const doctorLabel = doctorFilter ? ` para ${doctorFilter}` : "";
        const msg = available.length
          ? `Horarios disponibles el ${date}${doctorLabel}: ${available.join(", ")}.`
          : `No hay horarios disponibles el ${date}${doctorLabel}. Por favor elige otra fecha.`;
        return toolResult(toolCall.id, msg);
      }

      return toolResult(
        toolCall.id,
        `Horarios habituales: ${allSlots.join(", ")}. Confirma con la clínica.`,
      );
    }

    // ── book_appointment (recepción inbound) ────────────────────────────────
    if (fnName === "book_appointment") {
      const { patient_name, date, time, reason, doctor_name } = args as {
        patient_name?: string;
        date?: string;
        time?: string;
        reason?: string;
        doctor_name?: string;
      };

      if (!patient_name || !date || !time) {
        return toolResult(toolCall.id, "Faltan datos para agendar. Dime nombre, fecha y hora.");
      }

      if (!clinicId) {
        return toolResult(toolCall.id, "Error interno: clínica no identificada.");
      }

      // Normalizar hora: acepta "12:00", "12", "12:00 PM", "12h00", etc.
      const normalizedTime = normalizeTime(time);
      if (!normalizedTime) {
        return toolResult(toolCall.id, `No entendí el horario "${time}". Por favor indícame la hora en formato de 24 horas, por ejemplo "14:00".`);
      }

      // Normalizar fecha: debe ser YYYY-MM-DD
      const normalizedDate = normalizeDate(date);
      if (!normalizedDate) {
        return toolResult(toolCall.id, `No entendí la fecha "${date}". Por favor indícamela como día/mes/año, por ejemplo "13/06/2026".`);
      }

      let startsAt: string;
      let endsAt: string;
      try {
        const start = new Date(`${normalizedDate}T${normalizedTime}:00-04:00`);
        if (isNaN(start.getTime())) throw new Error("fecha inválida");
        startsAt = start.toISOString();
        endsAt = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
      } catch {
        return toolResult(toolCall.id, `No pude interpretar la fecha y hora. ¿Puedes confirmarme el día y la hora de nuevo?`);
      }

      // Buscar doctor por nombre si el paciente indicó preferencia.
      // Si no hay coincidencia, asignar el primero disponible.
      let assignedDoctor: string | null = null;
      if (doctor_name?.trim()) {
        const { data: named } = await admin
          .from("profiles")
          .select("full_name")
          .eq("clinic_id", clinicId)
          .in("role", ["odontologo_general", "especialista", "admin"])
          .ilike("full_name", `%${doctor_name.trim()}%`)
          .limit(1)
          .maybeSingle();
        assignedDoctor = named?.full_name ?? null;
      }
      if (!assignedDoctor) {
        const { data: first } = await admin
          .from("profiles")
          .select("full_name")
          .eq("clinic_id", clinicId)
          .in("role", ["odontologo_general", "especialista", "admin"])
          .order("full_name")
          .limit(1)
          .maybeSingle();
        assignedDoctor = first?.full_name ?? null;
      }

      // Vincular patient_id si el paciente ya existe en el sistema (por nombre).
      const { data: existingPatient } = await admin
        .from("patients")
        .select("id")
        .eq("clinic_id", clinicId)
        .ilike("full_name", `%${patient_name.trim()}%`)
        .limit(1)
        .maybeSingle();

      const { error } = await admin.from("appointments").insert({
        clinic_id: clinicId,
        patient_id: existingPatient?.id ?? null,
        patient_name: patient_name.trim(),
        dentist_name: assignedDoctor,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason ?? "Consulta",
        status: "scheduled",
      });

      if (error) {
        console.error("[vapi/book_appointment]", error.message, { clinicId, normalizedDate, normalizedTime });
        return toolResult(
          toolCall.id,
          `Error al guardar: ${error.message}. Por favor llama directamente a la clínica.`,
        );
      }

      const doctorConfirm = assignedDoctor ? ` con ${assignedDoctor}` : "";
      return toolResult(
        toolCall.id,
        `¡Cita agendada para ${patient_name} el ${normalizedDate} a las ${normalizedTime}${doctorConfirm}! Te esperamos.`,
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

function parseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  // Vapi a veces ya envía los argumentos como objeto parseado.
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

// Slots horarios según el día de la semana (hora Bolivia).
// Lun-Sáb: 09:00 – 20:00 (último slot a las 19:00).
// Dom: 09:00 – 12:00 (último slot a las 11:00).
function buildSlots(date: string): string[] {
  // Usamos mediodía para evitar ambigüedades de DST al calcular el día.
  const local = new Date(
    new Date(`${date}T12:00:00Z`).toLocaleString("en-US", { timeZone: BOLIVIA_TZ }),
  );
  const dow = local.getDay(); // 0=Dom, 1=Lun … 6=Sáb

  if (dow === 0) {
    // Domingo: 09:00, 10:00, 11:00
    return ["09:00", "10:00", "11:00"];
  }
  // Lunes a Sábado: 09:00 – 19:00 (11 slots de 1h)
  return Array.from({ length: 11 }, (_, i) =>
    `${String(i + 9).padStart(2, "0")}:00`,
  );
}

// Convierte hora en cualquier formato a "HH:MM" (24h). Devuelve null si no parseable.
function normalizeTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  // "12:00", "9:30", "14:00"
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (hhmm[3] === "pm" && h < 12) h += 12;
    if (hhmm[3] === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // "12h00", "9h30"
  const hh = s.match(/^(\d{1,2})h(\d{2})$/);
  if (hh) return normalizeTime(`${hh[1]}:${hh[2]}`);
  // "12" (solo hora)
  const ho = s.match(/^(\d{1,2})(?:\s*(am|pm))?$/);
  if (ho) return normalizeTime(`${ho[1]}:00${ho[2] ? " " + ho[2] : ""}`);
  return null;
}

// Convierte fecha en formatos comunes a "YYYY-MM-DD". Devuelve null si no parseable.
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  // Ya es YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, "0");
    const d = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${m}-${d}`;
  }
  return null;
}

// Normaliza el número de teléfono que envía Vapi ("+59171234567" → "59171234567").
// También maneja formatos sin código de país para números bolivianos de 8 dígitos.
function normalizeVapiPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8 && (digits[0] === "6" || digits[0] === "7")) {
    return `591${digits}`;
  }
  if (digits.length >= 10) return digits;
  return null;
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
  toolCallList?: VapiToolCall[];
  toolCalls?: VapiToolCall[];
  toolWithToolCallList?: Array<{ toolCall?: VapiToolCall }>;
};

// Un tool call de Vapi puede venir con name/arguments anidados en `function`
// o planos en el item, y `arguments` como string JSON o como objeto.
type VapiToolCall = {
  id: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
};
