import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createServer, IncomingMessage, ServerResponse } from "http";
import cron from "node-cron";
import QRCode from "qrcode";
import pino from "pino";
import "dotenv/config";
import { processReminders } from "./reminders.js";

// Red de seguridad del proceso: Baileys lanza promesas sin capturar (ej.
// "Timed Out" de sendPassiveIq durante una reconexión) que con Node moderno
// MATAN el proceso entero — y con él todas las sesiones de todas las clínicas.
// Visto en real: el servicio moría en silencio y el agente dejaba de responder.
// Se registra y se sigue; la reconexión de connection.update se encarga del resto.
process.on("unhandledRejection", (err) => {
  console.error("[proceso] unhandledRejection (ignorada para no morir):", err);
});
process.on("uncaughtException", (err) => {
  console.error("[proceso] uncaughtException (ignorada para no morir):", err);
});

// ── Multi-session state ────────────────────────────────────────────────────
type SessionState = {
  sock: ReturnType<typeof makeWASocket> | null;
  isConnected: boolean;
  lastQR: string | null;
};

const sessions = new Map<string, SessionState>();

function getSession(clinicId: string): SessionState {
  if (!sessions.has(clinicId)) {
    sessions.set(clinicId, { sock: null, isConnected: false, lastQR: null });
  }
  return sessions.get(clinicId)!;
}

const randomBetween = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));

// Simula el ritmo de un humano leyendo y tecleando: primero una pausa (como
// si leyera el mensaje), luego el indicador "escribiendo...", y recién
// entonces el mensaje. Un bot que contesta instantáneo y sin "escribiendo" es
// una señal de comportamiento no humano que los sistemas antispam de Meta sí
// evalúan; esto no elimina el riesgo de usar un cliente no oficial (Baileys),
// pero reduce esa señal puntual y de paso mejora la experiencia del paciente.
// Espera (hasta maxMs) a que la sesión esté conectada. La conexión de Baileys
// se cae y reconecta sola con frecuencia; con la simulación de tipeo (varios
// segundos entre generar la respuesta y enviarla) es común que el envío caiga
// justo en una ventana de reconexión — sin esta espera, la respuesta se perdía.
async function waitForConnection(s: SessionState, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (s.sock && s.isConnected) return true;
    await sleep(300);
  }
  return Boolean(s.sock && s.isConnected);
}

async function sendMessage(clinicId: string, to: string, message: string) {
  const s = getSession(clinicId);
  if (!(await waitForConnection(s, 15000))) throw new Error("WhatsApp no conectado");
  // `to` puede ser un número pelado (recordatorios/bulk) o un JID completo
  // (respuestas del agente). Hay que contestar al MISMO remoteJid del mensaje
  // entrante: WhatsApp ahora usa identificadores @lid (privacidad) que NO se
  // enrutan como @s.whatsapp.net; reconstruir el JID a mano hacía que la
  // respuesta se enviara a un destino inexistente y nunca llegara.
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

  await sleep(randomBetween(400, 1400));
  try {
    await s.sock!.sendPresenceUpdate("composing", jid);
  } catch {
    // Si falla el presence update no bloqueamos el envío del mensaje.
  }
  const typingMs = Math.min(6000, Math.max(1000, message.length * 35));
  await sleep(randomBetween(typingMs * 0.7, typingMs));
  try {
    await s.sock!.sendPresenceUpdate("paused", jid);
  } catch {
    // idem
  }

  // La conexión pudo caerse DURANTE la simulación de tipeo: volver a esperarla
  // y reintentar una vez. OJO: tras reconectar, s.sock es un socket NUEVO —
  // siempre releer s.sock, nunca capturar la referencia vieja.
  try {
    if (!(await waitForConnection(s, 15000))) throw new Error("WhatsApp no conectado");
    const sent = await s.sock!.sendMessage(jid, { text: message });
    console.log(`[${clinicId}] ⇨ enviado a ${jid} (msgId: ${sent?.key?.id ?? "?"})`);
  } catch (e) {
    console.error(`[${clinicId}] envío falló, reintentando en 3s:`, e);
    await sleep(3000);
    if (!(await waitForConnection(s, 15000))) throw new Error("WhatsApp no conectado");
    const sent = await s.sock!.sendMessage(jid, { text: message });
    console.log(`[${clinicId}] ⇨ enviado a ${jid} en reintento (msgId: ${sent?.key?.id ?? "?"})`);
  }
}

async function connect(clinicId: string): Promise<void> {
  const s = getSession(clinicId);
  // Guard: si ya hay un socket en curso (conectando o conectado) para esta
  // clínica, no crear otro. Sin esto, el polling del frontend a /connect o
  // /qr disparaba múltiples sockets simultáneos para el mismo número, y
  // WhatsApp cerraba la sesión por comportamiento anómalo (bucle de logout).
  if (s.sock) return;
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(
    `auth_info/${clinicId}`
  );

  s.sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  s.sock.ev.on("creds.update", saveCreds);

  // ── Agente de IA: reenvía cada mensaje entrante al webhook del app y responde
  // con el texto que devuelva. El app decide si contesta (addon encendido y
  // conversación no pausada); si devuelve reply vacío, no se envía nada.
  s.sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      // Ignorar salientes (incluye respuestas manuales del equipo) y grupos.
      if (m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? "";
      if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
      const text =
        m.message?.conversation ??
        m.message?.extendedTextMessage?.text ??
        "";
      if (!text.trim()) continue;
      // Número real del remitente. En chats @lid (privacidad) el remoteJid trae
      // un identificador ficticio que NO sirve para llamar/wa.me; Baileys expone
      // el número verdadero en key.senderPn ("591...@s.whatsapp.net"). Si existe,
      // usamos ese; el JID original se conserva solo para responder al chat.
      const senderPn = (m.key as { senderPn?: string }).senderPn ?? "";
      const isLid = jid.endsWith("@lid");
      const realPhone = isLid ? senderPn.split("@")[0] : jid.split("@")[0];
      const phone = realPhone || jid.split("@")[0];
      // phoneVerified: false solo si es @lid y no vino senderPn (número oculto
      // irrecuperable) → el agente le pedirá su celular al paciente.
      // Destino de la respuesta: si el chat vino por @lid pero conocemos el
      // número real (senderPn), responder al JID del teléfono. Enviar al @lid
      // con una sesión recién vinculada es un agujero negro: el servidor acepta
      // el mensaje (devuelve msgId) pero nunca lo entrega. El JID por número
      // siempre enruta y WhatsApp lo unifica en el mismo chat del paciente.
      const replyJid = isLid && senderPn ? senderPn : jid;
      console.log(`[${clinicId}] ⇦ mensaje entrante de ${jid} (tel: ${phone || "?"}, respondiendo a ${replyJid})`);
      await handleIncomingMessage(clinicId, replyJid, phone, text.trim(), Boolean(realPhone));
    }
  });

  s.sock.ev.on(
    "connection.update",
    async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        s.lastQR = qr;
        console.log(`[${clinicId}] QR disponible en /qr/${clinicId}`);
      }

      if (connection === "open") {
        s.isConnected = true;
        s.lastQR = null;
        console.log(`[${clinicId}] ✅ WhatsApp conectado.`);
      }

      if (connection === "close") {
        s.isConnected = false;
        s.sock = null;
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.log(
            `[${clinicId}] Sesión cerrada. Elimina auth_info/${clinicId}/ y reconecta.`
          );
          sessions.delete(clinicId);
          return;
        }
        console.log(`[${clinicId}] Conexión perdida, reconectando...`);
        // Pausa breve antes de reconectar: reconectar en caliente sin espera
        // producía un bucle de caídas (aleteo) y timeouts internos de Baileys.
        setTimeout(() => {
          connect(clinicId).catch((e) =>
            console.error(`[${clinicId}] reconexión falló:`, e),
          );
        }, 2000);
      }
    }
  );
}

async function disconnect(clinicId: string) {
  const s = sessions.get(clinicId);
  if (!s) return;
  await s.sock?.logout().catch(() => {});
  s.sock = null;
  s.isConnected = false;
  s.lastQR = null;
  sessions.delete(clinicId);
  console.log(`[${clinicId}] Desconectado.`);
}

// ── Cron: 09:00 Bolivia todos los días, procesa TODAS las clínicas activas ─
cron.schedule(
  "0 9 * * *",
  async () => {
    const ts = new Date().toLocaleString("es-BO", {
      timeZone: "America/La_Paz",
    });
    console.log(`[${ts}] Cron: procesando recordatorios para todas las clínicas...`);
    for (const [clinicId, s] of sessions.entries()) {
      if (!s.isConnected) {
        console.log(`[${clinicId}] Omitido (no conectado).`);
        continue;
      }
      await processReminders(
        (phone, msg) => sendMessage(clinicId, phone, msg),
        clinicId
      );
    }
  },
  { timezone: "America/La_Paz" }
);

// ── Helpers ────────────────────────────────────────────────────────────────
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Agente de IA ────────────────────────────────────────────────────────────
// URL del app Next.js (donde vive el webhook del agente) y secreto compartido.
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const AGENT_SECRET = process.env.AGENT_WEBHOOK_SECRET ?? "";

// Reenvía un mensaje entrante al webhook del agente y, si devuelve respuesta, la
// manda de vuelta al paciente. Cualquier error se registra sin romper el socket.
// La llamada al webhook se reintenta hasta 3 veces con espera: el app (Next.js
// dev o Vercel) puede reiniciarse o cortar la conexión a mitad de una llamada
// larga (ECONNRESET / HeadersTimeout) — sin reintento el mensaje del paciente
// se perdía en silencio.
async function handleIncomingMessage(
  clinicId: string,
  jid: string,
  phone: string,
  text: string,
  phoneVerified: boolean,
) {
  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch(`${APP_URL}/api/whatsapp/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(AGENT_SECRET ? { "x-agent-secret": AGENT_SECRET } : {}),
        },
        body: JSON.stringify({ clinicId, from: phone, text, phoneVerified }),
      });
      if (!res.ok) {
        console.error(`[${clinicId}] agente respondió HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { reply?: string | null };
      if (body.reply && body.reply.trim()) {
        console.log(`[${clinicId}] agente respondió (${body.reply.trim().length} chars), enviando a ${jid}...`);
        // Responder al JID original (soporta @lid), no al número reconstruido.
        await sendMessage(clinicId, jid, body.reply.trim());
      } else {
        console.log(`[${clinicId}] agente devolvió reply null/vacío — no se envía nada`);
      }
      return;
    } catch (e) {
      console.error(
        `[${clinicId}] error llamando al agente (intento ${attempt}/${MAX_TRIES}):`,
        e,
      );
      if (attempt < MAX_TRIES) await sleep(10000);
    }
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? process.env.WA_PORT ?? 3001);

// Secreto compartido que autentica las llamadas del dashboard (Vercel) a este
// servicio. Retrocompatible: si no está definido, no se exige (dev local).
// Mismo patrón que AGENT_SECRET pero en la dirección opuesta.
const WA_SERVICE_SECRET = process.env.WA_SERVICE_SECRET ?? "";

function parseClinicId(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length).split("?")[0];
  return id || null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-wa-service-secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Autenticación: si hay secreto configurado, exigir el header en todas las
  // rutas. El preflight OPTIONS ya salió arriba, así que no se bloquea el CORS.
  if (WA_SERVICE_SECRET && req.headers["x-wa-service-secret"] !== WA_SERVICE_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No autorizado" }));
    return;
  }

  const url = req.url ?? "/";

  // GET /status/:clinicId
  if (req.method === "GET" && url.startsWith("/status/")) {
    const clinicId = parseClinicId(url, "/status/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    const s = sessions.get(clinicId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      connected: s?.isConnected ?? false,
      hasQR: !!(s?.lastQR),
    }));
    return;
  }

  // POST /connect/:clinicId
  if (req.method === "POST" && url.startsWith("/connect/")) {
    const clinicId = parseClinicId(url, "/connect/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    const s = getSession(clinicId);
    if (s.isConnected) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "already_connected" }));
      return;
    }
    await connect(clinicId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "connecting" }));
    return;
  }

  // DELETE /disconnect/:clinicId
  if (req.method === "DELETE" && url.startsWith("/disconnect/")) {
    const clinicId = parseClinicId(url, "/disconnect/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    await disconnect(clinicId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /qr/:clinicId — página HTML con QR
  if (req.method === "GET" && url.startsWith("/qr/")) {
    const clinicId = parseClinicId(url, "/qr/");
    if (!clinicId) { res.writeHead(400); res.end("clinicId requerido"); return; }
    const s = getSession(clinicId);
    if (s.isConnected) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:2rem">
        <h2>✅ WhatsApp ya está conectado (clínica ${clinicId})</h2>
      </body></html>`);
      return;
    }
    if (!s.lastQR) {
      // Inicia la conexión automáticamente si no hay sesión aún
      if (!s.sock) connect(clinicId);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"></head>
        <body style="font-family:sans-serif;text-align:center;padding:2rem">
        <h2>⏳ Generando QR para clínica ${clinicId}...</h2>
        <p>Esta página se recarga automáticamente.</p>
      </body></html>`);
      return;
    }
    const qrDataURL = await QRCode.toDataURL(s.lastQR, { width: 300, margin: 2 });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="30"></head>
      <body style="font-family:sans-serif;text-align:center;padding:2rem">
      <h2>📱 Escanea con WhatsApp</h2>
      <p style="color:#666">Clínica: <strong>${clinicId}</strong></p>
      <p>Ajustes → Dispositivos vinculados → Vincular dispositivo</p>
      <img src="${qrDataURL}" style="margin:1rem auto;display:block" />
      <p style="color:#888;font-size:0.85rem">Se recarga cada 30 segundos. El QR expira en ~60s.</p>
    </body></html>`);
    return;
  }

  // GET /qr-data/:clinicId — QR como JSON (para la UI embebida)
  if (req.method === "GET" && url.startsWith("/qr-data/")) {
    const clinicId = parseClinicId(url, "/qr-data/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    const s = getSession(clinicId);
    if (!s.lastQR) {
      if (!s.sock) connect(clinicId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ connected: s.isConnected, qr: null }));
      return;
    }
    const qrDataURL = await QRCode.toDataURL(s.lastQR, { width: 256, margin: 2 });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: false, qr: qrDataURL }));
    return;
  }

  // POST /send-bulk/:clinicId — envío masivo con delay entre mensajes
  if (req.method === "POST" && url.startsWith("/send-bulk/")) {
    const clinicId = parseClinicId(url, "/send-bulk/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    const s = sessions.get(clinicId);
    if (!s?.isConnected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WhatsApp no conectado para esta clínica." }));
      return;
    }
    const body = await parseBody(req);
    const messages = (body.messages ?? []) as Array<{ phone: string; text: string }>;
    const delayMs = Math.max(2000, Number(body.delayMs ?? 5000));

    let sent = 0;
    let failed = 0;
    const errors: Array<{ phone: string; error: string }> = [];

    for (let i = 0; i < messages.length; i++) {
      const { phone, text } = messages[i];
      try {
        await sendMessage(clinicId, phone, text);
        sent++;
        console.log(`[${clinicId}] Bulk ${i + 1}/${messages.length} enviado a ${phone}`);
      } catch (e) {
        failed++;
        errors.push({ phone, error: String(e) });
        console.error(`[${clinicId}] Bulk error ${phone}:`, e);
      }
      // Delay con jitter (±1s) entre mensajes, excepto el último
      if (i < messages.length - 1) {
        const jitter = Math.floor(Math.random() * 2000) - 1000;
        await sleep(delayMs + jitter);
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sent, failed, total: messages.length, errors }));
    return;
  }

  // POST /send-reminders/:clinicId
  if (req.method === "POST" && url.startsWith("/send-reminders/")) {
    const clinicId = parseClinicId(url, "/send-reminders/");
    if (!clinicId) { res.writeHead(400); res.end(JSON.stringify({ error: "clinicId requerido" })); return; }
    const s = sessions.get(clinicId);
    if (!s?.isConnected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WhatsApp no conectado para esta clínica." }));
      return;
    }
    try {
      await processReminders(
        (phone, msg) => sendMessage(clinicId, phone, msg),
        clinicId
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
}

createServer(handleRequest).listen(PORT, () =>
  console.log(`🌐 WhatsApp multi-clínica en http://localhost:${PORT}`)
);

console.log("Iniciando servicio WhatsApp multi-clínica...");
