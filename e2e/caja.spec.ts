import { test, expect } from "@playwright/test";

test.describe("Caja", () => {
  test("página de caja carga con botón de registrar pago", async ({ page }) => {
    await page.goto("/caja");
    await expect(page).toHaveURL(/\/caja/);
    await expect(page.getByRole("button", { name: /registrar pago/i })).toBeVisible();
  });

  test("abrir formulario de pago muestra campos de paciente y monto", async ({ page }) => {
    await page.goto("/caja");
    await page.getByRole("button", { name: /registrar pago/i }).click();
    await expect(page.getByText(/paciente/i).first()).toBeVisible();
    await expect(page.getByText(/monto/i)).toBeVisible();
  });

  test("monto negativo muestra error inline", async ({ page }) => {
    await page.goto("/caja");
    await page.getByRole("button", { name: /registrar pago/i }).click();
    await page.locator('input[name="amount"]').fill("-5");
    await expect(page.getByText(/monto debe ser mayor a 0/i)).toBeVisible();
  });

  test("dashboard de finanzas carga sin error", async ({ page }) => {
    await page.goto("/caja/dashboard");
    await expect(page).toHaveURL(/\/caja\/dashboard/);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/error al cargar/i)).not.toBeVisible();
  });
});
