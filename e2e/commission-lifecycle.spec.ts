import { test, expect } from "@playwright/test";

// Cubre el ciclo de vida completo de una comisión de doctor, el flujo de
// dinero más delicado del sistema (hubo un bug real de comisión perdida por
// un insert no-atómico, ver migración 0103): registrar un trabajo con
// comisión desde "Mis trabajos" → verificar que queda pendiente en "Pagos a
// personal" → pagarla → confirmar que deja de aparecer como pendiente.
// Usa los pacientes/doctores/recepcionista del seed local (supabase/seed.sql).

test.describe("Ciclo de vida de comisión", () => {
  test("registrar trabajo → comisión pendiente → pagar → queda cerrada", async ({ page }) => {
    const uniqueDesc = `E2E comisión ${Date.now()}`;

    // 1. Registrar un trabajo con comisión desde "Mis trabajos".
    await page.goto("/mis-trabajos");
    await page.getByRole("button", { name: "Registrar trabajo" }).click();

    await page.getByPlaceholder("Buscar por nombre o CI…").fill("Juan Pérez");
    await page.locator("li", { hasText: "Juan Pérez" }).click();

    await page.getByLabel("Doctor *").selectOption({ label: "Dr. Gómez" });
    await page.getByLabel("Descripción *").fill(uniqueDesc);
    await page.getByLabel("Costo del tratamiento (Bs)").fill("100");
    await page.getByLabel("Cobrado al paciente (Bs)").fill("100");
    // "Cobrado por" solo aparece si la clínica tiene recepcionistas cargadas
    // en clinic_receptionists (tabla aparte de profiles) — condicional.
    const collectedBy = page.getByLabel("Cobrado por *");
    if (await collectedBy.count()) {
      await collectedBy.selectOption({ index: 1 });
    }
    await page.getByLabel("Porcentaje de comisión (%)").fill("20");

    await page.getByRole("button", { name: "Registrar", exact: true }).click();
    await page.getByRole("button", { name: "Sí, registrar" }).click();

    // Al guardar, el form limpia sus campos y queda abierto (permite registrar
    // otro trabajo del mismo paciente sin reseleccionar) — hay que cerrarlo
    // a mano para volver a la lista.
    await expect(page.getByText("Trabajo registrado")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Cancelar" }).click();

    // La lista por defecto solo muestra los trabajos del usuario logueado
    // ("Ver: Paulo Leon"); el trabajo se registró a nombre de Dr. Gómez.
    await page.getByLabel("Ver:").selectOption({ label: "Todos los doctores" });
    // La página renderiza una tarjeta mobile (sm:hidden) y una tabla desktop
    // (hidden sm:block) con el mismo texto — la tabla desktop es la última en
    // el DOM y la visible en este viewport.
    await expect(page.getByText(uniqueDesc).last()).toBeVisible();

    // 2. En "Pagos a personal", el doctor debe tener esa comisión pendiente.
    await page.goto("/pagos");
    await page.getByRole("link", { name: /Dr\. Gómez/ }).click();

    // Mismo patrón mobile/desktop duplicado que en Mis trabajos.
    const pendingCheckbox = page
      .getByRole("checkbox", { name: `Pagar comisión de ${uniqueDesc}` })
      .last();
    await expect(pendingCheckbox).toBeVisible({ timeout: 10_000 });
    await pendingCheckbox.check();

    // 3. Pagarla (hay un modal de confirmación intermedio con el monto y payee).
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByRole("button", { name: "Sí, registrar" }).click();
    await expect(page.getByText("Pago registrado")).toBeVisible({ timeout: 10_000 });

    // 4. Ya no debe aparecer como pendiente de pago.
    await expect(pendingCheckbox).toHaveCount(0);
  });
});
