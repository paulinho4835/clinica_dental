import { describe, expect, it } from "vitest";
import {
  BankError,
  bankAmount,
  createBanecoClient,
  parseQrStatus,
  qrDueDate,
  tokenExpiresAt,
} from "../baneco";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeBank(handler: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { calls, client: createBanecoClient("https://banco.test/ApiGateway/", fetcher) };
}

describe("cliente de Banco Económico", () => {
  it("cifra con el servicio del banco y acepta texto plano o entre comillas", async () => {
    const { calls, client } = fakeBank((call) => ({
      body: call.url.includes("text=1234") ? "KJAzqjmwjxIOqVo5J3IH0/7fGmNdzuyszrlqexVSeos=" : '"abc="',
    }));
    expect(await client.encrypt("1234", "40A318B299F245C2B697176723088629")).toBe(
      "KJAzqjmwjxIOqVo5J3IH0/7fGmNdzuyszrlqexVSeos=",
    );
    expect(await client.encrypt("9", "k")).toBe("abc=");
    expect(calls[0].url).toBe(
      "https://banco.test/ApiGateway/api/authentication/encrypt?text=1234&aesKey=40A318B299F245C2B697176723088629",
    );
  });

  it("autentica y devuelve el token", async () => {
    const { calls, client } = fakeBank(() => ({ body: { token: "tok", responseCode: 0, message: "" } }));
    expect(await client.authenticate("26551010", "cifrada=")).toBe("tok");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body!)).toEqual({ userName: "26551010", password: "cifrada=" });
  });

  it("informa el mensaje del banco cuando responseCode no es 0", async () => {
    const { client } = fakeBank(() => ({ body: { responseCode: 99, message: "Usuario bloqueado" } }));
    await expect(client.authenticate("u", "p")).rejects.toThrow("El banco rechazó iniciar sesión: Usuario bloqueado");
  });

  it("genera el QR con el token y redondea el importe a 2 decimales", async () => {
    const { calls, client } = fakeBank(() => ({
      body: { qrId: "21061401016000000003", qrImage: "iVBORw0KGgo", responseCode: 0, message: "" },
    }));
    const qr = await client.generateQr("tok", {
      transactionId: "venta-1",
      accountCredit: "cuenta=",
      currency: "BOB",
      amount: 10.005,
      dueDate: "2026-10-07",
      singleUse: true,
      modifyAmount: false,
    });
    expect(qr).toEqual({ qrId: "21061401016000000003", qrImage: "iVBORw0KGgo" });
    expect(calls[0].headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].body!)).toMatchObject({ amount: 10.01, singleUse: true, modifyAmount: false });
  });

  it("lee el estado con statusQrCode o statusQRCode y los datos del pago", async () => {
    const paid = {
      statusQrCode: 1,
      payment: [{ qrId: "q1", transactionId: "1236342", senderName: "PEDRO PEREZ", amount: 1 }],
      responseCode: 0,
    };
    const { calls, client } = fakeBank(() => ({ body: paid }));
    const status = await client.qrStatus("tok", "q1");
    expect(status.code).toBe(1);
    expect(status.payments[0].senderName).toBe("PEDRO PEREZ");
    expect(calls[0].url).toBe("https://banco.test/ApiGateway/api/qrsimple/v2/statusQR/q1");
    expect(parseQrStatus({ statusQRCode: 0 })).toEqual({ code: 0, payments: [] });
    expect(parseQrStatus({ statusQrCode: 9 }).code).toBe(9);
    expect(() => parseQrStatus({ statusQrCode: 5 })).toThrow(BankError);
  });

  it("anula con DELETE y el qrId en el cuerpo", async () => {
    const { calls, client } = fakeBank(() => ({ body: { responseCode: 0, message: "" } }));
    await client.cancelQr("tok", "q1");
    expect(calls[0].method).toBe("DELETE");
    expect(JSON.parse(calls[0].body!)).toEqual({ qrId: "q1" });
  });

  it("distingue token vencido, error HTTP y respuesta que no es JSON", async () => {
    await expect(fakeBank(() => ({ status: 401, body: "" })).client.qrStatus("tok", "q")).rejects.toMatchObject({
      status: 401,
    });
    await expect(fakeBank(() => ({ status: 500, body: "" })).client.qrStatus("tok", "q")).rejects.toThrow("estado 500");
    await expect(fakeBank(() => ({ body: "<html>" })).client.qrStatus("tok", "q")).rejects.toThrow(
      "Respuesta inesperada",
    );
  });
});

describe("reglas del cobro QR", () => {
  it("el importe es positivo y con 2 decimales", () => {
    expect(bankAmount(1.2)).toBe(1.2);
    expect(bankAmount(99.999)).toBe(100);
    expect(() => bankAmount(0)).toThrow();
    expect(() => bankAmount(Number.NaN)).toThrow();
  });

  it("el QR vence mañana en hora de Bolivia", () => {
    // 2026-10-06 23:30 en La Paz = 2026-10-07 03:30 UTC → vence el 2026-10-07.
    expect(qrDueDate(new Date("2026-10-07T03:30:00Z"))).toBe("2026-10-07");
    expect(qrDueDate(new Date("2026-10-06T15:00:00Z"))).toBe("2026-10-07");
  });

  it("toma el vencimiento del token del claim exp", () => {
    const payload = btoa(JSON.stringify({ exp: 1623449358 })).replace(/=+$/, "");
    expect(tokenExpiresAt(`h.${payload}.s`).toISOString()).toBe("2021-06-11T22:09:18.000Z");
    const now = new Date("2026-10-06T12:00:00Z");
    expect(tokenExpiresAt("no-es-jwt", now).toISOString()).toBe("2026-10-06T12:25:00.000Z");
  });
});
