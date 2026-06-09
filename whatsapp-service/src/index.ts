import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createServer } from "http";
import cron from "node-cron";
import qrcode from "qrcode-terminal";
import pino from "pino";
import "dotenv/config";
import { processReminders } from "./reminders.js";

const sendNow = process.argv.includes("--now");
let sock: ReturnType<typeof makeWASocket> | null = null;
let isConnected = false;

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
      console.log("\n📱 Escanea este QR con WhatsApp (Ajustes → Dispositivos vinculados):\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isConnected = true;
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

// HTTP API para disparar recordatorios desde la agenda
const PORT = Number(process.env.WA_PORT ?? 3001);
createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method === "POST" && req.url === "/send-reminders") {
    if (!isConnected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WhatsApp no conectado" }));
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
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`🌐 API en http://localhost:${PORT}`));

console.log("Iniciando servicio WhatsApp...");
connect();
