# WhatsApp (Baileys) en Railway — Estado y pasos para continuar

> Última actualización: 2026-06-09. Servicio de recordatorios por WhatsApp usando
> Baileys, desplegado en Railway, integrado con la app Next.js en Vercel.

## Arquitectura (cómo fluye todo)

```
Agenda (Vercel)                Next.js API              Railway (whatsapp-service)
[Botón "Recordatorios          /api/whatsapp/           POST /send-reminders
 WhatsApp"]            ───►     send-reminders   ───►    → lee Supabase (citas pendientes)
                               (usa WA_SERVICE_URL)      → envía por Baileys (WhatsApp)
```

- Botón: `components/agenda/AgendaShell.tsx:109` → llama a `/api/whatsapp/send-reminders`
- API route: `app/api/whatsapp/send-reminders/route.ts` → reenvía a `${WA_SERVICE_URL}/send-reminders`
- Servicio Baileys: `whatsapp-service/src/index.ts` (HTTP server + cron 09:00 Bolivia)
- Lógica de recordatorios: `whatsapp-service/src/reminders.ts` (consulta Supabase)

## Estado actual (qué YA funciona)

- ✅ Servicio en Railway **Online**. Proyecto Railway: `patient-learning` / entorno `production`.
- ✅ Servicio Railway: **invigorating-analysis** (el otro, `clinica_dental`, es distinto).
- ✅ URL pública: `https://invigorating-analysis-production-1e85.up.railway.app`
  - `/qr` → página HTML con el QR (responde HTTP 200 verificado)
  - `POST /send-reminders` → dispara el envío
- ✅ WhatsApp **conectado** (QR escaneado el 2026-06-09).
- ✅ Fix Node 22: el Dockerfile usaba `node:20-slim`, que NO trae WebSocket nativo
  y `supabase-js` (realtime-js) crasheaba al crear el cliente. Cambiado a `node:22-slim`.
  Commit `fb393d6` en `main`.
- ✅ Variables en Railway (servicio invigorating-analysis), correctas:
  - `SUPABASE_URL` = `https://lurwdrerpbjqnsamlajk.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` = (configurada)
  - `WA_PORT` = 3001 (el código prioriza `PORT` que inyecta Railway; WA_PORT es fallback)
  - (Sobran `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — no se usan, no estorban)

## PENDIENTE para terminar

### 1. Configurar `WA_SERVICE_URL` en Vercel  ⬅️ ESTE ES EL PASO QUE FALTA
Sin esta variable, la app de Vercel intenta `http://localhost:3001` y devuelve el error
"Servicio WhatsApp no disponible. ¿Está corriendo whatsapp-service?".

- Proyecto Vercel: **clinica-dental** (dominio `clinica-dental-one-vert.vercel.app`)
- Ir a: Vercel → sidebar izquierdo → **Environment Variables**
- Agregar:
  | Key | Value |
  |-----|-------|
  | `WA_SERVICE_URL` | `https://invigorating-analysis-production-1e85.up.railway.app` |
  (sin `/` final, con `https://`, marcar Production)
- **Redeploy obligatorio**: Deployments → último deploy → ⋮ → Redeploy
  (las env vars nuevas NO aplican a deploys existentes)

### 2. Probar
Agenda → botón "Recordatorios WhatsApp". Debe enviar a pacientes con cita pendiente.
Los logs de Railway (Deploy Logs) muestran `✅ número — nombre` por cada envío.

## Riesgos / deuda conocida

- ⚠️ **Rotar `SUPABASE_SERVICE_ROLE_KEY`**: quedó visible en una captura de pantalla.
  Es la llave maestra (ignora RLS, acceso total a la BD). Rotar en
  Supabase → Project Settings → API → reset service_role key, y actualizar en Railway.
- 📌 **Disco efímero en Railway**: la sesión de Baileys se guarda en `auth_info/` (local).
  En cada redeploy del servicio se borra → habrá que **re-escanear el QR** en `/qr`.
  Para persistir: montar un volumen en Railway o guardar credenciales en Supabase.

## PENDIENTE FUTURO — Multi-clínica (número de WhatsApp por clínica)

Requisito: cada clínica tiene su propio número de WhatsApp. El servicio actual maneja
**una sola sesión Baileys** (una carpeta `auth_info/`, un número). Hay que hacerlo multi-número.

### Opciones

1. **Una sesión por clínica dentro del mismo servicio** (recomendada para Baileys)
   - `Map<clinic_id, socket>`; una carpeta de auth por clínica (`auth_info/<clinic_id>/`).
   - `/qr` pasa a ser por clínica: `/qr?clinic=<id>` (cada clínica escanea su propio QR).
   - Al enviar, elegir el socket según el `clinic_id` de la cita.
   - **Persistencia es crítica**: N sesiones que no se pueden perder en cada redeploy →
     montar volumen en Railway o guardar el auth state en Supabase (tabla `wa_sessions`).
   - Un solo deploy, escala razonable. Más código.

2. **Un servicio Railway por clínica**
   - Sin cambios de código, pero N deploys, N URLs, N juegos de variables. Costoso y tedioso.

3. **Pasar a Meta Cloud API oficial** (ya existe el camino en el repo: `lib/whatsapp.ts`)
   - Multi-número nativo: cada clínica = su `WHATSAPP_PHONE_NUMBER_ID`.
   - Más "correcto" y estable, pero requiere verificación de Meta Business por número
     y plantillas aprobadas. Ver `docs/WHATSAPP-SETUP.md`.

### Trabajo previo a verificar (base de datos)
- Confirmar que `appointment_reminders` / `appointments` lleven `clinic_id` para poder
  enrutar cada recordatorio al número correcto. Hoy `reminders.ts` ya hace join a `clinics(name)`
  pero NO filtra ni enruta por clínica — envía todo desde el único número conectado.
- Definir cómo se mapea cada clínica a su número/sesión.

### Decisión pendiente
Elegir entre opción 1 (Baileys multi-sesión + persistencia) y opción 3 (Meta Cloud API).
Recomendación inicial: si el volumen es bajo y se quiere gratis/rápido → opción 1;
si se quiere estabilidad/oficial a largo plazo → opción 3.

## Notas técnicas

- Hay DOS caminos de WhatsApp en el repo:
  1. **Baileys** (este, no oficial, gratis) → `whatsapp-service/` + `/api/whatsapp/send-reminders`
  2. **Meta Cloud API** (oficial) → `lib/whatsapp.ts` + `app/api/cron/reminders/route.ts`
     (usa `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`; ver `docs/WHATSAPP-SETUP.md`)
  El botón de la agenda usa el camino **Baileys**.
- `whatsapp-service` está excluido del tsconfig de Next.js (`tsconfig.json` → exclude).
- Arranque del servicio: `npx tsx src/index.ts` (Dockerfile CMD). Cron diario 09:00 America/La_Paz.
