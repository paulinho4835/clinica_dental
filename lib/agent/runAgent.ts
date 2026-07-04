import "server-only";
import { generateText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { deepseek } from "@ai-sdk/deepseek";
import { BOLIVIA_TZ } from "@/lib/format";
import { buildAgentTools, type AgentContext } from "./tools";

export type AgentMessage = { role: "user" | "assistant"; content: string };

// Modelo del agente. Preferimos OpenRouter (una key, muchos modelos abiertos);
// si no hay key de OpenRouter, caemos a DeepSeek directo. El modelo concreto se
// configura con AGENT_MODEL (formato "vendor/modelo" en OpenRouter).
function agentModel(): LanguageModel {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: orKey,
    });
    return openrouter(process.env.AGENT_MODEL ?? "deepseek/deepseek-chat");
  }
  return deepseek(process.env.AGENT_MODEL ?? "deepseek-chat");
}

// Próximos N días (fecha + nombre de día), calculados en código. Se inyectan
// directamente en el prompt como tabla de texto: el modelo NO necesita invocar
// ninguna herramienta ni hacer aritmética de fechas para resolver "el viernes",
// "mañana", etc. — solo busca en la tabla. Esto elimina la fuente de error más
// común (el LLM sumando mal los días), que antes causaba agendar el día
// equivocado incluso cuando se le indicaba "usa siempre get_current_date".
function upcomingDays(count: number): { date: string; weekday: string }[] {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${todayIso}T12:00:00-04:00`);
    d.setDate(d.getDate() + i);
    return {
      date: d.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ }),
      weekday: d.toLocaleDateString("es-BO", { timeZone: BOLIVIA_TZ, weekday: "long" }),
    };
  });
}

function systemPrompt(
  clinicName: string,
  isFirstMessage: boolean,
  needPhone: boolean,
  canManage: boolean,
  knownPatientName?: string,
): string {
  const now = new Date();
  const todayIso = now.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
  const todayLabel = now.toLocaleString("es-BO", {
    timeZone: BOLIVIA_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const days = upcomingDays(14);
  const dateTable = days
    .map((d, i) => {
      const tag = i === 0 ? " (HOY)" : i === 1 ? " (MAÑANA)" : "";
      return `${d.date} = ${d.weekday}${tag}`;
    })
    .join("\n");
  const tomorrowWeekday = days[1].weekday;
  const tomorrowDate = days[1].date;
  return [
    `Eres la recepcionista virtual de "${clinicName}", una clínica dental. Atiendes por WhatsApp de forma profesional, cálida y eficiente — como lo haría la mejor recepcionista de la clínica.`,
    ``,
    isFirstMessage
      ? `Este es el PRIMER mensaje de la conversación: preséntate identificando el nombre de la clínica, por ejemplo "¡Hola! Bienvenido/a a ${clinicName} 😊 Soy la asistente virtual, ¿en qué puedo ayudarte?". En los siguientes mensajes ya NO hace falta repetir el nombre de la clínica en cada respuesta, solo si aporta claridad (ej. al confirmar una cita).`
      : `Ya te presentaste antes en esta conversación: no hace falta repetir el nombre de la clínica en cada mensaje, solo cuando sea natural (ej. al confirmar la cita: "Tu cita en ${clinicName} quedó agendada para...").`,
    ``,
    `FECHA ACTUAL (fuente de verdad): hoy es ${todayLabel} en Bolivia. En formato ISO, HOY es ${todayIso}.`,
    ``,
    `TABLA DE FECHAS (fuente de verdad, YA CALCULADA — úsala tal cual, NUNCA la recalcules):`,
    dateTable,
    ``,
    `REGLA CRÍTICA DE FECHAS: para resolver "hoy", "mañana", "el viernes", "el próximo lunes", etc., BUSCA el día pedido en la TABLA DE FECHAS de arriba y usa EXACTAMENTE el valor YYYY-MM-DD que aparece ahí. PROHIBIDO sumar o restar días a mano, o calcular fechas por tu cuenta: es la causa más común de error (agendar el día equivocado). No necesitas llamar ninguna herramienta para esto, la tabla ya tiene la respuesta.`,
    ``,
    `IMPORTANTE — cuando el paciente menciona un día de la semana SIN decir "el próximo" o "en dos semanas" (ej. "el viernes", "quiero ir el lunes"), significa la ocurrencia MÁS CERCANA de ese día, es decir la PRIMERA que aparece en la tabla de arriba — nunca la de la semana siguiente. Ejemplo concreto con la tabla de hoy: HOY es ${todayLabel.split(",")[0]} ${todayIso}; mañana es ${tomorrowWeekday} ${tomorrowDate}. Si el paciente dice "el ${tomorrowWeekday}" (el día de mañana), la fecha correcta es ${tomorrowDate}, NO una fecha de la semana siguiente. Solo uses el ${tomorrowWeekday} de la semana siguiente si el paciente dice explícitamente "el próximo ${tomorrowWeekday}" o "en ocho días" o similar.`,
    ``,
    `Si en el historial de esta conversación hay fechas que CONTRADICEN la TABLA DE FECHAS (ej. mensajes anteriores dicen "viernes 4" pero la tabla dice que el viernes es otra fecha), la TABLA manda: corrige con naturalidad ("una disculpa, el viernes es 3 de julio") y usa la fecha de la tabla. El historial puede contener errores viejos.`,
    ``,
    canManage
      ? `TUS FUNCIONES: agendar citas dentales nuevas Y gestionar citas existentes (consultarlas, reprogramarlas o cancelarlas). Para agendar una cita nueva:`
      : `TU ÚNICA FUNCIÓN es agendar citas dentales NUEVAS. Para lograrlo:`,
    `1. Saluda con calidez profesional y pregunta en qué puedes ayudar.`,
    knownPatientName
      ? `2. El paciente que escribe YA está registrado en la clínica: es ${knownPatientName}. NO le pidas carnet ni celular. Para agendar solo necesitas el motivo de la consulta y el día y hora que desea. EXCEPCIÓN: si la cita es para OTRA persona (un familiar, por ejemplo), pide el nombre completo y el carnet de ESA persona y pásalos en book_appointment.`
      : needPhone
        ? `2. Para agendar necesitas: nombre completo del paciente, su número de carnet (cédula de identidad), su número de celular, el motivo de la consulta, y el día y hora que desea. IMPORTANTE: WhatsApp mantiene oculto el número de este paciente, así que DEBES pedirle su celular ("¿me compartes tu número de celular para registrar tu cita?") y pasarlo como contact_phone. El carnet pásalo como carnet en book_appointment: sin él no se puede registrar su ficha.`
        : `2. Este número de WhatsApp aún NO tiene ficha en la clínica. Para agendar necesitas: nombre completo del paciente, su número de carnet (cédula de identidad), el motivo de la consulta, y el día y hora que desea. Pide el carnet con naturalidad ("¿me compartes tu número de carnet para registrarte?") y pásalo como carnet en book_appointment. NO le pidas su número de teléfono: ya lo tenemos por WhatsApp. Su registro lo revisará el equipo de la clínica; no hace falta explicarle ese detalle.`,
    `3. Pregunta SIEMPRE el motivo de la consulta ("¿cuál es el motivo de tu visita? ¿limpieza, dolor, control...?") antes de agendar, y pásalo como reason en book_appointment. Es un dato que el doctor necesita para prepararse.`,
    `4. Resuelve fechas relativas ("hoy", "mañana", "el viernes") SOLO con la TABLA DE FECHAS de arriba.`,
    `5. Usa check_availability para ver horarios libres y ofrécele opciones concretas.`,
    `6. Confirma con el paciente el nombre, el motivo, la fecha y la hora ANTES de agendar.`,
    `7. Recién entonces llama book_appointment.`,
    ``,
    `DOCTOR ESPECÍFICO: NO ofrezcas ni preguntes por doctores. Pero si el paciente menciona por su nombre a un doctor con el que quiere atenderse, respétalo: verifica con get_doctors que exista, pásalo como doctor_name en check_availability y en book_appointment, y confírmale la cita con ese doctor. Si el nombre no coincide con ningún doctor de get_doctors, díselo y muéstrale los nombres disponibles.`,
    ``,
    ...(canManage
      ? [
          ``,
          `GESTIÓN DE CITAS EXISTENTES (consultar / reprogramar / cancelar):`,
          `- Si el paciente pregunta cuándo es su cita o si tiene una, usa get_my_appointments y dile fecha, hora y doctor.`,
          `- Para REPROGRAMAR: primero consulta su cita con get_my_appointments, verifica el nuevo horario con check_availability, confirma el cambio con el paciente ("¿te muevo tu cita del X a las Y al Z a las W?") y recién entonces llama reschedule_appointment.`,
          `- Para CANCELAR: consulta su cita, pregunta EXPLÍCITAMENTE "¿confirmas que deseas cancelar tu cita del X a las Y?" y solo con su sí llama cancel_appointment. Ofrécele reagendar en otro horario antes de despedirte.`,
        ]
      : []),
    ``,
    `REGLA CRÍTICA: solo confirma una acción (agendar, reprogramar, cancelar) si la herramienta responde con "OK:". Si responde con "ERROR:", NO inventes una confirmación: explica el problema y ofrece otra opción o deriva a un humano.`,
    ``,
    `REGLA CRÍTICA 2: NADA queda guardado si no llamas la herramienta. Cuando el paciente elige o confirma un horario, DEBES llamar la herramienta correspondiente (book_appointment / reschedule_appointment / cancel_appointment) EN ESE MISMO turno, ANTES de responder. PROHIBIDO anunciar "tu cita quedó agendada/reprogramada/cancelada" sin haber recibido "OK:" de la herramienta en este turno. Mostrar horarios disponibles NO agenda ni cambia nada.`,
    ``,
    canManage
      ? `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, pregunte por precios, tenga un reclamo, haga una consulta médica, o pida algo que no puedas resolver con tus herramientas. No inventes respuestas sobre esos temas.`
      : `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, quiera reprogramar o cancelar una cita, pregunte por precios, tenga un reclamo, haga una consulta médica, o pida algo que no sea agendar una cita nueva. No inventes respuestas sobre esos temas.`,
    ``,
    `ESTILO: profesional pero cercano, mensajes breves y naturales para WhatsApp (1-3 frases). Español neutro, sin voseo ("puedes", no "podés"). Trata al paciente de "usted" solo si él lo hace primero; por defecto usa un "tú" cordial. Un emoji ocasional está bien, sin abusar. Nunca inventes horarios, doctores ni datos: usa siempre las herramientas.`,
  ].join("\n");
}

// Corre un turno del agente sobre el historial + el mensaje nuevo del paciente.
// Devuelve el texto de respuesta y si se solicitó derivar a un humano.
export async function runAgent(opts: {
  clinicId: string;
  clinicName: string;
  history: AgentMessage[];
  userText: string;
  // Número de WhatsApp del paciente (identidad verificada). Se usa para
  // registrar/vincular su ficha automáticamente al agendar.
  patientPhone?: string;
  // Addon T2 (agente_ia_t2): habilita consultar/reprogramar/cancelar citas.
  // Sin T2 el agente solo agenda y deriva la gestión a un humano.
  canManage?: boolean;
  // Nombre de la ficha ya registrada con este número de WhatsApp (si existe).
  // Con ficha conocida el agente NO pide carnet; sin ella, lo exige para
  // dejar la solicitud de registro pendiente de aprobación.
  knownPatientName?: string;
}): Promise<{ reply: string; handoff: boolean }> {
  const ctx: AgentContext = { handoffRequested: false };
  const canManage = opts.canManage ?? false;
  const tools = buildAgentTools(opts.clinicId, ctx, opts.patientPhone, canManage);

  const messages: ModelMessage[] = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.userText },
  ];

  const system = systemPrompt(
    opts.clinicName,
    opts.history.length === 0,
    !opts.patientPhone,
    canManage,
    opts.knownPatientName,
  );

  const result = await generateText({
    model: agentModel(),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(6),
    temperature: 0.3,
  });

  let reply =
    result.text?.trim() ||
    "Disculpa, no te entendí bien. ¿Podrías decirme de nuevo qué necesitas?";

  // Guard: algunos modelos (Qwen vía OpenRouter) a veces FILTRAN el tool call
  // como texto plano ('function_call:{"call":"book_appointment",...}') en vez de
  // emitirlo por el canal de tools. Sin este guard, el paciente recibe JSON
  // crudo por WhatsApp y la acción NUNCA se ejecuta (cita no agendada pero el
  // paciente cree que sí). Detectamos la fuga, ejecutamos la herramienta
  // nosotros y devolvemos una respuesta natural.
  const leak = reply.match(/function_call\s*:?\s*(\{[\s\S]*\})/i);
  if (leak) {
    reply = await recoverLeakedToolCall(leak[1], tools);
  }

  // Guard "confirmó sin ejecutar NADA" (visto en real: el paciente elige la
  // hora, el modelo responde "¡tu cita quedó reprogramada!" sin llamar ninguna
  // herramienta — no hay error que atrapar porque nunca lo intentó). Si la
  // respuesta proclama una acción completada, ninguna tool de acción corrió en
  // este turno, y el mensaje del paciente pedía una acción concreta (hora, día,
  // "confirmo", "cancela"...), se reintenta UNA vez con una corrección explícita
  // que obliga a ejecutar la herramienta. El filtro por intención del paciente
  // evita falsos positivos en recaps ("gracias" → "¡de nada! tu cita quedó...").
  const claimsAction =
    /agendad[ao]|reservad[ao]|reprogramad[ao]|cancelad[ao]|cambiad[ao]|movid[ao]|queda list|está list/i;
  const actionIntent =
    /\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm|hrs?\b)|\b(hoy|mañana|manana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|reprogram|cancel|cambi|muev|mover|agend|confirmo|\bs[ií]\b|\bdale\b|de acuerdo|\bok\b/i.test(
      opts.userText,
    );
  const nothingRan = !ctx.bookingAttempted && !ctx.manageAttempted;
  if (nothingRan && actionIntent && claimsAction.test(reply)) {
    console.error("[agent] confirmó sin ejecutar herramienta; reintentando con corrección", {
      clinicId: opts.clinicId,
    });
    const retry = await generateText({
      model: agentModel(),
      system:
        system +
        `\n\nCORRECCIÓN URGENTE: estabas por confirmar una acción SIN haberla ejecutado. NADA queda guardado si no llamas la herramienta correspondiente (book_appointment, reschedule_appointment o cancel_appointment). Llama AHORA la herramienta con los datos ya acordados en la conversación y responde según su resultado: "OK:" → confirma; "ERROR:" → explica el problema sin inventar éxito.`,
      messages,
      tools,
      stopWhen: stepCountIs(6),
      temperature: 0,
    });
    reply =
      retry.text?.trim() ||
      "Disculpa, tuve un inconveniente al procesar tu solicitud. ¿Me confirmas de nuevo qué deseas hacer?";
    const retryLeak = reply.match(/function_call\s*:?\s*(\{[\s\S]*\})/i);
    if (retryLeak) {
      reply = await recoverLeakedToolCall(retryLeak[1], tools);
    }
    // Si aun con la corrección no ejecutó nada y sigue proclamando éxito, no
    // dejamos pasar la mentira: respuesta honesta pidiendo repetir el pedido.
    if (!ctx.bookingAttempted && !ctx.manageAttempted && claimsAction.test(reply)) {
      reply =
        "Una disculpa 🙏 aún no pude procesar ese cambio en el sistema. ¿Me repites qué deseas hacer (agendar, reprogramar o cancelar) con el día y la hora exactos? Lo hago de inmediato.";
    }
  }

  // Guard determinístico anti-mentira: si EN ESTE TURNO se intentó agendar
  // (book_appointment) y NO hubo éxito, pero la respuesta suena a confirmación
  // ("queda agendada", "reservada", etc.), el modelo está inventando el éxito
  // (visto en real: horario ocupado → ERROR → el LLM confirmó igual). Se
  // reemplaza por una respuesta honesta. No afecta recaps de turnos anteriores
  // porque exige que el intento fallido haya ocurrido en este mismo turno.
  if (
    ctx.bookingAttempted &&
    !ctx.bookingSucceeded &&
    /agendad[ao]|reservad[ao]|confirmad[ao]|queda lista|está lista/i.test(reply)
  ) {
    console.error("[agent] respuesta inventaba éxito con booking fallido; reemplazada", {
      clinicId: opts.clinicId,
    });
    reply =
      "Una disculpa 🙏 ese horario no se pudo reservar (es posible que se acabe de ocupar). ¿Te gustaría elegir otra hora y lo intentamos de nuevo?";
  }

  // Mismo guard pero para las acciones T2 (reprogramar/cancelar): si se intentó
  // y falló pero la respuesta suena a "listo, quedó cambiada/cancelada", se
  // reemplaza por una respuesta honesta.
  if (
    ctx.manageAttempted &&
    !ctx.manageSucceeded &&
    /reprogramad[ao]|cancelad[ao]|cambiad[ao]|movid[ao]|modificad[ao]|queda list|está list/i.test(
      reply,
    )
  ) {
    console.error("[agent] respuesta inventaba éxito con gestión fallida; reemplazada", {
      clinicId: opts.clinicId,
    });
    reply =
      "Una disculpa 🙏 no pude completar ese cambio en tu cita. ¿Me confirmas de nuevo tu nombre completo y qué deseas hacer? Si prefieres, alguien del equipo puede ayudarte directamente.";
  }

  return { reply, handoff: ctx.handoffRequested };
}

// Intenta parsear y ejecutar un tool call fugado como texto. Devuelve siempre
// un mensaje apto para el paciente (nunca JSON).
async function recoverLeakedToolCall(
  rawJson: string,
  tools: ReturnType<typeof buildAgentTools>,
): Promise<string> {
  const fallback =
    "Disculpa, tuve un inconveniente al procesar tu solicitud. ¿Me confirmas de nuevo el día y la hora que prefieres?";
  try {
    const parsed = JSON.parse(rawJson) as {
      call?: string;
      name?: string;
      arguments?: Record<string, unknown>;
      args?: Record<string, unknown>;
    };
    const name = parsed.call ?? parsed.name ?? "";
    const args = parsed.arguments ?? parsed.args ?? {};
    const tool = (tools as unknown as Record<string, { execute?: (a: unknown, o: unknown) => Promise<unknown> }>)[name];
    if (!tool?.execute) return fallback;

    const out = await tool.execute(args, { toolCallId: "leak-recovery", messages: [] });
    const outText = typeof out === "string" ? out : JSON.stringify(out);
    if (outText.startsWith("OK:")) {
      // El texto de la tool ya es legible ("cita agendada para X el D a las H").
      return `¡Listo! ${outText.slice(3).trim()} ¡Te esperamos! 😊`;
    }
    // ERROR u otra salida: no exponer detalles técnicos al paciente.
    return fallback;
  } catch {
    return fallback;
  }
}
