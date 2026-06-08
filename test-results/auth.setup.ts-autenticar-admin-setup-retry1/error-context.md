# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> autenticar admin
- Location: e2e\auth.setup.ts:6:6

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/login
Call log:
  - navigating to "http://localhost:3000/login", waiting until "load"

```

# Test source

```ts
  1  | import { test as setup } from "@playwright/test";
  2  | import path from "path";
  3  | 
  4  | const authFile = path.join(__dirname, ".auth/admin.json");
  5  | 
  6  | setup("autenticar admin", async ({ page }) => {
> 7  |   await page.goto("/login");
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/login
  8  |   await page.getByLabel(/correo/i).fill("admin@sonrisa.com");
  9  |   await page.getByLabel(/contraseña/i).fill("password123");
  10 |   await page.getByRole("button", { name: /entrar/i }).click();
  11 |   await page.waitForURL("**/agenda", { timeout: 10_000 });
  12 |   await page.context().storageState({ path: authFile });
  13 | });
  14 | 
```