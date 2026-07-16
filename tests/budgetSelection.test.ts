import { describe, it, expect } from "vitest";
import {
  parseSelectedIds,
  filterBySelection,
  sumPaymentsForSelection,
} from "@/lib/print/budgetSelection";

describe("parseSelectedIds", () => {
  it("undefined devuelve null (sin filtro)", () => {
    expect(parseSelectedIds(undefined)).toBeNull();
  });

  it("string vacío devuelve null (sin filtro)", () => {
    expect(parseSelectedIds("")).toBeNull();
  });

  it("parsea IDs separados por coma", () => {
    const result = parseSelectedIds("id1,id2,id3");
    expect(result).toEqual(new Set(["id1", "id2", "id3"]));
  });

  it("recorta espacios y descarta vacíos", () => {
    const result = parseSelectedIds(" id1 , , id2 ");
    expect(result).toEqual(new Set(["id1", "id2"]));
  });
});

describe("filterBySelection", () => {
  const items = [
    { id: "a", name: "Limpieza" },
    { id: "b", name: "Extracción" },
    { id: "c", name: "Corona" },
  ];

  it("sin selección (null) devuelve todos los items", () => {
    expect(filterBySelection(items, null)).toEqual(items);
  });

  it("con selección devuelve solo los IDs incluidos", () => {
    const result = filterBySelection(items, new Set(["a", "c"]));
    expect(result).toEqual([items[0], items[2]]);
  });

  it("selección vacía devuelve array vacío", () => {
    expect(filterBySelection(items, new Set())).toEqual([]);
  });
});

describe("sumPaymentsForSelection", () => {
  const payments = [
    { amount: 100, treatment_item_id: "a" },
    { amount: 50, treatment_item_id: "b" },
    { amount: 30, treatment_item_id: null },
  ];

  it("sin selección (null) suma todos los pagos, incluidos los sin vínculo", () => {
    expect(sumPaymentsForSelection(payments, null)).toBe(180);
  });

  it("con selección suma solo los pagos vinculados a esos IDs", () => {
    expect(sumPaymentsForSelection(payments, new Set(["a"]))).toBe(100);
  });

  it("con selección excluye pagos sin treatment_item_id aunque haya otros seleccionados", () => {
    expect(sumPaymentsForSelection(payments, new Set(["a", "b"]))).toBe(150);
  });

  it("selección que no matchea ningún pago devuelve 0", () => {
    expect(sumPaymentsForSelection(payments, new Set(["z"]))).toBe(0);
  });
});
