// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { IntakeQuestionsPanel } from "@/components/ajustes/IntakeQuestionsPanel";

const { saveIntakeQuestions } = vi.hoisted(() => ({ saveIntakeQuestions: vi.fn() }));
vi.mock("@/app/(dashboard)/ajustes/actions", () => ({ saveIntakeQuestions }));

describe("IntakeQuestionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveIntakeQuestions.mockResolvedValue({ ok: true });
  });

  it("agrega una pregunta de texto y la envía al guardar", async () => {
    render(<IntakeQuestionsPanel initialQuestions={[]} canWrite />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    fireEvent.change(screen.getByPlaceholderText("Texto de la pregunta"), {
      target: { value: "¿Tienes seguro médico?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Configuración guardada.");
    expect(saveIntakeQuestions).toHaveBeenCalledWith([
      expect.objectContaining({
        key: "tienes_seguro_medico",
        label: "¿Tienes seguro médico?",
        type: "text",
        required: false,
        active: true,
        position: 0,
      }),
    ]);
  });

  it("elimina una pregunta existente antes de guardar", async () => {
    render(
      <IntakeQuestionsPanel
        initialQuestions={[
          { key: "a", label: "Pregunta A", type: "text", required: false, active: true, position: 0 },
        ]}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar pregunta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Configuración guardada.");
    expect(saveIntakeQuestions).toHaveBeenCalledWith([]);
  });

  it("muestra el error del servidor si falla el guardado", async () => {
    saveIntakeQuestions.mockResolvedValue({ error: "Máximo 10 preguntas." });
    render(<IntakeQuestionsPanel initialQuestions={[]} canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Máximo 10 preguntas.");
  });

  it("no regenera el key de una pregunta ya guardada aunque su label empiece con 'pregunta'", async () => {
    render(<IntakeQuestionsPanel initialQuestions={[]} canWrite />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    fireEvent.change(screen.getByPlaceholderText("Texto de la pregunta"), {
      target: { value: "Pregunta médica" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Configuración guardada.");
    const firstKey = saveIntakeQuestions.mock.calls[0][0][0].key;

    fireEvent.change(screen.getByPlaceholderText("Texto de la pregunta"), {
      target: { value: "Pregunta médica (actualizada)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Configuración guardada.");
    const secondKey = saveIntakeQuestions.mock.calls[1][0][0].key;

    expect(secondKey).toBe(firstKey);
  });

  it("sin permiso de escritura, no muestra controles de edición", () => {
    render(
      <IntakeQuestionsPanel
        initialQuestions={[
          { key: "a", label: "Pregunta A", type: "text", required: false, active: true, position: 0 },
        ]}
        canWrite={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Agregar pregunta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });
});
