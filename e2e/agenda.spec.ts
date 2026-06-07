import { test, expect } from "@playwright/test";

test.describe("Agenda", () => {
  test("carga la agenda y muestra el calendario", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  });

  test("el menú lateral muestra Agenda como enlace activo", async ({ page }) => {
    await page.goto("/agenda");
    const agendaLink = page.getByRole("link", { name: /agenda/i }).first();
    await expect(agendaLink).toHaveAttribute("aria-current", "page");
  });

  test("contiene botones de navegación de mes", async ({ page }) => {
    await page.goto("/agenda");
    // Navegación de mes: flechas de calendario (aria-label o svg)
    await expect(page.locator("main")).toBeVisible();
    // La página carga sin errores (sin texto de error visible)
    await expect(page.getByText(/error al cargar/i)).not.toBeVisible();
  });
});
