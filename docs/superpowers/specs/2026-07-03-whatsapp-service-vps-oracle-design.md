# Despliegue de whatsapp-service en un VPS de Oracle Cloud Free Tier

## Contexto

`whatsapp-service` (Baileys + agente de IA por WhatsApp) hoy corre en la
máquina local de Paulo. Necesita estar prendido 24/7 con una conexión
persistente a WhatsApp, cosa que un entorno serverless (Vercel) no soporta.
El resto del sistema (Next.js) sigue funcionando bien en Vercel y no se toca.

## Alcance

- **Se muda:** solo `whatsapp-service` (carpeta `whatsapp-service/` del repo).
- **No se muda:** el dashboard Next.js, que sigue en Vercel con su
  auto-deploy desde GitHub actual.
- **No se automatiza en esta fase:** backup del `auth_info/` (credenciales de
  sesión de WhatsApp) a un storage externo. Si el VPS se pierde, se
  re-escanea el QR por clínica. Puede ser un addon aparte más adelante.
- **Docker y `railway.toml`** existentes en el repo quedan sin usar (un
  intento previo de deploy en Railway que no se completó). Se pueden borrar
  una vez confirmado que el nuevo despliegue funciona.

## Arquitectura

```
Vercel (Next.js, dashboard)
        │  HTTPS (con header x-wa-service-secret)
        ▼
Cloudflare Tunnel  (URL pública HTTPS, sin abrir puertos en el VPS)
        │  localhost
        ▼
whatsapp-service (Node/tsx, gestionado por systemd)
en Oracle Cloud VPS — Ubuntu 24.04, shape Ampere A1 (ARM, "always free")
        │  HTTPS
        ▼
Vercel /api/whatsapp/agent  (webhook del agente, ya tiene su propio secreto
                              AGENT_WEBHOOK_SECRET, no cambia)
```

### Por qué Oracle Ampere A1 (ARM)

Es la única shape "siempre gratis" de Oracle con recursos generosos (hasta 4
OCPU / 24 GB RAM repartibles entre instancias). Las dependencias de
`whatsapp-service` (`@whiskeysockets/baileys`, `@supabase/supabase-js`,
`node-cron`, `pino`, `qrcode`) son JS puro sin binarios nativos compilados,
así que ARM64 no presenta ningún problema de compatibilidad.

### Por qué Cloudflare Tunnel en vez de abrir puertos

Oracle Cloud tiene fama de confundir a la gente con DOS capas de firewall
simultáneas: la Security List de la consola web Y el `iptables`/`firewalld`
del propio Ubuntu — hay que abrir el puerto en ambos lados o parece que "no
funciona" sin pista de por qué. Cloudflare Tunnel evita el problema por
completo: no se abre ningún puerto entrante, el túnel inicia la conexión
saliente desde el VPS hacia Cloudflare, y de paso da HTTPS gratis y oculta la
IP real del servidor. Requiere una cuenta gratuita de Cloudflare (sin
necesidad de tener el dominio ya comprado; Cloudflare puede dar una URL
`*.trycloudflare.com` de prueba, o se usa un dominio propio si Paulo
consigue uno más adelante).

### Por qué systemd en vez de Docker o PM2

`whatsapp-service` es un único proceso Node de larga duración. `systemd` es
nativo de Linux (sin dependencia extra que instalar), reinicia el proceso
solo si se cae, lo arranca solo si el VPS reinicia, y los logs quedan
disponibles con `journalctl -u whatsapp-service`. Docker añadiría la
complejidad de gestionar un volumen persistente para `auth_info/` sin
necesidad real; PM2 es una herramienta más a mantener sin aportar algo que
systemd no dé ya.

## Seguridad: secreto compartido Vercel ↔ whatsapp-service

**Problema encontrado durante el diseño:** las 5 rutas que Next.js usa para
hablar con `whatsapp-service` (`/status/:clinicId`, `/qr-data/:clinicId`,
`/connect/:clinicId`, `/disconnect/:clinicId`, `/send-reminders/:clinicId`,
`/send-bulk/:clinicId`) no llevan ningún tipo de autenticación. Hoy no
importa porque todo corre en `localhost`; en cuanto el servicio tenga una
URL pública (aunque sea vía túnel), cualquiera que la descubra podría
conectar/desconectar el WhatsApp de una clínica o disparar un envío masivo
sin permiso.

**Solución:** un nuevo secreto compartido, mismo patrón que ya existe para
la dirección opuesta (`AGENT_WEBHOOK_SECRET` / header `x-agent-secret` en
`whatsapp-service/src/index.ts:193,209`):

- Nueva env var `WA_SERVICE_SECRET` (valor aleatorio largo), configurada
  tanto en Vercel (todas las rutas de `app/api/whatsapp/*.ts`) como en el
  `.env` del VPS.
- `whatsapp-service` valida un header `x-wa-service-secret` en **todas** las
  rutas HTTP entrantes (excepto quizás un healthcheck simple sin datos
  sensibles, a decidir en el plan) y responde 401 si no coincide.
- Las funciones `fetch` en `app/api/whatsapp/status/route.ts`,
  `qr/route.ts`, `connect/route.ts`, `send-reminders/route.ts` y
  `bulk/route.ts` agregan el header en cada llamada.

## Flujo de despliegue

### Fase manual (Paulo, en el navegador — no automatizable)

1. Crear cuenta en Oracle Cloud Free Tier (requiere tarjeta para verificar
   identidad; el free tier no cobra mientras se use dentro de los límites
   "always free").
2. Crear una instancia Compute con shape **VM.Standard.A1.Flex** (Ampere
   ARM), imagen Ubuntu 24.04, y descargar la clave SSH privada generada.
3. Anotar la IP pública de la instancia.

### Fase remota (yo, por SSH, una vez exista la instancia)

4. Conectar por SSH con la clave descargada.
5. Instalar Node.js 22 LTS y git.
6. Clonar el repo (o copiar solo `whatsapp-service/`) al VPS.
7. Crear `whatsapp-service/.env` en el VPS con `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_WEBHOOK_SECRET`, `APP_URL` (la URL de
   producción del dashboard en Vercel) y el nuevo `WA_SERVICE_SECRET`.
8. Instalar `cloudflared`, autenticar y crear el túnel hacia
   `localhost:3001`.
9. Crear el archivo de unidad `systemd` (`whatsapp-service.service`) que
   corre `npm run start` (o `tsx src/index.ts` directo) con
   `Restart=always`, y habilitarlo (`systemctl enable --now`).
10. Verificar `journalctl -u whatsapp-service -f` sin errores y que
    `curl localhost:3001/status/<clinic_id>` responda.

### Fase de código (yo, en este repo)

11. Agregar la verificación de `WA_SERVICE_SECRET` en
    `whatsapp-service/src/index.ts`.
12. Agregar el header `x-wa-service-secret` en las 5 rutas de
    `app/api/whatsapp/*.ts` que llaman al servicio.
13. Actualizar `WA_SERVICE_URL` y `WA_SERVICE_SECRET` en las env vars de
    Vercel (producción) apuntando a la URL del túnel de Cloudflare.

### Verificación conjunta

14. Desde el dashboard en producción (Ajustes → WhatsApp de una clínica de
    prueba), confirmar que el estado ya no dice "servicio no disponible".
15. Reconectar el WhatsApp de esa clínica escaneando el QR.
16. Mandar un mensaje real al número y confirmar que el agente de IA
    responde (con el delay de "escribiendo..." ya implementado).
17. Confirmar en `journalctl` que no hay errores tras el mensaje real.

## Fuera de alcance

- Migrar el dashboard Next.js fuera de Vercel.
- Backup automático de `auth_info/` a almacenamiento externo.
- Alta disponibilidad / múltiples instancias del VPS (una sola instancia es
  suficiente para el volumen actual).
- Monitoreo/alertas si el VPS se cae (se puede agregar después, ej. con el
  mismo patrón de `/api/health` que ya existe para el dashboard).
