# Recordatorios por WhatsApp — Guía de configuración

El sistema envía un recordatorio de cita por WhatsApp al paciente usando la
**WhatsApp Cloud API oficial de Meta**. Esta guía explica cómo dejarlo
funcionando en producción.

## Cómo funciona (resumen técnico)

1. Al **agendar una cita**, el sistema ya inserta automáticamente un registro en
   la tabla `appointment_reminders`, programado para 24h antes de la cita
   (o de inmediato si la cita es en menos de 24h).
2. **Vercel Cron** (`vercel.json`) llama cada mañana (09:00 Bolivia) al endpoint
   `/api/cron/reminders`.
3. Ese endpoint busca los recordatorios pendientes cuya hora ya llegó y envía el
   WhatsApp con la plantilla aprobada. Marca cada uno como `sent` o `failed`.

> Solo se envía a **pacientes registrados con teléfono**. Las "consultas
> rápidas" (nombre suelto, sin paciente) no tienen teléfono y se omiten.

---

## Paso 1 — Crear la app de WhatsApp en Meta

1. Entra a <https://developers.facebook.com/> → **My Apps** → **Create App** →
   tipo **Business**.
2. Agrega el producto **WhatsApp**.
3. En **WhatsApp → API Setup** obtienes:
   - **Phone number ID** → variable `WHATSAPP_PHONE_NUMBER_ID`
   - **Temporary access token** (dura 24h, sirve para probar).
4. Para producción, genera un **token permanente**:
   - Crea un *System User* en **Business Settings → Users → System Users**.
   - Asígnale la app de WhatsApp con permiso `whatsapp_business_messaging`.
   - Genera un token sin expiración → variable `WHATSAPP_TOKEN`.

> En modo de prueba puedes enviar a hasta 5 números agregados manualmente sin
> verificar el negocio. Para enviar a cualquier paciente debes completar la
> **verificación del negocio** de Meta.

---

## Paso 2 — Crear la plantilla del mensaje

En **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**:

- **Nombre:** `recordatorio_cita`  (debe coincidir con `WHATSAPP_TEMPLATE`)
- **Categoría:** `UTILITY` (Utilidad)
- **Idioma:** Español → código `es` (debe coincidir con `WHATSAPP_LANG`)
- **Cuerpo** (copia exactamente, con las 4 variables):

```
Hola {{1}} 👋, le recordamos su cita en {{2}} para el {{3}} a las {{4}}.
Por favor confirme su asistencia. Si no puede asistir, avísenos con tiempo. ¡Gracias!
```

Las variables son posicionales y el sistema las llena así:
- `{{1}}` = nombre del paciente
- `{{2}}` = nombre de la clínica
- `{{3}}` = fecha (ej. "lunes, 09 de junio")
- `{{4}}` = hora (ej. "09:00")

> Meta revisa la plantilla (suele tardar de minutos a unas horas). Hasta que
> esté **aprobada**, los envíos fallarán.

---

## Paso 3 — Variables de entorno en Vercel

En **Vercel → tu proyecto → Settings → Environment Variables** agrega:

| Variable | Valor | Notas |
|---|---|---|
| `WHATSAPP_TOKEN` | token permanente | del System User |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número | de API Setup |
| `WHATSAPP_TEMPLATE` | `recordatorio_cita` | opcional (es el default) |
| `WHATSAPP_LANG` | `es` | opcional (es el default) |
| `CRON_SECRET` | una cadena aleatoria larga | protege el endpoint del cron |
| `SUPABASE_SERVICE_ROLE_KEY` | (ya debería existir) | requerido por el cron |

Después de agregarlas, **redeploy** para que tomen efecto.

> Vercel inyecta automáticamente `Authorization: Bearer ${CRON_SECRET}` al llamar
> al cron, por eso el endpoint lo valida.

---

## Paso 4 — Probar manualmente

Con el deploy listo, puedes forzar una corrida del cron:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" \
  https://clinica-dental-one-vert.vercel.app/api/cron/reminders
```

Respuesta esperada:

```json
{ "processed": 3, "sent": 2, "failed": 0, "skipped": 1 }
```

- `sent` = enviados con éxito
- `failed` = error de envío (token vencido, plantilla no aprobada, etc.)
- `skipped` = sin teléfono o cita cancelada

Para una prueba real: crea una cita para **hoy** con un paciente que tenga tu
propio número en el campo teléfono (el recordatorio se programa de inmediato si
la cita es en <24h), y corre el curl.

---

## Notas y límites

- **Frecuencia del cron:** en plan **Hobby** de Vercel el cron corre 1 vez al día
  (configurado a las 09:00 Bolivia = `0 13 * * *` UTC). En plan **Pro** puedes
  subir la frecuencia (ej. cada hora `0 * * * *`) editando `vercel.json` para
  recordatorios más precisos a "24h antes".
- **Costo:** Meta da 1.000 conversaciones de utilidad gratis al mes; después el
  costo por mensaje en Bolivia es bajo (centavos de USD).
- **Cron viejo de Supabase:** la migración `0005_cron.sql` programó un job que
  apunta a una URL local (`kong:8000`) y NO funciona en producción — es inofensivo
  porque nunca se conecta. El envío real lo hace Vercel Cron. Si quieres, puedes
  desactivar el job viejo en Supabase con:
  `select cron.unschedule('send-appointment-reminders');`
