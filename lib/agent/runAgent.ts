import "server-only";
import { generateText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { deepseek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { BOLIVIA_TZ } from "@/lib/format";
import { buildAgentTools, type AgentContext } from "./tools";

export type AgentMessage = { role: "user" | "assistant"; content: string };

// Modelo del agente. AGENT_PROVIDER fuerza el proveedor ("groq" | "google" |
// "openrouter" | "deepseek"); sin esa variable, mantiene el comportamiento de
// siempre: OpenRouter si hay key, si no DeepSeek directo.
// "groq" usa la API gratuita de Groq Cloud (GROQ_API_KEY, sin tarjeta) — cuota
// gratis más generosa que Google/OpenRouter free, tool-calling estable en
// Llama 3.3 70B. Es OpenAI-compatible: mismo cliente que OpenRouter, solo
// cambia baseURL. Modelo vía AGENT_MODEL_GROQ.
// "google" usa la API gratuita de Google AI Studio (GOOGLE_GENERATIVE_AI_API_KEY
// o GOOGLE_API_KEY) — free tier con límite diario de solicitudes, pensado como
// alternativa sin costo a OpenRouter/DeepSeek. Modelo vía AGENT_MODEL_GOOGLE
// (variable separada de AGENT_MODEL: ese formato "vendor/modelo" es de
// OpenRouter, no de Google).
function agentModel(): LanguageModel {
  const provider = process.env.AGENT_PROVIDER;
  const groqKey = process.env.GROQ_API_KEY;
  if (provider === "groq" && groqKey) {
    const groq = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    });
    return groq(process.env.AGENT_MODEL_GROQ ?? "llama-3.3-70b-versatile");
  }
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (provider === "google" && googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return google(process.env.AGENT_MODEL_GOOGLE ?? "gemini-2.5-flash");
  }
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
  canCheckAvailability: boolean,
  knownPatientName?: string,
  clinicInfo?: string | null,
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
    canCheckAvailability
      ? `5. Usa check_availability para ver horarios libres y ofrécele opciones concretas, SIEMPRE con el FORMATO DE HORARIOS de abajo.`
      : `5. Pregúntale directamente qué día y hora prefiere (no tienes forma de consultar la agenda). Si al llamar book_appointment el horario ya está ocupado, la herramienta te lo dirá con un ERROR: discúlpate y pídele otro horario.`,
    `6. Confirma con el paciente el nombre, el motivo, la fecha y la hora ANTES de agendar.`,
    `7. Recién entonces llama book_appointment.`,
    ``,
    canCheckAvailability
      ? `DOCTOR ESPECÍFICO: NO ofrezcas ni preguntes por doctores. Si el paciente nombra a un doctor con el que quiere atenderse, tu PRIMER paso OBLIGATORIO es llamar a get_doctors y comparar. Si el nombre aparece en la lista (aunque difiera en "Dr./Dra." o tildes), agenda con él: pásalo como doctor_name en check_availability y en book_appointment, y confírmale la cita con ese doctor. PROHIBIDO decir que un doctor no existe o que no puedes agendar con él sin haber llamado a get_doctors en ese mismo turno. Solo si get_doctors NO lo contiene, dile que no lo encontraste y pídele que confirme o corrija el nombre. REGLA DE PRIVACIDAD: NUNCA muestres, enumeres ni sugieras nombres de doctores al paciente — ni siquiera si te los pide ("¿qué doctores atienden?"). En ese caso responde que si tiene un doctor de preferencia puede indicarlo, y si no, la clínica le asignará al profesional adecuado. get_doctors es SOLO para verificar internamente un nombre que el paciente ya dio.`
      : `DOCTOR ESPECÍFICO: NO ofrezcas ni preguntes por doctores. Si el paciente nombra a un doctor con el que quiere atenderse, tu PRIMER paso OBLIGATORIO es llamar a get_doctors y comparar. Si el nombre aparece en la lista (aunque difiera en "Dr./Dra." o tildes), agenda con él: pásalo como doctor_name en book_appointment y confírmale la cita con ese doctor. PROHIBIDO decir que un doctor no existe o que no puedes agendar con él sin haber llamado a get_doctors en ese mismo turno. Solo si get_doctors NO lo contiene, dile que no lo encontraste y pídele que confirme o corrija el nombre. REGLA DE PRIVACIDAD: NUNCA muestres, enumeres ni sugieras nombres de doctores al paciente — ni siquiera si te los pide ("¿qué doctores atienden?"). En ese caso responde que si tiene un doctor de preferencia puede indicarlo, y si no, la clínica le asignará al profesional adecuado. get_doctors es SOLO para verificar internamente un nombre que el paciente ya dio.`,
    ``,
    ...(canCheckAvailability
      ? [
          `FORMATO DE HORARIOS (obligatorio al mostrar disponibilidad): presenta las horas libres de check_availability como una lista clara, NUNCA en prosa corrida. Usa este formato exacto de WhatsApp (negritas con un solo asterisco *así*, viñetas con •):`,
          `🦷 *Horarios libres — <día y fecha en español, ej. jueves 10 jul>*`,
          ``,
          `*Mañana*`,
          `  • 09:00`,
          `  • 10:30`,
          ``,
          `*Tarde*`,
          `  • 15:00`,
          `  • 16:30`,
          ``,
          `Respóndeme con la hora que prefieras 😊`,
          `REGLAS DEL FORMATO: separa las horas en *Mañana* (antes de 12:00) y *Tarde* (12:00 o más); omite un grupo si no tiene horas. Muestra como máximo 8 horas; si check_availability devolvió más, muestra las primeras y agrega "…y más horarios, dime tu preferencia y te confirmo". Escribe la fecha en español legible (usa la TABLA DE FECHAS), nunca en formato 2026-07-10. Cierra siempre invitando a elegir. Si ese día no hay ningún hueco, díselo y ofrece el siguiente día con disponibilidad. Este formato de varias líneas es una EXCEPCIÓN a la regla de "mensajes de 1-3 frases": para listar horarios sí puedes usar varias líneas.`,
          ``,
        ]
      : []),
    ...(canManage
      ? [
          ``,
          `GESTIÓN DE CITAS EXISTENTES (consultar / reprogramar / cancelar):`,
          `- Si el paciente pregunta cuándo es su cita o si tiene una, usa get_my_appointments y dile fecha, hora y doctor.`,
          canCheckAvailability
            ? `- Para REPROGRAMAR: primero consulta su cita con get_my_appointments, verifica el nuevo horario con check_availability, confirma el cambio con el paciente ("¿te muevo tu cita del X a las Y al Z a las W?") y recién entonces llama reschedule_appointment.`
            : `- Para REPROGRAMAR: primero consulta su cita con get_my_appointments, confirma el nuevo día y hora con el paciente ("¿te muevo tu cita del X a las Y al Z a las W?") y recién entonces llama reschedule_appointment; si la herramienta responde ERROR porque el horario está ocupado, pide otro horario.`,
          `- LÍMITE IMPORTANTE: reschedule_appointment SOLO cambia la fecha y la hora, NUNCA el doctor. Si el paciente quiere cambiar de doctor (ej. "quiero mi cita pero con el Dr. X"), NO uses reschedule_appointment: cancela la cita actual con cancel_appointment (confirmándolo antes) y agenda una nueva con book_appointment pasando doctor_name (verifica el nombre con get_doctors). Jamás digas que cambiaste el doctor si solo reprogramaste.`,
          `- Para CANCELAR: consulta su cita, pregunta EXPLÍCITAMENTE "¿confirmas que deseas cancelar tu cita del X a las Y?" y solo con su sí llama cancel_appointment. Ofrécele reagendar en otro horario antes de despedirte.`,
        ]
      : []),
    ``,
    `REGLA CRÍTICA: solo confirma una acción (agendar, reprogramar, cancelar) si la herramienta responde con "OK:". Si responde con "ERROR:", NO inventes una confirmación: explica el problema y ofrece otra opción o deriva a un humano.`,
    ``,
    `REGLA CRÍTICA 2: NADA queda guardado si no llamas la herramienta. Cuando el paciente elige o confirma un horario, DEBES llamar la herramienta correspondiente (book_appointment / reschedule_appointment / cancel_appointment) EN ESE MISMO turno, ANTES de responder. PROHIBIDO anunciar "tu cita quedó agendada/reprogramada/cancelada" sin haber recibido "OK:" de la herramienta en este turno. Mostrar horarios disponibles NO agenda ni cambia nada.`,
    ``,
    ...(clinicInfo
      ? [
          `INFORMACIÓN OFICIAL DE LA CLÍNICA (fuente de verdad para tratamientos, precios, horarios, promociones y preguntas frecuentes — redactada y aprobada por la clínica):`,
          clinicInfo,
          ``,
          `REGLAS DE LA INFORMACIÓN OFICIAL: cuando el paciente pregunte por tratamientos, precios, horarios de atención, dirección, formas de pago o promociones, responde SOLO con lo que dice la INFORMACIÓN OFICIAL de arriba, con naturalidad y en tono de WhatsApp. PROHIBIDO inventar, estimar o redondear precios y datos que no estén escritos ahí. Si la pregunta NO está cubierta por la información oficial (o pide más detalle del que hay), NO improvises: deriva con handoff_to_human. Los precios son referenciales: si el paciente quiere una cotización exacta para su caso, aclara que el doctor confirmará el precio en su evaluación. Aprovecha estas respuestas para invitar a agendar una cita cuando sea natural.`,
        ]
      : []),
    ``,
    canManage
      ? clinicInfo
        ? `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, pregunte algo NO cubierto por la INFORMACIÓN OFICIAL, tenga un reclamo, haga una consulta médica, o pida algo que no puedas resolver con tus herramientas. No inventes respuestas sobre esos temas.`
        : `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, pregunte por precios, tenga un reclamo, haga una consulta médica, o pida algo que no puedas resolver con tus herramientas. No inventes respuestas sobre esos temas.`
      : clinicInfo
        ? `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, quiera reprogramar o cancelar una cita, pregunte algo NO cubierto por la INFORMACIÓN OFICIAL, tenga un reclamo, haga una consulta médica, o pida algo que no sea agendar una cita nueva. No inventes respuestas sobre esos temas.`
        : `DERIVA A UN HUMANO (handoff_to_human) cuando el paciente: pida hablar con una persona, quiera reprogramar o cancelar una cita, pregunte por precios, tenga un reclamo, haga una consulta médica, o pida algo que no sea agendar una cita nueva. No inventes respuestas sobre esos temas.`,
    ``,
    canCheckAvailability
      ? `ESTILO: profesional pero cercano, mensajes breves y naturales para WhatsApp (1-3 frases, salvo al listar horarios con el FORMATO DE HORARIOS, que sí usa varias líneas). Español neutro, sin voseo ("puedes", no "podés"). Trata al paciente de "usted" solo si él lo hace primero; por defecto usa un "tú" cordial. Un emoji ocasional está bien, sin abusar. Nunca inventes horarios, doctores ni datos: usa siempre las herramientas.`
      : `ESTILO: profesional pero cercano, mensajes breves y naturales para WhatsApp (1-3 frases). Español neutro, sin voseo ("puedes", no "podés"). Trata al paciente de "usted" solo si él lo hace primero; por defecto usa un "tú" cordial. Un emoji ocasional está bien, sin abusar. Nunca inventes horarios, doctores ni datos: usa siempre las herramientas.`,
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
  // Addon T3 (agente_ia_t3): habilita check_availability (consulta real de la
  // agenda) al agendar Y al reprogramar. Sin T3 el agente agenda/reprograma
  // "a ciegas" con la hora que pida el paciente y solo avisa si choca.
  canCheckAvailability?: boolean;
  // Nombre de la ficha ya registrada con este número de WhatsApp (si existe).
  // Con ficha conocida el agente NO pide carnet; sin ella, lo exige para
  // dejar la solicitud de registro pendiente de aprobación.
  knownPatientName?: string;
  // Addon "agente_ia_info": bloque de información oficial de la clínica
  // (tratamientos, precios, horarios, FAQ) ya compilado (getClinicAgentInfo).
  // Con esto el agente responde esas preguntas en vez de derivarlas; sin él,
  // comportamiento de siempre (precios → humano).
  clinicInfo?: string | null;
}): Promise<{ reply: string; handoff: boolean }> {
  const ctx: AgentContext = { handoffRequested: false };
  const canManage = opts.canManage ?? false;
  const canCheckAvailability = opts.canCheckAvailability ?? false;
  const tools = buildAgentTools(
    opts.clinicId,
    ctx,
    opts.patientPhone,
    canManage,
    canCheckAvailability,
  );

  const messages: ModelMessage[] = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: opts.userText },
  ];

  const system = systemPrompt(
    opts.clinicName,
    opts.history.length === 0,
    !opts.patientPhone,
    canManage,
    canCheckAvailability,
    opts.knownPatientName,
    opts.clinicInfo,
  );

  const runModel = () =>
    generateText({
      model: agentModel(),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(6),
      temperature: 0.3,
      // El free tier de Google limita por MINUTO (429) y a veces devuelve 503
      // "high demand". El default (2 reintentos con backoff corto) se agota antes
      // de que la ventana del minuto se libere → la respuesta se perdía. Con más
      // reintentos el backoff exponencial cruza el minuto y el turno sobrevive.
      maxRetries: 5,
    });

  let result: Awaited<ReturnType<typeof runModel>>;
  try {
    result = await runModel();
  } catch (err) {
    // Groq devuelve 400 "Failed to call a function" cuando el modelo genera un
    // tool call malformado (visto con llama-4-scout). Es estocástico: un solo
    // reintento suele bastar. El maxRetries del SDK no ayuda porque 400 no es
    // reintentable para él. Sin esto el bot quedaba MUDO ante el paciente.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Failed to call a function")) throw err;
    console.error("[agent] tool call malformado del modelo; reintentando una vez");
    result = await runModel();
  }

  // Traza de herramientas: sin esto es imposible distinguir si el modelo llamó
  // a book_appointment o inventó la confirmación (visto con modelos gratuitos).
  for (const step of result.steps) {
    for (const tc of step.toolCalls) {
      if (tc) console.log(`[agent] tool ${tc.toolName}(${JSON.stringify(tc.input)})`);
    }
    for (const tr of step.toolResults) {
      if (!tr) continue;
      const out = typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output);
      console.log(`[agent] -> ${tr.toolName}: ${out?.slice(0, 300)}`);
    }
  }

  let reply =
    result.text?.trim() ||
    "Disculpa, no te entendí bien. ¿Podrías decirme de nuevo qué necesitas?";

  // Guard: algunos modelos (Qwen, Nemotron vía OpenRouter) a veces FILTRAN el
  // tool call como texto plano en vez de emitirlo por el canal de tools:
  //   - 'function_call:{"call":"book_appointment",...}' (Qwen)
  //   - '{"get_doctors": {}}' — la respuesta ENTERA es JSON (Nemotron)
  // Sin este guard, el paciente recibe JSON crudo por WhatsApp y la acción
  // NUNCA se ejecuta. Detectamos la fuga, ejecutamos la herramienta nosotros
  // y devolvemos una respuesta natural.
  const leaked = detectLeakedToolCall(reply, tools);
  if (leaked) {
    console.error("[agent] tool call fugado como texto; recuperando", {
      clinicId: opts.clinicId,
      tool: leaked.name,
    });
    reply = await recoverLeakedToolCall(leaked, tools, system, messages);
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
    const retryLeak = detectLeakedToolCall(reply, tools);
    if (retryLeak) {
      reply = await recoverLeakedToolCall(retryLeak, tools, system, messages);
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

  // Normalizar negritas de Markdown (**texto**) al formato de WhatsApp
  // (*texto*): varios modelos (Nemotron, Gemini) escriben Markdown estándar y
  // WhatsApp muestra los asteriscos dobles literales.
  reply = reply.replace(/\*\*(.+?)\*\*/g, "*$1*");

  return { reply, handoff: ctx.handoffRequested };
}

type LeakedCall = { name: string; args: Record<string, unknown> };

// Detecta un tool call fugado como texto en la respuesta del modelo. Cubre los
// dos formatos vistos en real con modelos de OpenRouter:
//   1. Qwen:     'function_call:{"call":"book_appointment","arguments":{...}}'
//   2. Nemotron: la respuesta ENTERA es '{"get_doctors": {}}' (a veces con
//      fences ```json ... ```) — un objeto cuyo único key es el nombre de la tool.
function detectLeakedToolCall(
  reply: string,
  tools: ReturnType<typeof buildAgentTools>,
): LeakedCall | null {
  const toolNames = new Set(Object.keys(tools));

  const qwen = reply.match(/function_call\s*:?\s*(\{[\s\S]*\})/i);
  if (qwen) {
    try {
      const parsed = JSON.parse(qwen[1]) as {
        call?: string;
        name?: string;
        arguments?: Record<string, unknown>;
        args?: Record<string, unknown>;
      };
      const name = parsed.call ?? parsed.name ?? "";
      if (toolNames.has(name)) {
        return { name, args: parsed.arguments ?? parsed.args ?? {} };
      }
    } catch {
      // sigue con el otro formato
    }
  }

  // Respuesta que ES un JSON (con o sin fences de markdown).
  const bare = reply.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (bare.startsWith("{") && bare.endsWith("}")) {
    try {
      const parsed = JSON.parse(bare) as Record<string, unknown>;
      const keys = Object.keys(parsed);
      if (keys.length === 1 && toolNames.has(keys[0])) {
        const args = parsed[keys[0]];
        return {
          name: keys[0],
          args: typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {},
        };
      }
      // Variante {"name":"tool","arguments":{...}} sin el prefijo function_call.
      const name = (parsed.name ?? parsed.call) as string | undefined;
      if (name && toolNames.has(name)) {
        const args = parsed.arguments ?? parsed.args ?? {};
        return {
          name,
          args: typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {},
        };
      }
    } catch {
      // no era JSON válido: no es fuga
    }
  }
  return null;
}

// Ejecuta el tool call fugado y produce un mensaje apto para el paciente
// (nunca JSON). Para tools de acción el propio resultado ("OK: cita agendada
// para...") ya es legible; para tools de lectura (get_doctors, availability),
// se corre el modelo UNA vez más con el resultado inyectado para que redacte
// la respuesta natural.
async function recoverLeakedToolCall(
  leaked: LeakedCall,
  tools: ReturnType<typeof buildAgentTools>,
  system: string,
  messages: ModelMessage[],
): Promise<string> {
  const fallback =
    "Disculpa, tuve un inconveniente al procesar tu solicitud. ¿Me confirmas de nuevo el día y la hora que prefieres?";
  try {
    const tool = (
      tools as unknown as Record<string, { execute?: (a: unknown, o: unknown) => Promise<unknown> }>
    )[leaked.name];
    if (!tool?.execute) return fallback;

    const out = await tool.execute(leaked.args, {
      toolCallId: "leak-recovery",
      messages: [],
    });
    const outText = typeof out === "string" ? out : JSON.stringify(out);
    if (outText.startsWith("OK:")) {
      // El texto de la tool ya es legible ("cita agendada para X el D a las H").
      return `¡Listo! ${outText.slice(3).trim()} ¡Te esperamos! 😊`;
    }
    if (outText.startsWith("ERROR:")) {
      // No exponer detalles técnicos al paciente.
      return fallback;
    }
    // Resultado de datos (lista de doctores, horarios...): que el modelo
    // redacte la respuesta natural con esa información, SIN tools para que no
    // vuelva a fugar.
    const followup = await generateText({
      model: agentModel(),
      system:
        system +
        `\n\nRESULTADO DE HERRAMIENTA (${leaked.name}): ${outText}\nResponde ahora al paciente de forma natural usando SOLO esta información. NO escribas JSON.`,
      messages,
      temperature: 0.3,
      maxRetries: 3,
    });
    const text = followup.text?.trim();
    return text && !text.trim().startsWith("{") ? text : fallback;
  } catch {
    return fallback;
  }
}
