import { describe, it, expect } from "vitest";
import { isAnterior, toothType } from "@/lib/odontogram/types";
import { PEDIATRIC_QUADRANTS, PEDIATRIC_QUADRANT_NUMBERS } from "@/lib/odontogram/pediatricTypes";

describe("PEDIATRIC_QUADRANTS", () => {
  it("tiene 4 cuadrantes de 5 dientes cada uno (20 dientes temporales)", () => {
    expect(PEDIATRIC_QUADRANTS).toHaveLength(4);
    for (const q of PEDIATRIC_QUADRANTS) expect(q).toHaveLength(5);
  });

  it("usa FDI de dentición temporal (51-85)", () => {
    const all = PEDIATRIC_QUADRANTS.flat();
    expect(all).toEqual([
      "55", "54", "53", "52", "51",
      "61", "62", "63", "64", "65",
      "85", "84", "83", "82", "81",
      "71", "72", "73", "74", "75",
    ]);
  });

  it("PEDIATRIC_QUADRANT_NUMBERS son los cuadrantes FDI 5,6,8,7 en orden de despliegue", () => {
    expect(PEDIATRIC_QUADRANT_NUMBERS).toEqual([5, 6, 8, 7]);
  });

  it("isAnterior/toothType funcionan igual con FDI temporal (2do dígito define forma)", () => {
    expect(isAnterior("51")).toBe(true); // incisivo central temporal
    expect(isAnterior("53")).toBe(true); // canino temporal
    expect(isAnterior("55")).toBe(false); // 2do molar temporal
    expect(toothType("51")).toBe("incisor");
    expect(toothType("53")).toBe("canine");
    expect(toothType("55")).toBe("molar");
  });
});
