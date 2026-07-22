// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomIntakeAnswers } from "@/components/patients/CustomIntakeAnswers";

describe("CustomIntakeAnswers", () => {
  it("no renderiza nada si no hay respuestas", () => {
    const { container } = render(<CustomIntakeAnswers answers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra label y valor de cada respuesta, traduciendo boolean a Sí/No", () => {
    render(
      <CustomIntakeAnswers
        answers={[
          { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
          { key: "plan", label: "¿Qué plan?", type: "select", value: "Premium" },
        ]}
      />,
    );
    expect(screen.getByText("¿Tienes seguro?")).toBeTruthy();
    expect(screen.getByText("Sí")).toBeTruthy();
    expect(screen.getByText("¿Qué plan?")).toBeTruthy();
    expect(screen.getByText("Premium")).toBeTruthy();
  });
});
