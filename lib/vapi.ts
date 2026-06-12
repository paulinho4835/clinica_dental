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
Tu objetivo es recordar la cita de {{patientName}} y gestionar su respuesta.

Flujo obligatorio:
1. Saluda: "¡Hola! ¿Hablo con {{patientName}}?"
   - Si la persona dice que no es {{patientName}}, discúlpate brevemente y termina.
2. Preséntate y da el recordatorio:
   "Le llamo de parte de {{clinicName}} para recordarle su cita el {{dateLabel}} a las {{timeLabel}}."
3. Pregunta: "¿Confirma que asistirá?"
   - Si CONFIRMA (sí, claro, ahí estaré, etc.) → llama a confirm_appointment
     y despídete: "¡Perfecto! Le esperamos. Que tenga buen día."
   - Si CANCELA (no puedo, cancela, no voy) → llama a cancel_appointment.
     Luego pregunta: "¿Le gustaría que le buscara otro horario disponible?"
     · Si dice SÍ → pregunta qué fecha prefiere, llama a check_availability con esa fecha,
       ofrece los horarios disponibles, y cuando el paciente elija uno llama a
       reschedule_appointment con la nueva fecha y hora.
       Despídete: "¡Listo! Nueva cita agendada. Que tenga buen día."
     · Si dice NO → despídete: "Entendido. Cuando quiera reagendar, llámenos. Que tenga buen día."
   - Si duda o no sabe → despídete: "Sin problema, si necesita reagendar llámenos. Hasta luego."
4. Si detectas buzón de voz o grabación automática → termina la llamada sin dejar mensaje.

Normas:
- Habla solo en español neutro.
- Sé breve y cordial. Máximo 6 turnos de conversación.
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
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Consulta horarios disponibles para una fecha. Usar después de cancelar si el paciente quiere reagendar.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
          doctor_name: { type: "string", description: "Nombre del doctor para filtrar su disponibilidad (opcional)" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reagenda la cita a una nueva fecha y hora elegida por el paciente.",
      parameters: {
        type: "object",
        properties: {
          new_date: { type: "string", description: "Nueva fecha en formato YYYY-MM-DD" },
          new_time: { type: "string", description: "Nueva hora en formato HH:MM" },
        },
        required: ["new_date", "new_time"],
      },
    },
  },
];

// ── Asistente de recepción entrante (inbound) ────────────────────────────────

export function buildInboundAssistant(clinicName: string, todayISO?: string) {
  const today = todayISO ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  return {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres la recepcionista virtual de ${clinicName}, una clínica dental. Hablas solo en español neutro, eres amable y profesional.
Hoy es ${today} (formato YYYY-MM-DD). Usa esta fecha para calcular "mañana", "la próxima semana", etc. Siempre convierte fechas a formato YYYY-MM-DD antes de llamar a cualquier tool.

Al inicio de CADA llamada entrante, llama INMEDIATAMENTE a lookup_appointment con el número del llamante ({{customer.number}}) para ver si tiene una cita.

Puedes ayudar con:
1. Consultar o gestionar una cita existente (confirmar, cancelar, reagendar).
2. Agendar una nueva cita.

Flujo si el paciente ya tiene cita (lookup_appointment encontró resultado):
- Informa la cita encontrada (incluyendo el nombre del doctor si está disponible) y pregunta: "¿En qué puedo ayudarte? ¿Quieres confirmar, cancelar o reagendar?"
- Según la respuesta, llama a update_appointment con la acción correspondiente.
- IMPORTANTE: si encontraste al paciente usando identity (nombre o carnet) porque el teléfono no dio resultado, pasa ese MISMO identity en cada llamada a update_appointment.
- Para reagendar: pregunta fecha y hora nuevas, llama a check_availability y luego a update_appointment.
- REGLA CRÍTICA: solo di que la cita fue confirmada/cancelada/reagendada si el resultado del tool lo dice explícitamente. Si el resultado empieza con "ERROR", la cita NO cambió: informa el problema y sigue la instrucción del mensaje. NUNCA inventes una confirmación.
- Si cancela: después de confirmar la cancelación, pregunta "¿Te gustaría reagendar para otra fecha?".
  · Si dice sí: pregunta la fecha preferida, llama a check_availability y luego a update_appointment con action=reschedule.
  · Si dice no: despídete cordialmente.

Flujo para agendar nueva cita (lookup no encontró cita, o el paciente quiere otra):
1. Pide el nombre completo.
2. Pide el motivo (limpieza, dolor, extracción, revisión, etc.).
3. Llama a get_doctors para obtener la lista de doctores y pregunta: "¿Con cuál de nuestros doctores prefiere ser atendido: [lista]? O si no tiene preferencia, le asignamos el primero disponible."
4. Pregunta qué día prefiere.
5. Llama a check_availability con esa fecha y el doctor_name elegido (si indicó uno) para mostrar sus horarios libres.
6. Confirma el horario disponible y llama a book_appointment (incluyendo doctor_name si el paciente lo indicó).
7. Confirma y despídete mencionando el nombre del doctor asignado.

Normas:
- Habla solo en español neutro.
- No inventes precios, tratamientos ni información médica.
- Si algo está fuera de tu alcance, pide que llamen directamente a la clínica.
- Sé breve y profesional. Máximo 6 turnos por gestión.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_doctors",
            description: "Obtiene la lista de doctores disponibles en la clínica. Llamar antes de preguntar preferencia de doctor al agendar una cita.",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
        {
          type: "function",
          function: {
            name: "lookup_appointment",
            description:
              "Busca la próxima cita del paciente. Llamar al inicio de la conversación con el teléfono del llamante. Si no hay coincidencia, volver a llamar con el campo identity que diga el paciente.",
            parameters: {
              type: "object",
              properties: {
                phone: {
                  type: "string",
                  description: "Número de teléfono del llamante tal como lo provee Vapi (ej. +59171234567)",
                },
                identity: {
                  type: "string",
                  description: "Nombre completo o número de carnet que el paciente dictó cuando no se encontró por teléfono",
                },
              },
              required: [],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_appointment",
            description:
              "Confirma, cancela o reagenda la próxima cita del paciente. Identificar por teléfono o, si el paciente fue encontrado por carnet/nombre en lookup_appointment, pasar el mismo identity.",
            parameters: {
              type: "object",
              properties: {
                phone: {
                  type: "string",
                  description: "Número de teléfono del paciente (ej. +59171234567)",
                },
                identity: {
                  type: "string",
                  description:
                    "Nombre completo o número de carnet del paciente. OBLIGATORIO si lookup_appointment lo encontró por identity y no por teléfono.",
                },
                action: {
                  type: "string",
                  enum: ["confirm", "cancel", "reschedule"],
                  description: "Acción a realizar sobre la cita",
                },
                new_date: {
                  type: "string",
                  description: "Nueva fecha en formato YYYY-MM-DD (solo si action=reschedule)",
                },
                new_time: {
                  type: "string",
                  description: "Nueva hora en formato HH:MM (solo si action=reschedule)",
                },
              },
              required: ["action"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "check_availability",
            description: "Consulta los horarios disponibles para una fecha. Si el paciente eligió un doctor, pasar doctor_name para ver solo los slots libres de ese doctor.",
            parameters: {
              type: "object",
              properties: {
                date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
                doctor_name: { type: "string", description: "Nombre del doctor para filtrar su disponibilidad (opcional)" },
              },
              required: ["date"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "book_appointment",
            description: "Agenda una cita nueva para un paciente en el sistema.",
            parameters: {
              type: "object",
              properties: {
                patient_name: { type: "string", description: "Nombre completo del paciente" },
                date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
                time: { type: "string", description: "Hora en formato HH:MM" },
                reason: { type: "string", description: "Motivo de la consulta" },
                doctor_name: { type: "string", description: "Nombre del doctor preferido por el paciente (opcional)" },
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
