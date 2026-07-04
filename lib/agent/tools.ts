import "server-only";
import { randomBytes } from "crypto";
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
  // Igual que booking pero para reprogramar/cancelar (tools T2): permiten al
  // guard anti-mentira detectar confirmaciones inventadas de esas acciones.
  manageAttempted?: boolean;
  manageSucceeded?: boolean;
};

// Roles que ejercen como odontólogo (pueden recibir citas).
const DOCTOR_ROLES = ["odontologo_general", "especialista", "admin"];

// Etiqueta con la que se guardan las citas agendadas por el agente cuando el
// paciente NO pidió un doctor específico. Antes se asignaba el primer perfil por
// orden alfabético (que caía en la cuenta "admin"); ahora quedan claramente
// marcadas como generadas por el bot para que el equipo las reasigne al doctor
// correcto. Sigue siendo visible en la agenda (admin/recepción ven todas).
// DEBE coincidir con la constante de components/agenda/AgendaShell.tsx.
const AI_DENTIST = "Asistente Virtual";

// ¿El nombre dictado corresponde a la ficha? Comparación laxa: sin tildes,
// sin mayúsculas, por contención en cualquier dirección ("Paulo" ↔ "Paulo León").
function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const na = norm(a);
  const nb = norm(b);
  return na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na));
}

// Busca la ficha EXISTENTE del paciente. NO crea fichas: el alta la aprueba
// el equipo (ver requestPatientRegistration). El nombre manda sobre el
// teléfono: si la ficha del número tiene OTRO nombre (familiares comparten
// celular), esa ficha se descarta. Cascada: 1º teléfono verificado (con nombre
// coincidente), 2º nombre ILIKE (completa el teléfono si faltaba), 3º carnet
// exacto (con nombre coincidente).
async function resolveExistingPatient(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  fullName: string,
  phone?: string,
  ci?: string,
): Promise<string | null> {
  // 1) Por teléfono: lo más confiable, es el número real desde el que escribe —
  //    siempre que el nombre dictado coincida con esa ficha.
  if (phone) {
    const { data: byPhone } = await admin
      .from("patients")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id && namesMatch(byPhone.full_name ?? "", fullName)) return byPhone.id;
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
  // 3) Por carnet: paciente antiguo que cambió de número. Solo si el nombre
  //    coincide (un carnet dictado mal no debe secuestrar otra ficha).
  if (ci) {
    const { data: byCi } = await admin
      .from("patients")
      .select("id, full_name, phone")
      .eq("clinic_id", clinicId)
      .eq("national_id", ci)
      .limit(1)
      .maybeSingle();
    if (byCi?.id && namesMatch(byCi.full_name ?? "", fullName)) {
      if (phone && !byCi.phone) {
        await admin.from("patients").update({ phone }).eq("id", byCi.id);
      }
      return byCi.id;
    }
  }
  return null;
}

// Deja una solicitud de registro PENDIENTE en "Registros entrantes" (misma
// bandeja que las altas por enlace: anamnesis_invitations kind='new'), marcada
// con source='agente' para que conste que la tomó el Asistente Virtual. El
// admin/recepción la revisa y al aprobar recién se crea la ficha — el bot
// NUNCA crea pacientes directamente (evita duplicados y registros de burla).
// Si ya hay una solicitud pendiente para el mismo teléfono o carnet, se reusa.
async function requestPatientRegistration(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  fullName: string,
  phone?: string,
  ci?: string,
): Promise<void> {
  // ¿Ya hay una pendiente del mismo teléfono o carnet? No crear otra.
  if (phone) {
    const { data: dup } = await admin
      .from("anamnesis_invitations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("kind", "new")
      .eq("source", "agente")
      .is("reviewed_at", null)
      .eq("contact_phone", phone)
      .limit(1)
      .maybeSingle();
    if (dup) return;
  }
  const { error } = await admin.from("anamnesis_invitations").insert({
    token: randomBytes(32).toString("base64url"),
    kind: "new",
    source: "agente",
    clinic_id: clinicId,
    patient_id: null,
    created_by: null,
    // Ya viene "completada": los datos los recolectó el bot en la conversación.
    completed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    contact_phone: phone ?? null,
    contact_name: fullName,
    submitted_personal: {
      full_name: fullName,
      national_id: ci ?? "",
      phone: phone ?? "",
    },
    // Historial médico vacío (el schema tiene defaults): se completa después
    // en la ficha. La aprobación exige un objeto válido, no null.
    submitted_data: {},
  });
  if (error) {
    console.error("[agent/requestPatientRegistration]", error.message, { clinicId });
  }
}

// Resuelve la ficha del paciente SIN crearla (para operar sobre citas ya
// existentes). Misma cascada de identificadores que el resto de tools
// (lección Vapi: TODAS las tools de una entidad resuelven por los MISMOS
// identificadores): 1º teléfono verificado de WhatsApp, 2º nombre ILIKE.
// Si el nombre dictado NO coincide con la ficha del teléfono, esa ficha se
// descarta (evita reprogramar/cancelar la cita de otra persona que comparte
// número o de una ficha vieja mal atribuida).
async function resolvePatientId(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  phone?: string,
  fullName?: string,
): Promise<string | null> {
  if (phone) {
    const { data } = await admin
      .from("patients")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (data?.id && (!fullName?.trim() || namesMatch(data.full_name ?? "", fullName)))
      return data.id;
  }
  if (fullName?.trim()) {
    const { data } = await admin
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .ilike("full_name", `%${fullName.trim()}%`)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

type ApptRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  dentist_id: string | null;
  dentist_name: string | null;
  reason: string | null;
  status: string;
};

const APPT_COLS = "id, starts_at, ends_at, dentist_id, dentist_name, reason, status";

// Fecha y hora legibles en Bolivia de un instante ISO ("2026-07-04", "10:30").
function apptWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ }),
    time: d.toLocaleTimeString("es-BO", {
      timeZone: BOLIVIA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

// Fábrica de herramientas del agente, cerradas sobre la clínica actual y un
// contexto mutable. Misma lógica de disponibilidad/reserva que el webhook de
// Vapi, para que ambos canales se comporten igual. `canManage` (addon T2)
// agrega las tools de gestión de citas existentes (consultar/reprogramar/
// cancelar); con solo T1 el agente únicamente agenda.
export function buildAgentTools(
  clinicId: string,
  ctx: AgentContext,
  patientPhone?: string,
  canManage?: boolean,
) {
  const admin = createAdminClient();

  // Próximas citas activas del paciente (por patient_id o nombre), la más
  // cercana primero. Cascada: 1º patient_id (ficha resuelta), 2º patient_name
  // ILIKE (citas creadas a mano sin ficha vinculada).
  async function findUpcoming(patientId: string | null, patientName?: string): Promise<ApptRow[]> {
    const nowIso = new Date().toISOString();
    if (patientId) {
      const { data } = await admin
        .from("appointments")
        .select(APPT_COLS)
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .gte("starts_at", nowIso)
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at", { ascending: true })
        .limit(3);
      if (data && data.length > 0) return data as ApptRow[];
    }
    if (patientName?.trim()) {
      const { data } = await admin
        .from("appointments")
        .select(APPT_COLS)
        .eq("clinic_id", clinicId)
        .ilike("patient_name", `%${patientName.trim()}%`)
        .gte("starts_at", nowIso)
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at", { ascending: true })
        .limit(3);
      if (data && data.length > 0) return data as ApptRow[];
    }
    return [];
  }

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
        carnet: z
          .string()
          .optional()
          .describe(
            "Número de carnet (cédula de identidad) del paciente. OBLIGATORIO si el paciente aún no está registrado en la clínica; pídeselo antes de agendar.",
          ),
      }),
      execute: async ({
        patient_name,
        date,
        time,
        reason,
        doctor_name,
        contact_phone,
        carnet,
      }) => {
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

        // Resolver la ficha del paciente por su número de WhatsApp (identidad
        // verificada), nombre o carnet. Si WhatsApp ocultó el número (@lid sin
        // senderPn), se usa el celular que el paciente dictó (contact_phone).
        // Identificadores dictados se normalizan a solo dígitos — mismo criterio
        // que los carnets dictados por voz en Vapi.
        const dictated = contact_phone?.replace(/[\s.\-()+]/g, "") ?? "";
        const effectivePhone = patientPhone ?? (dictated.length >= 7 ? dictated : undefined);
        const ci = carnet?.replace(/[\s.\-]/g, "") ?? "";
        const patientId = await resolveExistingPatient(
          admin,
          clinicId,
          patient_name.trim(),
          effectivePhone,
          ci || undefined,
        );

        // Paciente NO registrado: el bot no crea fichas — exige el carnet y
        // deja una solicitud pendiente para que el equipo la apruebe en
        // "Registros entrantes". La cita se crea igual (por nombre) y se
        // vincula a la ficha cuando el equipo aprueba el registro.
        if (!patientId && !ci) {
          return `ERROR: la cita NO fue agendada. ${patient_name} no está registrado en la clínica y falta su número de carnet. Pídele su carnet (cédula de identidad) y vuelve a llamar book_appointment incluyendo el parámetro carnet.`;
        }
        if (!patientId) {
          await requestPatientRegistration(
            admin,
            clinicId,
            patient_name.trim(),
            effectivePhone,
            ci,
          );
        }

        // Si la cita quedó con un doctor real, dejar rastro en el motivo de que
        // la agendó el bot (cuando queda a nombre de "Asistente Virtual" el
        // rastro ya es evidente en la propia columna del doctor).
        const baseReason = reason?.trim() || "Consulta";
        const finalReason = assignedDoctorId
          ? `${baseReason} (agendada por asistente virtual)`
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
          source: "agente",
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
      description: canManage
        ? "Deriva la conversación a una persona del equipo. Úsala cuando el paciente pida hablar con un humano, se queje, o pregunte algo FUERA de gestionar citas (precios, dudas médicas, reclamos), o cuando no puedas resolver. Después despídete brevemente diciendo que un miembro del equipo continuará."
        : "Deriva la conversación a una persona del equipo. Úsala cuando el paciente pida hablar con un humano, se queje, o pregunte algo FUERA de agendar una cita nueva (precios, reprogramar, cancelar, dudas médicas), o cuando no puedas resolver. Después despídete brevemente diciendo que un miembro del equipo continuará.",
      inputSchema: z.object({
        reason: z.string().describe("Motivo breve de la derivación"),
      }),
      execute: async ({ reason }) => {
        ctx.handoffRequested = true;
        ctx.handoffReason = reason;
        return "OK: conversación derivada a un humano. Despídete e indica que el equipo continuará.";
      },
    }),

    // ── Tools T2 (addon agente_ia_t2): gestión de citas existentes ──────────
    ...(canManage
      ? {
          get_my_appointments: tool({
            description:
              "Consulta las próximas citas del paciente que escribe. Úsala cuando pregunte cuándo es su cita, si tiene una cita, o antes de reprogramar/cancelar para confirmar cuál es.",
            inputSchema: z.object({
              patient_name: z
                .string()
                .optional()
                .describe("Nombre del paciente, si lo dio en la conversación"),
            }),
            execute: async ({ patient_name }) => {
              const patientId = await resolvePatientId(
                admin,
                clinicId,
                patientPhone,
                patient_name,
              );
              const appts = await findUpcoming(patientId, patient_name);
              if (appts.length === 0) {
                return "No encontré citas próximas para este paciente. Si el paciente insiste en que tiene una, pídele su nombre completo exacto y vuelve a consultar.";
              }
              return {
                appointments: appts.map((a) => {
                  const w = apptWhen(a.starts_at);
                  return {
                    date: w.date,
                    time: w.time,
                    doctor: a.dentist_name,
                    reason: a.reason,
                    status: a.status,
                  };
                }),
              };
            },
          }),

          reschedule_appointment: tool({
            description:
              "Reprograma la próxima cita del paciente a una nueva fecha y hora. Antes verifica disponibilidad del nuevo horario con check_availability y confirma el cambio con el paciente. La respuesta empieza con 'OK:' si se reprogramó o 'ERROR:' si falló. NUNCA confirmes si empieza con ERROR.",
            inputSchema: z.object({
              patient_name: z.string().describe("Nombre completo del paciente"),
              new_date: z.string().describe("Nueva fecha YYYY-MM-DD"),
              new_time: z.string().describe("Nueva hora, ej. 14:30"),
            }),
            execute: async ({ patient_name, new_date, new_time }) => {
              ctx.manageAttempted = true;
              const nTime = normalizeTime(new_time);
              if (!nTime)
                return `ERROR: la cita NO fue reprogramada. No entendí la hora "${new_time}". Pide la hora en formato 24h, ej. "14:30".`;
              const nDate = normalizeDate(new_date);
              if (!nDate)
                return `ERROR: la cita NO fue reprogramada. No entendí la fecha "${new_date}". Pídela como día/mes/año.`;
              const newStart = new Date(`${nDate}T${nTime}:00-04:00`);
              if (isNaN(newStart.getTime()))
                return "ERROR: la cita NO fue reprogramada. Fecha u hora inválida.";
              if (newStart.getTime() < Date.now())
                return `ERROR: la cita NO fue reprogramada. La fecha ${nDate} a las ${nTime} ya pasó. Revisa la TABLA DE FECHAS y ofrece un horario futuro.`;

              const patientId = await resolvePatientId(
                admin,
                clinicId,
                patientPhone,
                patient_name,
              );
              let appts = await findUpcoming(patientId, patient_name);
              // Lección Vapi: en el flujo "cancelar → reagendar en la misma
              // conversación" la cita quedó cancelled y la búsqueda normal no
              // la encuentra. Fallback: la cita cancelada futura más próxima.
              if (appts.length === 0) {
                const nowIso = new Date().toISOString();
                let q = admin
                  .from("appointments")
                  .select(APPT_COLS)
                  .eq("clinic_id", clinicId)
                  .eq("status", "cancelled")
                  .gte("starts_at", nowIso)
                  .order("starts_at", { ascending: true })
                  .limit(1);
                q = patientId
                  ? q.eq("patient_id", patientId)
                  : q.ilike("patient_name", `%${patient_name.trim()}%`);
                const { data: cancelled } = await q;
                appts = (cancelled ?? []) as ApptRow[];
              }
              if (appts.length === 0)
                return "ERROR: la cita NO fue reprogramada. No encontré ninguna cita próxima de este paciente. Pídele su nombre completo exacto y vuelve a intentar; si sigue sin aparecer, ofrécele agendar una cita nueva con book_appointment.";

              const appt = appts[0];
              const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
              // Choque por solapamiento excluyendo la propia cita. Con doctor
              // real asignado se mide contra ese doctor; sin doctor, la clínica
              // entera es el recurso (igual que book_appointment).
              let clashQuery = admin
                .from("appointments")
                .select("id")
                .eq("clinic_id", clinicId)
                .neq("id", appt.id)
                .lt("starts_at", newEnd.toISOString())
                .gt("ends_at", newStart.toISOString())
                .not("status", "in", "(cancelled,no_show)");
              if (appt.dentist_id) clashQuery = clashQuery.eq("dentist_id", appt.dentist_id);
              const { data: clash } = await clashQuery.limit(1);
              if (clash && clash.length > 0)
                return `ERROR: la cita NO fue reprogramada. El horario ${nTime} del ${nDate} ya está ocupado. Usa check_availability y ofrece otra hora.`;

              const { error } = await admin
                .from("appointments")
                .update({
                  starts_at: newStart.toISOString(),
                  ends_at: newEnd.toISOString(),
                  status: "scheduled",
                })
                .eq("id", appt.id);
              if (error) {
                console.error("[agent/reschedule]", error.message, { clinicId, apptId: appt.id });
                return "ERROR: la cita NO fue reprogramada. Hubo un problema al guardar. Pide al paciente que llame a la clínica.";
              }
              ctx.manageSucceeded = true;
              const old = apptWhen(appt.starts_at);
              return `OK: cita reprogramada del ${old.date} ${old.time} al ${nDate} a las ${nTime}${
                appt.dentist_name ? ` con ${appt.dentist_name}` : ""
              }.`;
            },
          }),

          cancel_appointment: tool({
            description:
              "Cancela la próxima cita del paciente. SIEMPRE confirma con el paciente antes de cancelar ('¿confirmas que deseas cancelar tu cita del ...?'). La respuesta empieza con 'OK:' si se canceló o 'ERROR:' si falló. NUNCA confirmes si empieza con ERROR.",
            inputSchema: z.object({
              patient_name: z.string().describe("Nombre completo del paciente"),
              date: z
                .string()
                .optional()
                .describe("Fecha YYYY-MM-DD de la cita a cancelar, si el paciente tiene varias"),
            }),
            execute: async ({ patient_name, date }) => {
              ctx.manageAttempted = true;
              const patientId = await resolvePatientId(
                admin,
                clinicId,
                patientPhone,
                patient_name,
              );
              let appts = await findUpcoming(patientId, patient_name);
              if (date) {
                const nDate = normalizeDate(date);
                if (nDate) {
                  const filtered = appts.filter((a) => apptWhen(a.starts_at).date === nDate);
                  if (filtered.length > 0) appts = filtered;
                }
              }
              if (appts.length === 0)
                return "ERROR: la cita NO fue cancelada. No encontré ninguna cita próxima de este paciente. Pídele su nombre completo exacto y vuelve a intentar.";

              const appt = appts[0];
              const { error } = await admin
                .from("appointments")
                .update({ status: "cancelled" })
                .eq("id", appt.id);
              if (error) {
                console.error("[agent/cancel]", error.message, { clinicId, apptId: appt.id });
                return "ERROR: la cita NO fue cancelada. Hubo un problema al guardar. Pide al paciente que llame a la clínica.";
              }
              ctx.manageSucceeded = true;
              const w = apptWhen(appt.starts_at);
              return `OK: cita del ${w.date} a las ${w.time} cancelada. Si el paciente quiere reagendar en otro horario, usa reschedule_appointment o book_appointment.`;
            },
          }),
        }
      : {}),
  };
}
