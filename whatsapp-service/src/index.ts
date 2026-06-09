import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createServer, IncomingMessage, ServerResponse } from "http";
import cron from "node-cron";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import pino from "pino";
import "dotenv/config";
import { processReminders } from "./reminders.js";

const sendNow = process.argv.includes("--now");
let sock: ReturnType<typeof makeWASocket> | null = null;
let isConnected = false;
let lastQR: string | null = null;

async function sendMessage(phone: string, message: string) {
  if (!sock || !isConnected) throw new Error("WhatsApp no conectado");
  await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
}

async function connect(): Promise<void> {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQR = qr;
      console.log("\n📱 QR disponible en /qr o escanea aquí:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isConnected = true;
      lastQR = null;
      console.log("✅ WhatsApp conectado.\n");

      if (sendNow) {
        console.log("Modo --now: enviando recordatorios inmediatamente...");
        await processReminders(sendMessage);
        process.exit(0);
      }
    }

    if (connection === "close") {
      isConnected = false;
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log("Sesión cerrada. Elimina la carpeta auth_info/ y reinicia.");
        process.exit(1);
      }
      console.log("Conexión perdida, reconectando...");
      connect();
    }
  });
}

// Cron: 09:00 Bolivia todos los días
cron.schedule(
  "0 9 * * *",
  async () => {
    console.log(`[${new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" })}] Ejecutando cron...`);
    await processReminders(sendMessage);
  },
  { timezone: "America/La_Paz" }
);

// HTTP server
const PORT = Number(process.env.PORT ?? process.env.WA_PORT ?? 3001);

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /qr — página HTML con el QR para escanear desde el navegador
  if (req.method === "GET" && req.url === "/qr") {
    if (isConnected) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:2rem">
        <h2>✅ WhatsApp ya está conectado</h2>
        <p>No necesitás escanear nada.</p>
      </body></html>`);
      return;
    }
    if (!lastQR) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"></head>
        <body style="font-family:sans-serif;text-align:center;padding:2rem">
        <h2>⏳ Generando QR...</h2>
        <p>Esta página se recarga automáticamente.</p>
      </body></html>`);
      return;
    }
    const qrDataURL = await QRCode.toDataURL(lastQR, { width: 300, margin: 2 });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="30"></head>
      <body style="font-family:sans-serif;text-align:center;padding:2rem">
      <h2>📱 Escaneá con WhatsApp</h2>
      <p>Ajustes → Dispositivos vinculados → Vincular dispositivo</p>
      <img src="${qrDataURL}" style="margin:1rem auto;display:block" />
      <p style="color:#888;font-size:0.85rem">Se recarga cada 30 segundos. El QR expira en ~60s.</p>
    </body></html>`);
    return;
  }

  // POST /send-reminders
  if (req.method === "POST" && req.url === "/send-reminders") {
    if (!isConnected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WhatsApp no conectado. Visitá /qr para vincular." }));
      return;
    }
    try {
      await processReminders(sendMessage);
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
  console.log(`🌐 API en http://localhost:${PORT} | QR en http://localhost:${PORT}/qr`)
);

console.log("Iniciando servicio WhatsApp...");
connect();
