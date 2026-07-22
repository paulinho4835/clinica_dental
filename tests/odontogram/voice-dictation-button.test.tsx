// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceDictationButton } from "@/components/odontogram/VoiceDictationButton";

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

const originalMediaRecorder = globalThis.MediaRecorder;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

afterEach(() => {
  globalThis.MediaRecorder = originalMediaRecorder;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("VoiceDictationButton", () => {
  it("permiso denegado: muestra mensaje y ofrece la paleta manual", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("denied"));
    render(<VoiceDictationButton patientId="p1" onApply={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dictar cambios" }));
    });
    expect(await screen.findByText(/No se pudo acceder al micrófono/)).toBeTruthy();
  });

  it("grabando: cambia a estado de grabación con cronómetro y botón Detener", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStream());
    globalThis.fetch = vi.fn(); // no debe llegar a llamarse todavía
    render(<VoiceDictationButton patientId="p1" onApply={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dictar cambios" }));
    });
    expect(screen.getByRole("button", { name: "Detener" })).toBeTruthy();
    expect(screen.getByText(/Grabando 0s de 60s/)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("procesando: al detener, deshabilita el botón mientras interpreta", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStream());
    let resolveFetch: (v: unknown) => void = () => {};
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    render(<VoiceDictationButton patientId="p1" onApply={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dictar cambios" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Detener" }));
    });

    expect(screen.getByText("Interpretando dictado…")).toBeTruthy();
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ transcript: "t", operations: [], uncertainties: [], warnings: [] }) });
    });
  });

  it("aplicar: registra uso con outcome=applied y llama onApply con las operaciones", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStream());
    const operation = { action: "set_surface" as const, tooth: "46", surface: "O" as const, condition: "caries" as const };
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url === "/api/odontogram/voice/interpret") {
        return { ok: true, json: async () => ({ transcript: "caries en 46", operations: [operation], uncertainties: [], warnings: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onApply = vi.fn();

    render(<VoiceDictationButton patientId="p1" onApply={onApply} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dictar cambios" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Detener" }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar al odontograma" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Aplicar al odontograma" }));

    expect(onApply).toHaveBeenCalledWith([operation]);
    await waitFor(() => {
      const usageCall = fetchMock.mock.calls.find(([url]) => url === "/api/odontogram/voice/usage");
      expect(usageCall).toBeTruthy();
      const body = JSON.parse((usageCall as [string, RequestInit])[1].body as string);
      expect(body.outcome).toBe("applied");
      expect(body.appliedCount).toBe(1);
    });
  });

  it("cancelar: registra uso con outcome=cancelled y no llama onApply", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStream());
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url === "/api/odontogram/voice/interpret") {
        return { ok: true, json: async () => ({ transcript: "t", operations: [], uncertainties: ["ambiguo"], warnings: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onApply = vi.fn();

    render(<VoiceDictationButton patientId="p1" onApply={onApply} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dictar cambios" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Detener" }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => {
      const usageCall = fetchMock.mock.calls.find(([url]) => url === "/api/odontogram/voice/usage");
      expect(usageCall).toBeTruthy();
      const body = JSON.parse((usageCall as [string, RequestInit])[1].body as string);
      expect(body.outcome).toBe("cancelled");
    });
  });
});
