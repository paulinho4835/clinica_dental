import { describe, it, expect, afterEach } from "vitest";
import { confirm, _bindConfirmHost, type ConfirmRequest } from "@/lib/confirm";

afterEach(() => {
  _bindConfirmHost(null); // limpiar handler entre tests
});

describe("confirm con handler montado", () => {
  it("llama al handler con las opciones correctas", async () => {
    const captured: { req: ConfirmRequest | null } = { req: null };
    _bindConfirmHost((req) => {
      captured.req = req;
      req.resolve(true);
    });

    const result = await confirm({ message: "¿Eliminar paciente?" });
    expect(result).toBe(true);
    expect(captured.req?.message).toBe("¿Eliminar paciente?");
  });

  it("resolve false cancela la operación", async () => {
    _bindConfirmHost((req) => req.resolve(false));
    const result = await confirm({ message: "¿Confirmar?" });
    expect(result).toBe(false);
  });

  it("pasa title, confirmText y cancelText al handler", async () => {
    const captured: { req: ConfirmRequest | null } = { req: null };
    _bindConfirmHost((req) => { captured.req = req; req.resolve(true); });

    await confirm({
      title: "Advertencia",
      message: "¿Borrar?",
      confirmText: "Sí, borrar",
      cancelText: "Cancelar",
      tone: "danger",
    });

    expect(captured.req?.title).toBe("Advertencia");
    expect(captured.req?.confirmText).toBe("Sí, borrar");
    expect(captured.req?.cancelText).toBe("Cancelar");
    expect(captured.req?.tone).toBe("danger");
  });

  it("id es único y crece con cada llamada", async () => {
    const ids: number[] = [];
    _bindConfirmHost((req) => { ids.push(req.id); req.resolve(true); });

    await confirm({ message: "A" });
    await confirm({ message: "B" });

    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0] + 1);
  });

  it("_bindConfirmHost(null) => confirm cae en fallback (sin handler)", async () => {
    // En entorno node no hay window.confirm; verificamos que lanza o cuelga
    // sólo si accede a window. Dado que el env es node puro, mostramos que
    // cuando no hay handler y no hay window se lanza ReferenceError.
    _bindConfirmHost(null);
    await expect(confirm({ message: "test" })).rejects.toThrow();
  });
});
