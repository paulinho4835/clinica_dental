# 🛡️ Respaldos automáticos de la base de datos (Supabase)

Respaldo diario y automático de la base de **producción** hacia OneDrive.
Protege contra el riesgo más real: que un borrado/edición accidental o un bug
elimine pacientes, citas o pagos sin forma de recuperarlos.

> El **esquema** (tablas, funciones, RLS) ya está respaldado en `supabase/migrations/`.
> Estos respaldos cubren lo que falta: **los datos reales**.

---

## Configuración inicial (una sola vez)

### Paso 1 — Obtener la cadena de conexión de producción

1. Entra al dashboard de Supabase → tu proyecto.
2. Arriba a la derecha, botón **"Connect"**.
3. En la pestaña **"Connection string" → "URI"**, elige el modo
   **"Session pooler"** (es compatible con IPv4 y funciona desde casa).
4. Copia la URI. Se ve así:

   ```
   postgresql://postgres.xxxxxxxx:[TU-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

5. Reemplaza `[TU-PASSWORD]` por la contraseña real de la base
   (la que pusiste al crear el proyecto; si no la recuerdas, puedes
   resetearla en **Settings → Database → Reset database password**).

### Paso 2 — Guardar la cadena como variable de entorno del usuario

Esto evita escribir la contraseña dentro del script. Abre PowerShell y ejecuta
(pegando tu URI completa entre comillas):

```powershell
setx SUPABASE_DB_URL "postgresql://postgres.xxxxxxxx:TU-PASSWORD@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

> ⚠️ Cierra y vuelve a abrir PowerShell después de `setx` para que tome la variable.

### Paso 3 — Probar el respaldo manualmente

```powershell
cd "C:\Users\pauli\OneDrive\Escritorio\Sistemas\Clinica Dental-Sistema"
powershell -ExecutionPolicy Bypass -File scripts\backup-supabase.ps1
```

Si todo va bien verás `Respaldo COMPLETADO con éxito` y aparecerá un `.zip`
en `C:\Users\pauli\OneDrive\Backups-ClinicaDental\`.

---

## Paso 4 — Agendar para que corra solo cada noche

Ejecuta este comando **una vez** (crea una tarea de Windows que corre todos
los días a las 2:00 AM):

```powershell
$script = "C:\Users\pauli\OneDrive\Escritorio\Sistemas\Clinica Dental-Sistema\scripts\backup-supabase.ps1"
schtasks /Create /SC DAILY /ST 02:00 /TN "Backup ClinicaDental" `
  /TR "powershell -ExecutionPolicy Bypass -NoProfile -File `"$script`"" /F
```

- Verla:    `schtasks /Query /TN "Backup ClinicaDental"`
- Probarla ya:  `schtasks /Run /TN "Backup ClinicaDental"`
- Borrarla:  `schtasks /Delete /TN "Backup ClinicaDental" /F`

> 💡 La PC debe estar encendida a esa hora. Si suele estar apagada de noche,
> cambia `/ST 02:00` por una hora en la que esté prendida, o agrega
> `/SC DAILY /ST 14:00` (2 PM). Windows ejecutará la tarea perdida al
> encender si configuras "Ejecutar lo antes posible tras un inicio perdido"
> en el Programador de tareas.

---

## 🔁 Cómo RESTAURAR un respaldo (si algún día lo necesitas)

1. Descomprime el `.zip` del día que quieras recuperar. Tendrás 3 archivos:
   `roles.sql`, `schema.sql`, `data.sql`.
2. Para recuperar **solo datos borrados** en la base existente, normalmente
   basta con aplicar `data.sql` (o las filas específicas que necesites).
3. Para reconstruir una base desde cero, aplica en orden:
   `roles.sql` → `schema.sql` → `data.sql` con:

   ```powershell
   supabase db dump          # (referencia)
   # restauración con psql/Supabase contra la base destino:
   # psql "<cadena-de-conexión-destino>" -f roles.sql
   # psql "<cadena-de-conexión-destino>" -f schema.sql
   # psql "<cadena-de-conexión-destino>" -f data.sql
   ```

> Ante una pérdida real, lo más seguro es restaurar a un proyecto Supabase
> **nuevo/de prueba** primero, verificar que los datos están, y recién luego
> decidir cómo reincorporarlos a producción.

---

## Notas

- **Retención:** se conservan los últimos **14 días**. Edita `$RetentionDays`
  en el script para cambiarlo.
- **Costo:** $0. Usa el CLI y Docker que ya tienes; el almacenamiento es tu
  OneDrive.
- **Seguridad:** la contraseña vive solo en la variable de entorno del usuario,
  no en el repositorio. El script NO contiene secretos y es seguro de commitear.
- **Mejora futura recomendada:** cuando el negocio crezca, subir al **plan Pro
  de Supabase ($25/mes)** agrega respaldos diarios automáticos del lado del
  servidor (7 días) + opción de Point-in-Time Recovery. Estos respaldos locales
  seguirían siendo tu segunda red de seguridad, fuera de Supabase.
```
