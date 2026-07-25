import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/admin.json");

setup("autenticar admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill("admin@sonrisa.com");
  await page.getByRole("textbox", { name: /contraseña/i }).fill("password123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL("**/agenda", { timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});
