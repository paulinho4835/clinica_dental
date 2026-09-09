import { describe, expect, it } from "vitest";
import { findHistoricalWorkForPayment } from "@/lib/historical-payment-link";

const payment = {
  amount: 1600,
  method: "cash",
  note: "Puente metal ivocrom 9 coronas",
  createdAt: "2026-08-27T22:35:10.000Z",
};

function candidate(id: string, createdAt: string) {
  return {
    id,
    cost: 1600,
    amount_paid: 1600,
    payment_method: "cash",
    description: "Puente metal ivocrom 9 coronas",
    created_at: createdAt,
  };
}

describe("findHistoricalWorkForPayment", () => {
  it("recupera el trabajo historico con huella exacta", () => {
    const result = findHistoricalWorkForPayment(payment, [
      candidate("work-1", "2026-08-27T22:35:10.120Z"),
    ]);
    expect(result?.id).toBe("work-1");
  });

  it("elige el candidato temporalmente mas cercano cuando es inequivoco", () => {
    const result = findHistoricalWorkForPayment(payment, [
      candidate("otro-pago", "2026-08-27T22:34:10.100Z"),
      candidate("mismo-pago", "2026-08-27T22:35:10.090Z"),
    ]);
    expect(result?.id).toBe("mismo-pago");
  });

  it("no adivina cuando dos candidatos son temporalmente ambiguos", () => {
    const result = findHistoricalWorkForPayment(payment, [
      candidate("work-1", "2026-08-27T22:35:09.900Z"),
      candidate("work-2", "2026-08-27T22:35:10.100Z"),
    ]);
    expect(result).toBeNull();
  });

  it("descarta candidatos con otra huella financiera", () => {
    const wrong = {
      ...candidate("work-1", "2026-08-27T22:35:10.100Z"),
      amount_paid: 1000,
    };
    expect(findHistoricalWorkForPayment(payment, [wrong])).toBeNull();
  });
});
