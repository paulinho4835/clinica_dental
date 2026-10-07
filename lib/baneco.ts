/**
 * Cliente de la API Market de Banco Económico (especificación v1.3.0): autenticación, cifrado y QR
 * simple (generar, consultar estado, anular). Sin dependencias de Deno para poder probarlo con vitest;
 * la Edge Function `bank-qr` le pasa `fetch`.
 *
 * Convenciones del banco: JSON camelCase, importes con punto y hasta 2 decimales, fechas yyyy-MM-dd,
 * `responseCode` distinto de 0 indica error y `message` lo explica.
 */

export const BANECO_CERTIFICATION_URL = "https://apimktdesa.baneco.com.bo/ApiGateway";
/** Confirmada el 2026-10-07 al verificar credenciales reales; `BANECO_PRODUCTION_URL` la reemplaza si el banco la cambia. */
export const BANECO_PRODUCTION_URL = "https://apimkt.baneco.com.bo/ApiGateway";

export class BankError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = "BankError";
  }
}

export type GenerateQrRequest = {
  transactionId: string;
  accountCredit: string; // cifrada con la llave AES del banco
  currency: "BOB" | "USD";
  amount: number;
  description?: string;
  dueDate: string; // yyyy-MM-dd
  singleUse: boolean;
  modifyAmount: boolean;
  branchCode?: string;
};

export type QrPayment = {
  qrId: string;
  transactionId: string;
  paymentDate: string;
  paymentTime: string;
  currency: string;
  amount: number;
  senderBankCode: string;
  senderName: string;
  senderAccount: string;
  description?: string;
  branchCode?: string;
};

/** 0: pendiente de pago, 1: pagado, 9: anulado. */
export type QrStatus = { code: 0 | 1 | 9; payments: QrPayment[] };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;

/** Importe con punto y como máximo 2 decimales, como número JSON. */
export function bankAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new BankError("El importe debe ser mayor a cero.");
  return Math.round(amount * 100) / 100;
}

/**
 * Vencimiento del QR: mañana en Bolivia (UTC-4, sin horario de verano). Un QR pedido a las 23:50 no
 * vence a los diez minutos; uno de uso único se anula igual si no se paga.
 */
export function qrDueDate(now: Date = new Date()) {
  const laPaz = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  laPaz.setUTCDate(laPaz.getUTCDate() + 1);
  return laPaz.toISOString().slice(0, 10);
}

/** Vencimiento del token del banco (claim `exp` del JWT); si no se puede leer, 25 minutos. */
export function tokenExpiresAt(token: string, now: Date = new Date()) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = Number(
      (JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { exp?: unknown }).exp,
    );
    if (Number.isFinite(exp) && exp > 0) return new Date(exp * 1000);
  } catch {
    // Token sin formato JWT: se usa el respaldo.
  }
  return new Date(now.getTime() + 25 * 60 * 1000);
}

/** El estado de un QR, aceptando `statusQRCode` (tabla del documento) y `statusQrCode` (ejemplo). */
export function parseQrStatus(body: Record<string, unknown>): QrStatus {
  const raw = body.statusQRCode ?? body.statusQrCode ?? body.statusQrcode;
  const code = Number(raw);
  if (code !== 0 && code !== 1 && code !== 9) throw new BankError(`Estado de QR desconocido: ${String(raw)}.`);
  const payment = body.payment;
  const payments = (Array.isArray(payment) ? payment : payment ? [payment] : []) as QrPayment[];
  return { code, payments };
}

function ensureOk(body: unknown, action: string) {
  const value = (body ?? {}) as { responseCode?: unknown; message?: unknown };
  const code = Number(value.responseCode ?? 0);
  if (code !== 0) {
    const detail = typeof value.message === "string" && value.message.trim() ? value.message.trim() : `código ${code}`;
    throw new BankError(`El banco rechazó ${action}: ${detail}`, undefined, code);
  }
  return value as Record<string, unknown>;
}

export function createBanecoClient(baseUrl: string, fetcher: Fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, "");

  async function call(path: string, init: RequestInit, action: string) {
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (reason) {
      const timedOut = reason instanceof Error && (reason.name === "TimeoutError" || reason.name === "AbortError");
      throw new BankError(timedOut ? "El banco no respondió a tiempo." : "No se pudo conectar con el banco.");
    }
    const text = await response.text();
    if (response.status === 401 || response.status === 403)
      throw new BankError("El banco no aceptó las credenciales o el token venció.", response.status);
    if (!response.ok)
      throw new BankError(`El banco respondió con el estado ${response.status} al ${action}.`, response.status);
    return text;
  }

  async function json(path: string, init: RequestInit, action: string) {
    const text = await call(path, init, action);
    try {
      return ensureOk(JSON.parse(text), action);
    } catch (reason) {
      if (reason instanceof BankError) throw reason;
      throw new BankError(`Respuesta inesperada del banco al ${action}.`);
    }
  }

  const authorized = (token: string, extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${token}`,
    ...extra,
  });

  return {
    /** Cifra un texto con la llave AES del banco (servicio del propio banco). */
    async encrypt(text: string, aesKey: string) {
      const query = new URLSearchParams({ text, aesKey });
      const body = (await call(`/api/authentication/encrypt?${query}`, { method: "GET" }, "cifrar los datos")).trim();
      const value = body.startsWith('"') ? (JSON.parse(body) as string) : body;
      if (!value) throw new BankError("El banco devolvió un cifrado vacío.");
      return value;
    },

    /** Valida las credenciales y devuelve el token para los demás servicios. */
    async authenticate(userName: string, passwordEncrypted: string) {
      const body = await json(
        "/api/authentication/authenticate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName, password: passwordEncrypted }),
        },
        "iniciar sesión",
      );
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) throw new BankError("El banco no devolvió un token.");
      return token;
    },

    async generateQr(token: string, request: GenerateQrRequest) {
      const body = await json(
        "/api/qrsimple/generateQR",
        {
          method: "POST",
          headers: authorized(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ ...request, amount: bankAmount(request.amount) }),
        },
        "generar el QR",
      );
      const qrId = String(body.qrId ?? "");
      const qrImage = String(body.qrImage ?? "");
      if (!qrId || !qrImage) throw new BankError("El banco no devolvió el QR.");
      return { qrId, qrImage };
    },

    async qrStatus(token: string, qrId: string) {
      const body = await json(
        `/api/qrsimple/v2/statusQR/${encodeURIComponent(qrId)}`,
        { method: "GET", headers: authorized(token) },
        "consultar el QR",
      );
      return parseQrStatus(body);
    },

    async cancelQr(token: string, qrId: string) {
      await json(
        "/api/qrsimple/cancelQR",
        {
          method: "DELETE",
          headers: authorized(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ qrId }),
        },
        "anular el QR",
      );
    },
  };
}

export type BanecoClient = ReturnType<typeof createBanecoClient>;
