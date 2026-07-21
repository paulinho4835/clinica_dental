import { describe, it, expect, vi } from "vitest";

// "server-only" solo resuelve bajo la condición de exports "react-server" (usada
// por Next.js en tiempo de build). Bajo Vitest/Node no aplica esa condición y el
// paquete real lanza a propósito ("This module cannot be imported from a Client
// Component"). Se mockea aquí únicamente para permitir importar el módulo bajo
// test; no afecta la lógica pura que se está probando (`isTokenExpired`).
vi.mock("server-only", () => ({}));

const { isTokenExpired } = await import("@/lib/google-calendar/client");

describe("isTokenExpired", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("false si falta mucho para vencer", () => {
    expect(isTokenExpired("2026-07-21T13:00:00.000Z", now)).toBe(false);
  });

  it("true si ya venció", () => {
    expect(isTokenExpired("2026-07-21T11:00:00.000Z", now)).toBe(true);
  });

  it("true si vence dentro del margen de 2 minutos (evita usar un token que expira a mitad de la llamada)", () => {
    expect(isTokenExpired("2026-07-21T12:01:00.000Z", now)).toBe(true);
  });

  it("false justo fuera del margen de 2 minutos", () => {
    expect(isTokenExpired("2026-07-21T12:02:01.000Z", now)).toBe(false);
  });
});
