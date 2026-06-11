import "server-only";

// ============================================================================
// Cliente Vapi — llamadas de voz con IA.
// Docs: https://docs.vapi.ai
//
// Variables de entorno requeridas:
//   VAPI_API_KEY                  — clave privada de tu cuenta Vapi
//   VAPI_PHONE_NUMBER_ID          — ID del número comprado en Vapi
//   VAPI_REMINDER_ASSISTANT_ID    — ID del asistente de recordatorios (outbound)
//   VAPI_WEBHOOK_SECRET           — secreto para verificar webhooks (opcional)
//   VAPI_CLINIC_ID                — clinic_id del tenant en prototipo mono-clínica
// ============================================================================

const VAPI_BASE = "https://api.vapi.ai";

export type VapiCallResult = { ok: boolean; callId?: string; error?: string };

export async function vapiPost(path: string, body: unknown): Promise<VapiCallResult> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return { ok: false, error: "VAPI_API_KEY no configurada." };

  try {
    const res = await fetch(`${VAPI_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    return { ok: true, callId: json?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}

// ── Llamadas salientes (recordatorios) ───────────────────────────────────────

export type ReminderCallParams = {
  to: string;           // solo dígitos con código de país, sin '+' (ej. "59171234567")
  patientName: string;
  clinicName: string;
  dateLabel: string;    // "martes 15 de julio"
  timeLabel: string;    // "10:30"
  appointmentId: string;
  reminderId: string;
};

export async function triggerReminderCall(p: ReminderCallParams): Promise<VapiCallResult> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const assistantId = process.env.VAPI_REMINDER_ASSISTANT_ID;

  if (!phoneNumberId || !assistantId) {
    return {
      ok: false,
      error: "Faltan VAPI_PHONE_NUMBER_ID o VAPI_REMINDER_ASSISTANT_ID en las variables de entorno.",
    };
  }

  return vapiPost("/call", {
    phoneNumberId,
    customer: { number: `+${p.to}`, name: p.patientName },
    assistantId,
    assistantOverrides: {
      variableValues: {
        patientName: p.patientName,
        clinicName: p.clinicName,
        dateLabel: p.dateLabel,
        timeLabel: p.timeLabel,
      },
    },
    metadata: {
      appointmentId: p.appointmentId,
      reminderId: p.reminderId,
      type: "reminder",
    },
  });
}

// ── Prompt y herramientas del asistente de recordatorios ─────────────────────
// Copiar este prompt en el dashboard de Vapi al crear el Assistant de recordatorios.

export const REMINDER_ASSISTANT_PROMPT = `
Eres un asistente telefónico amable de {{clinicName}}.
Tu único objetivo es recordar la cita de {{patientName}} y saber si asistirá.

Flujo obligatorio:
1. Saluda: "¡Hola! ¿Hablo con {{patientName}}?"
   - Si la persona dice que no es {{patientName}}, discúlpate brevemente y termina.
2. Preséntate y da el recordatorio:
   "Le llamo de parte de {{clinicName}} para recordarle su cita el {{dateLabel}} a las {{timeLabel}}."
3. Pregunta: "¿Confirma que asistirá?"
   - Si CONFIRMA (sí, claro, ahí estaré, etc.) → llama a confirm_appointment
     y despídete: "¡Perfecto! Le esperamos. Que tenga buen día."
   - Si CANCELA (no puedo, cancela, no voy) → llama a cancel_appointment
     y despídete: "Entendido, la cita queda cancelada. Que tenga buen día."
   - Si duda o no sabe → despídete: "Sin problema, si necesita reagendar llámenos. Hasta luego."
4. Si detectas buzón de voz o grabación automática → termina la llamada sin dejar mensaje.

Normas:
- Habla solo en español neutro.
- Sé breve y cordial. Máximo 4 turnos de conversación.
- No ofrezcas ni expliques nada fuera de este guion.
`.trim();

export const REMINDER_TOOLS = [
  {
    type: "function",
    function: {
      name: "confirm_appointment",
      description: "Confirma la cita cuando el paciente dice que sí asistirá.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela la cita cuando el paciente no podrá asistir.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Asistente de recepción entrante (inbound) ────────────────────────────────

export function buildInboundAssistant(clinicName: string) {
  return {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres la recepcionista virtual de ${clinicName}, una clínica dental. Hablas solo en español neutro y eres amable y profesional.

Puedes ayudar con:
1. Agendar una nueva cita dental.
2. Información general de la clínica.

Flujo para agendar:
1. Pide el nombre completo del paciente.
2. Pide el motivo de la consulta (limpieza, dolor, extracción, revisión, etc.).
3. Pregunta qué día prefiere (responde en formato YYYY-MM-DD) y a qué hora (HH:MM).
4. Llama a check_availability con esa fecha.
5. Si hay horarios disponibles, confirma el solicitado; si no, sugiere el más cercano disponible.
6. Llama a book_appointment con todos los datos recopilados.
7. Confirma la cita al paciente y despídete.

Normas:
- Habla solo en español.
- No inventes precios, tratamientos ni información médica.
- Si el paciente pregunta algo fuera de tu alcance, pídele que llame directamente a la clínica.
- Sé breve y profesional.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "check_availability",
            description: "Consulta los horarios disponibles para una fecha específica.",
            parameters: {
              type: "object",
              properties: {
                date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
              },
              required: ["date"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "book_appointment",
            description: "Agenda una cita para el paciente en el sistema.",
            parameters: {
              type: "object",
              properties: {
                patient_name: { type: "string", description: "Nombre completo del paciente" },
                date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
                time: { type: "string", description: "Hora en formato HH:MM" },
                reason: { type: "string", description: "Motivo de la consulta" },
              },
              required: ["patient_name", "date", "time"],
            },
          },
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: "paula",
    },
    firstMessage: `Hola, gracias por llamar a ${clinicName}. ¿En qué puedo ayudarle?`,
  };
}
