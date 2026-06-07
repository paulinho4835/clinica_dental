import { describe, it, expect } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("une clases simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignora valores falsy", () => {
    expect(cn("a", undefined, false, null, "b")).toBe("a b");
  });

  it("resuelve conflictos de Tailwind (última gana)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("acepta clases condicionales como objeto", () => {
    expect(cn({ "font-bold": true, "font-normal": false })).toBe("font-bold");
  });

  it("acepta arrays de clases", () => {
    expect(cn(["px-2", "py-2"], "mt-4")).toBe("px-2 py-2 mt-4");
  });

  it("sin argumentos devuelve string vacío", () => {
    expect(cn()).toBe("");
  });

  it("merge de bg y text no se pisan entre sí", () => {
    const result = cn("bg-red-500 text-white", "bg-blue-500");
    expect(result).toContain("bg-blue-500");
    expect(result).not.toContain("bg-red-500");
    expect(result).toContain("text-white");
  });
});
