import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast, _subscribe } from "@/lib/toast";

// Cada test parte con suscriptores limpios gracias al módulo re-importado
// via reset de módulos. En su lugar desuscribimos explícitamente.

describe("toast", () => {
  it("suscriptor recibe el mensaje emitido", () => {
    const received: string[] = [];
    const unsub = _subscribe((t) => received.push(t.message));
    toast("Pago registrado");
    unsub();
    expect(received).toEqual(["Pago registrado"]);
  });

  it("tipo por defecto es 'success'", () => {
    let tipo = "";
    const unsub = _subscribe((t) => { tipo = t.type; });
    toast("ok");
    unsub();
    expect(tipo).toBe("success");
  });

  it("tipo explícito se respeta", () => {
    let tipo = "";
    const unsub = _subscribe((t) => { tipo = t.type; });
    toast("Error al guardar", "error");
    unsub();
    expect(tipo).toBe("error");
  });

  it("id incrementa con cada toast", () => {
    const ids: number[] = [];
    const unsub = _subscribe((t) => ids.push(t.id));
    toast("a");
    toast("b");
    unsub();
    expect(ids[1]).toBe(ids[0] + 1);
  });

  it("múltiples suscriptores reciben el mismo toast", () => {
    const a: string[] = [];
    const b: string[] = [];
    const u1 = _subscribe((t) => a.push(t.message));
    const u2 = _subscribe((t) => b.push(t.message));
    toast("Broadcast");
    u1(); u2();
    expect(a).toEqual(["Broadcast"]);
    expect(b).toEqual(["Broadcast"]);
  });

  it("desuscribir detiene la recepción", () => {
    const received: string[] = [];
    const unsub = _subscribe((t) => received.push(t.message));
    toast("antes");
    unsub();
    toast("después");
    expect(received).toEqual(["antes"]);
  });

  it("toast tipo 'info' es válido", () => {
    let tipo = "";
    const unsub = _subscribe((t) => { tipo = t.type; });
    toast("Atención", "info");
    unsub();
    expect(tipo).toBe("info");
  });
});
