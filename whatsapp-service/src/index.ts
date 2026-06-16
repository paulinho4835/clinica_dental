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

async function sendMessage(clinicId: string, phone: string, message: string) {
  const s = getSession(clinicId);
  if (!s.sock || !s.isConnected) throw new Error("WhatsApp no conectado");
  await s.sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
}

async function connect(clinicId: string): Promise<void> {
  const s = getSession(clinicId);
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
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.log(
            `[${clinicId}] Sesión cerrada. Elimina auth_info/${clinicId}/ y reconecta.`
          );
          sessions.delete(clinicId);
          return;
        }
        console.log(`[${clinicId}] Conexión perdida, reconectando...`);
        connect(clinicId);
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

// ── HTTP server ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? process.env.WA_PORT ?? 3001);

function parseClinicId(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length).split("?")[0];
  return id || null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
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
