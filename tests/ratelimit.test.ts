import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkRateLimit,
  clientIp,
  tooManyRequestsMessage,
} from "@/lib/ratelimit";

describe("clientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("recorta espacios alrededor de la IP", () => {
    const h = new Headers({ "x-forwarded-for": "  198.51.100.4  " });
    expect(clientIp(h)).toBe("198.51.100.4");
  });

  it("cae a x-real-ip si no hay x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "192.0.2.5" });
    expect(clientIp(h)).toBe("192.0.2.5");
  });

  it("devuelve 'unknown' sin cabeceras de IP", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("tooManyRequestsMessage", () => {
  it("usa mensaje genérico para <= 1 minuto", () => {
    expect(tooManyRequestsMessage(30)).toContain("un momento");
  });

  it("indica los minutos para esperas más largas", () => {
    expect(tooManyRequestsMessage(125)).toContain("3 minutos");
  });
});

describe("checkRateLimit sin Upstash configurado", () => {
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (prevUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    if (prevToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
  });

  it("permite la petición (no-op) cuando faltan las credenciales", async () => {
    const res = await checkRateLimit("login", "1.2.3.4");
    expect(res.ok).toBe(true);
    expect(res.retryAfterSeconds).toBe(0);
  });
});
