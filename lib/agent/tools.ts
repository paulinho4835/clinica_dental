import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOLIVIA_TZ } from "@/lib/format";
import { buildSlots, normalizeTime, normalizeDate } from "@/lib/vapi-helpers";

// Contexto mutable de una corrida del agente: la tool handoff_to_human lo marca
// y el endpoint lo lee después de correr el modelo para poner la conversación
// en pausa. bookingAttempted/bookingSucceeded permiten detectar EN CÓDIGO cuando
// el modelo confirma una cita que en realidad falló (el LLM a veces ignora la
// regla "no confirmes si hay ERROR" — visto en producción con horario ocupado).
export type AgentContext = {
  handoffRequested: boolean;
  handoffReason?: string;
  bookingAttempted?: boolean;
  bookingSucceeded?: boolean;
};

// Roles que ejercen como odontólogo (pueden recibir citas).
const DOCTOR_ROLES = ["odontologo_general", "especialista", "admin"];

// Etiqueta con la que se guardan las citas agendadas por el agente cuando el
// paciente NO pidió un doctor específico. Antes se asignaba el primer perfil por
// orden alfabético (que caía en la cuenta "admin"); ahora quedan claramente
// marcadas como generadas por el bot para que el equipo las reasigne al doctor
// correcto. Sigue siendo visible en la agenda (admin/recepción ven todas).
const AI_DENTIST = "Inteligencia Artificial";

// Resuelve la ficha del paciente por teléfono (identidad verificada por WhatsApp)
// y, si no existe, la crea. El número desde el que escribe es la identidad más
// confiable: registra al paciente automáticamente y evita fichas falsas o
// duplicadas. Si no hay teléfono, cae a búsqueda por nombre. Devuelve el
// patient_id, o null si no se pudo resolver ni crear.
async function resolveOrCreatePatient(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  fullName: string,
  phone?: string,
): Promise<string | null> {
  // 1) Por teléfono: lo más confiable, es el número real desde el que escribe.
  if (phone) {
    const { data: byPhone } = await admin
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) return byPhone.id;
  }
  // 2) Por nombre: si ya está registrado, reusar y completar el teléfono si faltaba.
  const { data: byName } = await admin
    .from("patients")
    .select("id, phone")
    .eq("clinic_id", clinicId)
    .ilike("full_name", `%${fullName}%`)
    .limit(1)
    .maybeSingle();
  if (byName?.id) {
    if (phone && !byName.phone) {
      await admin.from("patients").update({ phone }).eq("id", byName.id);
    }
    return byName.id;
  }
  // 3) No existe: crear ficha nueva atada al teléfono verificado.
  const { data: created, error } = await admin
    .from("patients")
    .insert({ clinic_id: clinicId, full_name: fullName, phone: phone ?? null })
    .select("id")
    .single();
  if (error) {
    console.error("[agent/resolveOrCreatePatient]", error.message, { clinicId });
    return null;
  }
  return created?.id ?? null;
}

// Fábrica de herramientas del agente, cerradas sobre la clínica actual y un
// contexto mutable. Misma lógica de disponibilidad/reserva que el webhook de
// Vapi, para que ambos canales se comporten igual.
export function buildAgentTools(clinicId: string, ctx: AgentContext, patientPhone?: string) {
  const admin = createAdminClient();

  return {
    get_current_date: tool({
      description:
        "Devuelve la fecha de hoy en Bolivia, el día de la semana, y una lista de los próximos 14 días con su fecha y nombre de día. Úsala SIEMPRE para resolver fechas relativas ('hoy', 'mañana', 'el viernes') ANTES de consultar disponibilidad o agendar. NUNCA calcules fechas relativas a mano (sumando/restando días): busca el día pedido en la lista `upcoming` y usa exactamente ese `date`.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const todayIso = now.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
        // Los 14 días calculados en código (nunca por el modelo) para eliminar
        // errores de aritmética de fechas del LLM: solo tiene que buscar en la lista.
        const upcoming = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(`${todayIso}T12:00:00-04:00`);
          d.setDate(d.getDate() + i);
          const iso = d.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
          const weekday = d.toLocaleDateString("es-BO", {
            timeZone: BOLIVIA_TZ,
            weekday: "long",
          });
          return { date: iso, weekday };
        });
        return {
          date: todayIso,
          weekday: upcoming[0].weekday,
          upcoming,
        };
      },
    }),

    get_doctors: tool({
      description:
        "Lista los odontólogos disponibles de la clínica. Úsala si el paciente pregunta por un doctor o quiere elegir con quién atenderse.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin
          .from("profiles")
          .select("full_name")
          .eq("clinic_id", clinicId)
          .in("role", DOCTOR_ROLES)
          .eq("active", true)
          .order("full_name");
        return { doctors: (data ?? []).map((d) => d.full_name).filter(Boolean) };
      },
    }),

    check_availability: tool({
      description:
        "Consulta los horarios libres de un día. Pasa la fecha como YYYY-MM-DD (resuélvela antes con get_current_date). Devuelve la lista de horas disponibles.",
      inputSchema: z.object({
        date: z.string().describe("Fecha en formato YYYY-MM-DD"),
        doctor_name: z
          .string()
          .optional()
          .describe("Nombre del doctor si el paciente pidió uno específico"),
      }),
      execute: async ({ date, doctor_name }) => {
        const d = normalizeDate(date) ?? date;
        const allSlots = buildSlots(d);
        let query = admin
          .from("appointments")
          .select("starts_at, ends_at, dentist_name")
          .eq("clinic_id", clinicId)
          .gte("starts_at", `${d}T00:00:00-04:00`)
          .lte("starts_at", `${d}T23:59:59-04:00`)
          .not("status", "in", "(cancelled,no_show)");
        if (doctor_name?.trim()) query = query.ilike("dentist_name", `%${doctor_name.trim()}%`);
        const { data: booked } = await query;
        // Con slots de 30 min y citas de 60, la comparación por hora exacta no
        // basta: una cita a las 10:00 también debe bloquear el slot 10:30.
        // Se filtra por solapamiento de intervalos [slot, slot+60).
        const intervals = (booked ?? []).map((a) => ({
          start: new Date(a.starts_at).getTime(),
          end: new Date(a.ends_at).getTime(),
        }));
        const available = allSlots.filter((s) => {
          const slotStart = new Date(`${d}T${s}:00-04:00`).getTime();
          const slotEnd = slotStart + 60 * 60 * 1000;
          return !intervals.some((iv) => iv.start < slotEnd && iv.end > slotStart);
        });
        return { date: d, available };
      },
    }),

    lookup_patient: tool({
      description:
        "Busca si el paciente ya está registrado en la clínica por nombre o carnet. Úsala para saludarlo por su nombre; no es obligatorio para agendar.",
      inputSchema: z.object({
        query: z.string().describe("Nombre o número de carnet del paciente"),
      }),
      execute: async ({ query }) => {
        // Sanea caracteres que rompen la sintaxis or() de PostgREST.
        const q = query.trim().replace(/[,()]/g, " ");
        if (!q) return { matches: [] };
        const { data } = await admin
          .from("patients")
          .select("full_name, national_id")
          .eq("clinic_id", clinicId)
          .or(`full_name.ilike.%${q}%,national_id.ilike.%${q}%`)
          .limit(3);
        return {
          matches: (data ?? []).map((p) => ({ name: p.full_name, ci: p.national_id })),
        };
      },
    }),

    book_appointment: tool({
      description:
        "Agenda una cita nueva. Llama esto SOLO cuando tengas confirmados nombre del paciente, motivo de la consulta, fecha y hora, y hayas verificado disponibilidad. La respuesta empieza con 'OK:' si se agendó o con 'ERROR:' si falló. NUNCA confirmes al paciente si la respuesta empieza con ERROR.",
      inputSchema: z.object({
        patient_name: z.string().describe("Nombre completo del paciente"),
        date: z.string().describe("Fecha YYYY-MM-DD"),
        time: z.string().describe("Hora, ej. 14:00"),
        reason: z
          .string()
          .optional()
          .describe(
            "Motivo de la consulta que el paciente indicó (limpieza, dolor de muela, control, etc.). Pregúntaselo SIEMPRE antes de agendar.",
          ),
        doctor_name: z
          .string()
          .optional()
          .describe(
            "Nombre del doctor SOLO si el paciente lo mencionó por su cuenta. No lo inventes ni lo sugieras.",
          ),
        contact_phone: z
          .string()
          .optional()
          .describe(
            "Número de celular que el paciente dictó en la conversación (solo si se le pidió)",
          ),
      }),
      execute: async ({ patient_name, date, time, reason, doctor_name, contact_phone }) => {
        ctx.bookingAttempted = true;
        const nTime = normalizeTime(time);
        if (!nTime)
          return `ERROR: no entendí la hora "${time}". Pide la hora en formato 24h, ej. "14:00".`;
        const nDate = normalizeDate(date);
        if (!nDate)
          return `ERROR: no entendí la fecha "${date}". Pídela como día/mes/año.`;

        const start = new Date(`${nDate}T${nTime}:00-04:00`);
        if (isNaN(start.getTime())) return "ERROR: fecha u hora inválida.";
        // Guard: nunca agendar en el pasado (atrapa años/fechas alucinados por el
        // modelo). Se compara contra el instante actual real.
        if (start.getTime() < Date.now()) {
          return `ERROR: la fecha ${nDate} a las ${nTime} ya pasó. Llama a get_current_date, recalcula la fecha correcta a partir de HOY y ofrece un horario futuro.`;
        }
        const startsAt = start.toISOString();
        const endsAt = new Date(start.getTime() + 60 * 60 * 1000).toISOString();

        // Doctor: si el paciente pidió uno específico y existe, se le asigna (queda
        // como cita real de ese odontólogo). Si no pidió ninguno, la cita queda a
        // nombre de "Inteligencia Artificial" para que el equipo la reasigne, en
        // vez de colgársela por defecto al primer perfil (antes caía en "admin").
        let assignedDoctor = AI_DENTIST;
        let assignedDoctorId: string | null = null;
        if (doctor_name?.trim()) {
          const { data: named } = await admin
            .from("profiles")
            .select("id, full_name")
            .eq("clinic_id", clinicId)
            .in("role", DOCTOR_ROLES)
            .eq("active", true)
            .ilike("full_name", `%${doctor_name.trim()}%`)
            .limit(1)
            .maybeSingle();
          if (named?.full_name) {
            assignedDoctor = named.full_name;
            assignedDoctorId = named.id;
          } else {
            // El paciente pidió un doctor que no existe: mejor avisar que
            // agendarlo en silencio con otro (o con la IA) — sería engañarlo.
            return `ERROR: no encontré a un doctor llamado "${doctor_name.trim()}" en la clínica. Usa get_doctors para ver los nombres correctos y confírmalo con el paciente.`;
          }
        }

        // Revalidar disponibilidad para evitar doble reserva del mismo hueco. Con
        // un doctor real asignado, el choque se mide contra ESE doctor (dentist_id,
        // fuente de verdad). Sin doctor (cita del bot), se trata la clínica como un
        // solo recurso: cualquier cita que se solape choca, igual que
        // check_availability. Solapamiento de intervalos (no igualdad exacta):
        // con slots de 30 min, una cita a las 10:00 también bloquea las 10:30.
        let clashQuery = admin
          .from("appointments")
          .select("id")
          .eq("clinic_id", clinicId)
          .lt("starts_at", endsAt)
          .gt("ends_at", startsAt)
          .not("status", "in", "(cancelled,no_show)");
        if (assignedDoctorId) clashQuery = clashQuery.eq("dentist_id", assignedDoctorId);
        const { data: clash } = await clashQuery.limit(1);
        if (clash && clash.length > 0) {
          return `ERROR: el horario ${nTime} del ${nDate} ya está ocupado${
            assignedDoctorId ? ` para ${assignedDoctor}` : ""
          }. Usa check_availability y ofrece otra hora.`;
        }

        // Resolver/crear la ficha del paciente atada a su número de WhatsApp
        // (identidad verificada). Si WhatsApp ocultó el número (@lid sin senderPn),
        // se usa el celular que el paciente dictó (contact_phone), normalizado a
        // solo dígitos — mismo criterio que los carnets dictados por voz en Vapi.
        const dictated = contact_phone?.replace(/[\s.\-()+]/g, "") ?? "";
        const effectivePhone = patientPhone ?? (dictated.length >= 7 ? dictated : undefined);
        const patientId = await resolveOrCreatePatient(
          admin,
          clinicId,
          patient_name.trim(),
          effectivePhone,
        );

        // Si la cita quedó con un doctor real, dejar rastro en el motivo de que
        // la agendó la IA (cuando queda a nombre de "Inteligencia Artificial" el
        // rastro ya es evidente en la propia columna del doctor).
        const baseReason = reason?.trim() || "Consulta";
        const finalReason = assignedDoctorId
          ? `${baseReason} (agendada por IA)`
          : baseReason;

        const { error } = await admin.from("appointments").insert({
          clinic_id: clinicId,
          patient_id: patientId,
          patient_name: patient_name.trim(),
          dentist_name: assignedDoctor,
          dentist_id: assignedDoctorId,
          starts_at: startsAt,
          ends_at: endsAt,
          reason: finalReason,
          status: "scheduled",
        });

        if (error) {
          console.error("[agent/book_appointment]", error.message, { clinicId, nDate, nTime });
          return `ERROR: no se pudo guardar la cita (${error.message}). Pide al paciente que llame a la clínica.`;
        }

        ctx.bookingSucceeded = true;
        return `OK: cita agendada para ${patient_name} el ${nDate} a las ${nTime}${
          assignedDoctor ? ` con ${assignedDoctor}` : ""
        }.`;
      },
    }),

    handoff_to_human: tool({
      description:
        "Deriva la conversación a una persona del equipo. Úsala cuando el paciente pida hablar con un humano, se queje, o pregunte algo FUERA de agendar una cita nueva (precios, reprogramar, cancelar, dudas médicas), o cuando no puedas resolver. Después despídete brevemente diciendo que un miembro del equipo continuará.",
      inputSchema: z.object({
        reason: z.string().describe("Motivo breve de la derivación"),
      }),
      execute: async ({ reason }) => {
        ctx.handoffRequested = true;
        ctx.handoffReason = reason;
        return "OK: conversación derivada a un humano. Despídete e indica que el equipo continuará.";
      },
    }),
  };
}
