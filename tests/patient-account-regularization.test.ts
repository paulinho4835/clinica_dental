import { describe, expect, it } from "vitest";
import { summarizePatientAccount } from "@/lib/patientAccount";

describe("resumen de cuenta con trabajos historicos", () => {
  it("mantiene el saldo basado en el plan y lo marca provisional", () => {
    expect(
      summarizePatientAccount({
        planTotal: 2540,
        paidTotal: 2960,
        historicalWorks: [{ cost: 1000 }, { cost: 620 }],
      }),
    ).toEqual({
      planTotal: 2540,
      paidTotal: 2960,
      balance: -420,
      historicalCount: 2,
      historicalReferenceTotal: 1620,
      isProvisional: true,
    });
  });

  it("es definitivo cuando no quedan trabajos sin plan", () => {
    expect(
      summarizePatientAccount({ planTotal: 3000, paidTotal: 1000, historicalWorks: [] }),
    ).toMatchObject({ balance: 2000, isProvisional: false, historicalCount: 0 });
  });
});
