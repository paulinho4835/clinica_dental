import { describe, it, expect } from "vitest";
import { computeIndices, siteCal } from "@/lib/perio/indices";
import type { PerioMeasurements } from "@/lib/perio/types";

describe("siteCal (nivel de inserción)", () => {
  it("NIC = profundidad de sondaje + recesión", () => {
    expect(siteCal({ pd: 4, rec: 2 })).toBe(6);
  });

  it("recesión ausente se trata como 0", () => {
    expect(siteCal({ pd: 3 })).toBe(3);
  });

  it("sin profundidad de sondaje devuelve null (sitio no sondado)", () => {
    expect(siteCal({ rec: 2 })).toBeNull();
    expect(siteCal(undefined)).toBeNull();
    expect(siteCal({ pd: null })).toBeNull();
  });
});

describe("computeIndices", () => {
  it("examen vacío: todo en cero/null", () => {
    const r = computeIndices({});
    expect(r.teethPresent).toBe(0);
    expect(r.sitesProbed).toBe(0);
    expect(r.bopPercent).toBeNull();
    expect(r.deepestPocket).toBeNull();
    expect(r.meanCal).toBeNull();
  });

  it("cuenta dientes presentes e ignora ausentes", () => {
    const m: PerioMeasurements = {
      "16": { present: true, sites: { vm: { pd: 3 } } },
      "15": { present: false, sites: {} },
    };
    expect(computeIndices(m).teethPresent).toBe(1);
  });

  it("% sangrado y % placa sobre sitios sondados", () => {
    const m: PerioMeasurements = {
      "11": {
        present: true,
        sites: {
          vm: { pd: 3, bop: true, plaque: true },
          vc: { pd: 2, bop: false },
          vd: { pd: 4, bop: true, plaque: false },
          pm: { pd: 2 },
        },
      },
    };
    const r = computeIndices(m);
    expect(r.sitesProbed).toBe(4);
    expect(r.bopPercent).toBe(50); // 2 de 4
    expect(r.plaquePercent).toBe(25); // 1 de 4
  });

  it("un sitio con bop pero sin profundidad no cuenta como sondado", () => {
    const m: PerioMeasurements = {
      "11": { present: true, sites: { vm: { bop: true } } },
    };
    const r = computeIndices(m);
    expect(r.sitesProbed).toBe(0);
    expect(r.bopPercent).toBeNull();
  });

  it("bolsa más profunda y conteos ≥4mm / ≥6mm", () => {
    const m: PerioMeasurements = {
      "16": {
        present: true,
        sites: { vm: { pd: 3 }, vc: { pd: 4 }, vd: { pd: 6 }, pm: { pd: 7 } },
      },
    };
    const r = computeIndices(m);
    expect(r.deepestPocket).toBe(7);
    expect(r.pockets4plus).toBe(3); // 4, 6, 7
    expect(r.pockets6plus).toBe(2); // 6, 7
  });

  it("NIC promedio redondeado a un decimal", () => {
    const m: PerioMeasurements = {
      "16": {
        present: true,
        sites: { vm: { pd: 3, rec: 1 }, vc: { pd: 4, rec: 0 } },
      },
    };
    // NIC: 4 y 4 → promedio 4.0
    expect(computeIndices(m).meanCal).toBe(4);
  });

  it("ignora sitios de dientes ausentes en todos los índices", () => {
    const m: PerioMeasurements = {
      "16": { present: false, sites: { vm: { pd: 9, bop: true } } },
    };
    const r = computeIndices(m);
    expect(r.sitesProbed).toBe(0);
    expect(r.deepestPocket).toBeNull();
    expect(r.pockets6plus).toBe(0);
  });
});
