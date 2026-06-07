import { test, expect } from "@playwright/test";

test.describe("Pacientes", () => {
  test("lista de pacientes carga sin error", async ({ page }) => {
    await page.goto("/pacientes");
    await expect(page).toHaveURL(/\/pacientes/);
    await expect(page.getByRole("button", { name: /nuevo paciente/i })).toBeVisible();
  });

  test("abrir formulario de nuevo paciente muestra los campos", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /nuevo paciente/i }).click();
    await expect(page.getByText(/nombre completo/i)).toBeVisible();
    await expect(page.getByText(/correo electrónico|email/i).first()).toBeVisible();
  });

  test("validación client-side: nombre requerido sin submit al server", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /nuevo paciente/i }).click();
    // Enviar sin llenar nada — RHF valida en cliente
    await page.getByRole("button", { name: /^guardar$/i }).click();
    await expect(page.getByText(/nombre requerido/i)).toBeVisible();
  });

  test("cancelar cierra el formulario", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /nuevo paciente/i }).click();
    await page.getByRole("button", { name: /cancelar/i }).click();
    await expect(page.getByText(/nombre completo/i)).not.toBeVisible();
  });
});
