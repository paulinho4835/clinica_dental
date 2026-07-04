# Despliegue de whatsapp-service en VPS Oracle Cloud — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover `whatsapp-service` (Baileys + agente de IA) de la máquina local a un VPS gratuito de Oracle Cloud, corriendo 24/7 vía systemd y expuesto por Cloudflare Tunnel, con un secreto compartido que autentica las llamadas de Vercel.

**Architecture:** El dashboard Next.js sigue en Vercel. Solo `whatsapp-service` se muda a un VPS Ubuntu 24.04 ARM (Oracle Ampere A1). Vercel llama al VPS por una URL HTTPS de Cloudflare Tunnel, autenticando con el header `x-wa-service-secret`. El VPS sigue llamando al webhook `/api/whatsapp/agent` de Vercel con su secreto ya existente (`AGENT_WEBHOOK_SECRET`).

**Tech Stack:** Node.js 22, tsx, @whiskeysockets/baileys, systemd, cloudflared, Oracle Cloud Ampere A1 (ARM64), Cloudflare Tunnel.

## Global Constraints

- **NUNCA hacer push ni cambios en producción (Vercel env, deploy) sin autorización explícita de Paulo.** Copiado verbatim de CLAUDE.md.
- Español neutro en toda copia visible (sin voseo).
- El secreto compartido debe ser **retrocompatible**: si `WA_SERVICE_SECRET` no está definido en el servicio, NO se exige el header (igual que el patrón existente de `AGENT_SECRET` en `whatsapp-service/src/index.ts:209`). Esto evita romper el desarrollo local y permite un rollout sin ventana de caída.
- Plataforma del VPS: **ARM64** (aarch64). Todas las descargas de binarios (Node, cloudflared) deben ser las variantes arm64.
- Node.js **22 LTS** en el VPS (misma major que el `Dockerfile` existente: `node:22-slim`).
- El servicio escucha en el puerto **3001** dentro del VPS (localhost); nunca se expone ese puerto directo a internet — solo a través del túnel.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `whatsapp-service/src/index.ts` | Servidor HTTP + Baileys. Se agrega lectura de `WA_SERVICE_SECRET` y guard de header en `handleRequest`. | Modificar |
| `whatsapp-service/.env.example` | Documenta las env vars del servicio. Agregar `WA_SERVICE_SECRET`. | Modificar |
| `app/api/whatsapp/status/route.ts` | Proxy de estado. Agrega header `x-wa-service-secret`. | Modificar |
| `app/api/whatsapp/qr/route.ts` | Proxy de QR. Agrega header. | Modificar |
| `app/api/whatsapp/connect/route.ts` | Proxy conectar/desconectar (2 fetch). Agrega header en ambos. | Modificar |
| `app/api/whatsapp/send-reminders/route.ts` | Proxy de recordatorios. Agrega header. | Modificar |
| `app/api/whatsapp/bulk/route.ts` | Proxy de envío masivo. Agrega header al fetch existente. | Modificar |
| VPS: `/etc/systemd/system/whatsapp-service.service` | Unidad systemd del servicio Node. | Crear (en el VPS) |
| VPS: `~/clinica_dental/whatsapp-service/.env` | Credenciales de producción del servicio. | Crear (en el VPS) |

Las tareas 1 son de código (en el repo). Las tareas 2–7 son de infraestructura (en Oracle / por SSH / en Vercel). Cada tarea de infraestructura termina en un comando de verificación concreto en vez de un test unitario, porque `whatsapp-service` no tiene framework de tests y este trabajo es glue/infra.

---

## Task 1: Secreto compartido Vercel ↔ whatsapp-service (código)

**Files:**
- Modify: `whatsapp-service/src/index.ts` (const nueva ~línea 194; guard en `handleRequest` ~línea 236)
- Modify: `whatsapp-service/.env.example`
- Modify: `app/api/whatsapp/status/route.ts:17`
- Modify: `app/api/whatsapp/qr/route.ts:15`
- Modify: `app/api/whatsapp/connect/route.ts:21,45`
- Modify: `app/api/whatsapp/send-reminders/route.ts:21`
- Modify: `app/api/whatsapp/bulk/route.ts:109`

**Interfaces:**
- Produces: header HTTP `x-wa-service-secret: <valor>` enviado por todas las rutas `app/api/whatsapp/*` hacia el servicio. El servicio lo valida contra `process.env.WA_SERVICE_SECRET`. Env var nueva `WA_SERVICE_SECRET` (mismo valor en Vercel y en el `.env` del VPS).

- [ ] **Step 1: Generar el valor del secreto y guardarlo temporalmente**

Run:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copia el valor resultante (64 caracteres hex). Se usará en: (a) el `.env.local` de desarrollo para probar ahora, (b) las env vars de Vercel (Task 6), (c) el `.env` del VPS (Task 3). Guárdalo en un lugar seguro; NO lo commitees.

- [ ] **Step 2: Agregar la lectura del secreto en whatsapp-service**

En `whatsapp-service/src/index.ts`, justo después de la línea 228 (`const PORT = ...`), agregar:

```typescript
// Secreto compartido que autentica las llamadas del dashboard (Vercel) a este
// servicio. Retrocompatible: si no está definido, no se exige (dev local).
// Mismo patrón que AGENT_SECRET pero en la dirección opuesta.
const WA_SERVICE_SECRET = process.env.WA_SERVICE_SECRET ?? "";
```

- [ ] **Step 3: Agregar el guard del header al inicio de handleRequest**

En `whatsapp-service/src/index.ts`, dentro de `handleRequest`, justo después del bloque `if (req.method === "OPTIONS")` (línea 244) y antes de `const url = req.url ?? "/";`, agregar:

```typescript
  // Autenticación: si hay secreto configurado, exigir el header en todas las
  // rutas. El preflight OPTIONS ya salió arriba, así que no se bloquea el CORS.
  if (WA_SERVICE_SECRET && req.headers["x-wa-service-secret"] !== WA_SERVICE_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No autorizado" }));
    return;
  }
```

Además, para que el preflight CORS del header custom funcione, ampliar la línea 238. Reemplazar:

```typescript
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
```

por:

```typescript
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-wa-service-secret");
```

- [ ] **Step 4: Documentar la env var en .env.example**

En `whatsapp-service/.env.example`, agregar al final:

```
# Secreto compartido con el dashboard (Vercel). Debe ser IDENTICO al
# WA_SERVICE_SECRET configurado en Vercel. Generar con:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WA_SERVICE_SECRET=
```

- [ ] **Step 5: Agregar el header en las 5 rutas del dashboard**

En cada archivo, agregar `headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },` al objeto de opciones de cada `fetch` hacia `WA_URL`. Detalle por archivo:

`app/api/whatsapp/status/route.ts` — el fetch (línea 17) queda:
```typescript
    const res = await fetch(`${WA_URL}/status/${profile.clinicId}`, {
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(5_000),
    });
```

`app/api/whatsapp/qr/route.ts` — el fetch (línea 15) queda:
```typescript
    const res = await fetch(`${WA_URL}/qr-data/${profile.clinicId}`, {
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(8_000),
    });
```

`app/api/whatsapp/connect/route.ts` — el fetch POST (línea 21) queda:
```typescript
    const res = await fetch(`${WA_URL}/connect/${profile.clinicId}`, {
      method: "POST",
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(10_000),
    });
```
y el fetch DELETE (línea 45) queda:
```typescript
    const res = await fetch(`${WA_URL}/disconnect/${profile.clinicId}`, {
      method: "DELETE",
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(10_000),
    });
```

`app/api/whatsapp/send-reminders/route.ts` — el fetch (línea 21) queda:
```typescript
    const res = await fetch(`${WA_URL}/send-reminders/${profile.clinicId}`, {
      method: "POST",
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(30_000),
    });
```

`app/api/whatsapp/bulk/route.ts` — el fetch (línea 109) ya tiene `headers` con Content-Type; agregar el secreto a ese objeto:
```typescript
    const res = await fetch(`${WA_URL}/send-bulk/${profile.clinicId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "",
      },
      body: JSON.stringify({ messages, delayMs }),
      signal: AbortSignal.timeout(290_000),
    });
```

- [ ] **Step 6: Typecheck del dashboard**

Run: `npx tsc --noEmit`
Expected: sin salida (EXIT 0).

- [ ] **Step 7: Typecheck del servicio**

Run: `cd whatsapp-service && npx tsc --noEmit`
Expected: sin salida (EXIT 0).

- [ ] **Step 8: Verificar el handshake localmente**

Agregar temporalmente el secreto generado en el Step 1 al `.env.local` del repo raíz y al `.env` de `whatsapp-service`, reiniciar ambos servicios locales, y probar:

```bash
# Sin header -> debe dar 401
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/status/11111111-1111-1111-1111-111111111111"
# Con header correcto -> debe dar 200 y JSON
curl -s -H "x-wa-service-secret: <EL_SECRETO>" "http://localhost:3001/status/11111111-1111-1111-1111-111111111111"
```
Expected: primer curl imprime `401`; segundo imprime `{"connected":false,"hasQR":false}` (o el estado real).

Nota: en dev local puedes dejar `WA_SERVICE_SECRET` vacío en ambos lados si prefieres no enforcar mientras desarrollas — es retrocompatible. Pero para esta verificación, configúralo en ambos.

- [ ] **Step 9: Commit (NO push sin autorización)**

```bash
git add whatsapp-service/src/index.ts whatsapp-service/.env.example \
  app/api/whatsapp/status/route.ts app/api/whatsapp/qr/route.ts \
  app/api/whatsapp/connect/route.ts app/api/whatsapp/send-reminders/route.ts \
  app/api/whatsapp/bulk/route.ts
git commit -m "feat(whatsapp): secreto compartido para autenticar Vercel->whatsapp-service"
```

Detente aquí y pide autorización a Paulo antes de `git push`. El push dispara el auto-deploy de Vercel, pero Vercel aún no tendrá `WA_SERVICE_SECRET` configurado — sus rutas mandarán el header vacío, lo cual es inofensivo porque el servicio en producción tampoco tendrá el secreto todavía (se activa en Task 6). El rollout es seguro en cualquier orden gracias a la retrocompatibilidad.

---

## Task 2: Crear cuenta Oracle Cloud y la instancia Ampere A1 (manual, Paulo)

**Ejecutor:** Paulo, en el navegador. No es automatizable por un agente. Yo (el agente) guío y espero los datos de salida.

**Deliverable:** una VM Ubuntu 24.04 ARM corriendo en Oracle, con su IP pública y la clave SSH privada descargada.

- [ ] **Step 1: Crear cuenta en Oracle Cloud Free Tier**

Ir a https://www.oracle.com/cloud/free/ → "Start for free". Requiere:
- Email y verificación.
- Tarjeta de crédito/débito **solo para verificar identidad** (Oracle hace un cargo temporal de ~$1 que se revierte; el tier "Always Free" no cobra mientras se use dentro de límites).
- Elegir una **Home Region** cercana (ej. para Bolivia: `Brazil East (São Paulo)` o `US East (Ashburn)`). Ojo: la región no se puede cambiar después.

- [ ] **Step 2: Crear la instancia Compute**

En la consola de Oracle: menú → Compute → Instances → Create Instance.
- **Image:** Canonical Ubuntu 24.04.
- **Shape:** cambiar a "Ampere" → `VM.Standard.A1.Flex`. Asignar 1 OCPU y 6 GB de RAM (sobra; el "Always Free" permite hasta 4 OCPU / 24 GB entre todas las instancias A1).
- Si sale "Out of capacity" en la shape Ampere (común en el free tier), reintentar en otra Availability Domain o más tarde. Es el paso que más puede tardar.

- [ ] **Step 3: Generar y descargar la clave SSH**

En la sección "Add SSH keys" del asistente de creación: elegir "Generate a key pair for me" y **descargar la clave privada** (`.key`). Guardarla en un lugar seguro del disco local (ej. `~/.ssh/oracle_wa.key`). Sin ella no hay acceso al VPS.

- [ ] **Step 4: Anotar la IP pública**

Una vez la instancia esté en estado "Running", copiar su **Public IP address** de la página de detalles.

- [ ] **Step 5: Verificar acceso SSH**

Desde la terminal local (ajustar permisos de la clave primero en Linux/Mac; en Windows/Git Bash normalmente no hace falta):
```bash
ssh -i /ruta/a/oracle_wa.key ubuntu@<IP_PUBLICA>
```
Expected: entra a un prompt `ubuntu@<hostname>:~$`. El usuario por defecto en la imagen Ubuntu de Oracle es `ubuntu`.

Entregar al agente: la IP pública y la ruta local de la clave, para continuar con las tareas por SSH.

---

## Task 3: Setup base del VPS + código + .env (por SSH)

**Ejecutor:** agente por SSH (o Paulo siguiendo los comandos).

**Deliverable:** `whatsapp-service` corre en el VPS en foreground, conecta a Supabase de producción y responde en `localhost:3001` con el guard de secreto activo.

**Interfaces:**
- Consumes: IP pública y clave SSH (Task 2); valor de `WA_SERVICE_SECRET` (Task 1 Step 1); credenciales de producción de Supabase.

- [ ] **Step 1: Instalar Node.js 22 (arm64) y git en el VPS**

Conectado por SSH al VPS:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node --version   # debe imprimir v22.x
```
Expected: `node --version` imprime `v22.x` y `dpkg --print-architecture` imprime `arm64`.

- [ ] **Step 2: Crear una deploy key de solo lectura para clonar el repo privado**

En el VPS:
```bash
ssh-keygen -t ed25519 -C "vps-wa-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
Copiar la clave pública impresa. **Paulo:** en GitHub → repo `clinica_dental` → Settings → Deploy keys → Add deploy key → pegar, título "VPS WhatsApp", dejar "Allow write access" DESMARCADO → Add key.

- [ ] **Step 3: Clonar el repo**

En el VPS:
```bash
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # acepta el host de GitHub
git clone git@github.com:paulinho4835/clinica_dental.git ~/clinica_dental
cd ~/clinica_dental/whatsapp-service
```
Expected: el repo se clona sin pedir contraseña.

- [ ] **Step 4: Instalar dependencias del servicio**

```bash
cd ~/clinica_dental/whatsapp-service
npm install
```
Expected: instala sin errores nativos (todas las deps son JS puro; ARM no es problema).

- [ ] **Step 5: Crear el .env de producción del servicio**

```bash
cd ~/clinica_dental/whatsapp-service
nano .env
```
Contenido (reemplazar los valores reales; el `.env` está en `.gitignore`, no se commitea):
```
SUPABASE_URL=https://lurwdrerpbjqnsamlajk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_de_produccion>
AGENT_WEBHOOK_SECRET=<el mismo AGENT_WEBHOOK_SECRET que ya usa Vercel>
APP_URL=https://<dominio-de-produccion-en-vercel>
WA_SERVICE_SECRET=<el secreto generado en Task 1 Step 1>
```
Nota: `SUPABASE_URL` y las keys se sacan del dashboard de Supabase (Settings → API) de producción. `APP_URL` es la URL pública del dashboard en Vercel (sin barra final). `AGENT_WEBHOOK_SECRET` debe coincidir con el que ya está en Vercel para que el webhook del agente acepte las llamadas del VPS.

- [ ] **Step 6: Prueba en foreground**

```bash
cd ~/clinica_dental/whatsapp-service
npm run start
```
Expected: imprime `🌐 WhatsApp multi-clínica en http://localhost:3001`. En otra sesión SSH:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/status/11111111-1111-1111-1111-111111111111
curl -s -H "x-wa-service-secret: <EL_SECRETO>" http://localhost:3001/status/11111111-1111-1111-1111-111111111111
```
Expected: primer curl `401`; segundo `200` con JSON. Detener con Ctrl-C tras verificar.

---

## Task 4: Cloudflare Tunnel (URL HTTPS pública)

**Ejecutor:** agente por SSH + Paulo para el login de Cloudflare.

**Deliverable:** una URL HTTPS de Cloudflare que enruta a `localhost:3001` del VPS.

- [ ] **Step 1: Instalar cloudflared (arm64) en el VPS**

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```
Expected: imprime la versión de cloudflared.

- [ ] **Step 2: Autenticar con la cuenta Cloudflare**

```bash
cloudflared tunnel login
```
Imprime una URL. **Paulo:** abrir esa URL en el navegador, iniciar sesión en Cloudflare (crear cuenta gratis si no tiene) y autorizar. Si Paulo no tiene un dominio en Cloudflare, este flujo con dominio no aplica — en ese caso usar el modo "quick tunnel" del Step 3-alt.

- [ ] **Step 3: Crear un túnel con nombre (requiere dominio en Cloudflare)**

Si Paulo tiene (o agrega) un dominio a Cloudflare:
```bash
cloudflared tunnel create wa-clinica
cloudflared tunnel route dns wa-clinica wa.<tu-dominio.com>
```
Crear el config `~/.cloudflared/config.yml`:
```yaml
tunnel: wa-clinica
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: wa.<tu-dominio.com>
    service: http://localhost:3001
  - service: http_status:404
```
La URL pública final será `https://wa.<tu-dominio.com>`.

- [ ] **Step 3-alt: Quick tunnel (sin dominio, URL temporal trycloudflare)**

Si NO hay dominio en Cloudflare, usar un quick tunnel (URL `*.trycloudflare.com`, cambia en cada reinicio — solo válido para pruebas, no para producción estable):
```bash
cloudflared tunnel --url http://localhost:3001
```
Imprime una URL `https://algo-random.trycloudflare.com`. **Para producción real se necesita el túnel con nombre del Step 3** (URL estable); el quick tunnel sirve para validar el flujo end-to-end ahora.

- [ ] **Step 4: Verificar el túnel**

Con el servicio corriendo (`npm run start` en otra sesión) y el túnel activo, desde CUALQUIER máquina:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<URL_DEL_TUNEL>/status/11111111-1111-1111-1111-111111111111"
curl -s -H "x-wa-service-secret: <EL_SECRETO>" "https://<URL_DEL_TUNEL>/status/11111111-1111-1111-1111-111111111111"
```
Expected: primer curl `401` (túnel llega, secreto bloquea); segundo `200` con JSON. Esto confirma HTTPS público + secreto funcionando.

---

## Task 5: Persistencia con systemd (servicio + túnel 24/7)

**Ejecutor:** agente por SSH.

**Deliverable:** `whatsapp-service` y `cloudflared` arrancan solos al bootear, se reinician si se caen, y sobreviven un reboot del VPS.

- [ ] **Step 1: Crear la unidad systemd del servicio Node**

```bash
sudo nano /etc/systemd/system/whatsapp-service.service
```
Contenido:
```ini
[Unit]
Description=WhatsApp Service (Baileys + agente IA)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/clinica_dental/whatsapp-service
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Habilitar y arrancar el servicio**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-service
sudo systemctl status whatsapp-service --no-pager
```
Expected: estado `active (running)`.

- [ ] **Step 3: Instalar cloudflared como servicio systemd**

Para el túnel con nombre (Task 4 Step 3):
```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```
Expected: `active (running)`. (Para quick tunnel no aplica: no tiene modo servicio estable; por eso producción necesita túnel con nombre.)

- [ ] **Step 4: Verificar logs sin errores**

```bash
journalctl -u whatsapp-service -n 30 --no-pager
```
Expected: se ve `🌐 WhatsApp multi-clínica en http://localhost:3001` y ningún error de conexión a Supabase.

- [ ] **Step 5: Prueba de reinicio**

```bash
sudo reboot
```
Esperar ~1 min, reconectar por SSH y:
```bash
systemctl is-active whatsapp-service cloudflared
curl -s -H "x-wa-service-secret: <EL_SECRETO>" "https://<URL_DEL_TUNEL>/status/11111111-1111-1111-1111-111111111111"
```
Expected: ambos servicios `active`; el curl responde `200`. Confirma arranque automático tras reboot.

---

## Task 6: Configurar Vercel (URL del túnel + secreto) — requiere autorización de Paulo

**Ejecutor:** Paulo (o agente con autorización explícita), en el dashboard de Vercel.

**Deliverable:** el dashboard en producción alcanza el VPS autenticado.

- [ ] **Step 1: Push del código de Task 1 (si no se hizo)**

Con autorización de Paulo:
```bash
git push
```
Esperar el auto-deploy de Vercel (~2-3 min).

- [ ] **Step 2: Configurar las env vars en Vercel**

En Vercel → proyecto → Settings → Environment Variables (entorno Production):
- `WA_SERVICE_URL` = `https://<URL_DEL_TUNEL>` (la URL estable del túnel con nombre; sin barra final).
- `WA_SERVICE_SECRET` = `<el secreto generado en Task 1 Step 1>` (idéntico al del `.env` del VPS).

- [ ] **Step 3: Redeploy para tomar las nuevas env vars**

En Vercel → Deployments → último deploy → Redeploy (las env vars no se aplican a deploys ya construidos). Esperar a que termine.

- [ ] **Step 4: Verificar desde producción**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<dominio-produccion>/api/whatsapp/status"
```
Expected: `400` (falta sesión/clínica) o `403` — NO `503`. Un `503` significaría que el dashboard no alcanza el VPS (revisar URL/secreto). El código real se valida logueado en el Step de Task 7.

---

## Task 7: Verificación end-to-end en producción

**Ejecutor:** Paulo + agente revisando logs.

**Deliverable:** el agente de IA responde por WhatsApp desde el VPS, en producción.

- [ ] **Step 1: Estado en el dashboard**

Paulo entra al dashboard de producción → Ajustes → WhatsApp de una clínica de prueba (con addon `agente_ia` encendido). El panel ya NO debe mostrar "El servicio WhatsApp no está disponible".

- [ ] **Step 2: Conectar el número**

Escanear el QR que muestra el panel con el WhatsApp del teléfono de la clínica (Ajustes → Dispositivos vinculados → Vincular dispositivo). El panel debe pasar a "conectado".

- [ ] **Step 3: Mensaje real**

Desde otro teléfono, enviar un mensaje al número de la clínica (ej. "Hola, quiero una cita"). El bot debe mostrar "escribiendo..." y luego responder (el delay de composing ya está implementado en `sendMessage`).

- [ ] **Step 4: Confirmar en los logs del VPS**

```bash
journalctl -u whatsapp-service -n 50 --no-pager
```
Expected: se ve el mensaje entrante procesado y ningún error del webhook del agente ni de Supabase.

- [ ] **Step 5: Apagar el servicio local**

Ya no hace falta correr `whatsapp-service` en la máquina de Paulo. Matar el proceso local (puerto 3001) y, si estaba configurado, revertir `WA_SERVICE_URL` en `.env.local` para desarrollo (o apuntarlo al túnel si se quiere probar contra el VPS desde local).

- [ ] **Step 6: Actualizar la memoria del proyecto**

Registrar en la memoria: whatsapp-service ahora vive en un VPS Oracle Ampere A1, expuesto por Cloudflare Tunnel (`<URL>`), gestionado por systemd (`whatsapp-service.service` + `cloudflared`), autenticado con `WA_SERVICE_SECRET`. Deploy de cambios futuros: `git pull` en `~/clinica_dental` del VPS + `sudo systemctl restart whatsapp-service`.

---

## Notas de rollout y seguridad

- **Orden seguro:** por la retrocompatibilidad del secreto (Task 1), no hay ventana de caída. El servicio en el VPS puede enforcar desde el arranque (Task 3); Vercel envía el header vacío hasta Task 6, pero eso solo importa cuando `WA_SERVICE_URL` ya apunta al túnel, cosa que también pasa en Task 6. Antes de eso el dashboard sigue apuntando a donde apuntaba.
- **Actualizaciones futuras del código del agente:** `cd ~/clinica_dental && git pull && cd whatsapp-service && npm install && sudo systemctl restart whatsapp-service`.
- **Pérdida del VPS:** si se recrea la instancia, se re-escanea el QR por clínica (el `auth_info/` no está respaldado — fuera de alcance de este plan).
- **Docker/railway.toml:** quedan sin uso; borrar en un commit aparte una vez confirmado que systemd funciona.
