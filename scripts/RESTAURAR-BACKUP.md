# 🔁 Cómo restaurar un respaldo de la base de datos

Los respaldos están en `C:\Users\pauli\OneDrive\Backups-ClinicaDental\`
como archivos `.zip` con fecha (ej. `2026-06-12_2000.zip`).

Cada `.zip` contiene 3 archivos de texto plano:
- `roles.sql` — usuarios de la base (raramente necesario)
- `schema.sql` — estructura: tablas, funciones, políticas RLS
- `data.sql` — **todos los datos**: pacientes, citas, pagos, odontogramas

---

## Caso 1: Se borró un paciente, cita o registro accidentalmente
> 🕐 Tiempo estimado: 5 minutos

1. Abre la carpeta `C:\Users\pauli\OneDrive\Backups-ClinicaDental\`
2. Abre el `.zip` del **día anterior** al problema (o el más reciente antes del error)
3. Extrae `data.sql` y ábrelo con VS Code o Notepad++
4. Busca con `Ctrl+F` el nombre del paciente o palabra clave (ej. `Juan Pérez`)
5. Encuentra la línea `INSERT INTO patients (...) VALUES (...)` correspondiente
6. Copia esa línea completa
7. Ve al **SQL Editor de Supabase** (dashboard → SQL Editor)
8. Pega y ejecuta

Si se borraron varios registros relacionados (paciente + sus citas + sus pagos),
busca el `id` del paciente primero y luego busca ese mismo UUID en todo el archivo
para recuperar todos sus registros relacionados.

---

## Caso 2: Se corrompieron datos de una tabla entera
> 🕐 Tiempo estimado: 15-30 minutos

Por ejemplo: un bug actualizó mal 100 citas a la vez.

1. Extrae `data.sql` del backup anterior al problema
2. En el SQL Editor de Supabase, primero borra los registros dañados:
   ```sql
   -- Ejemplo: borrar todas las citas de una fecha específica que quedaron mal
   DELETE FROM appointments WHERE created_at::date = '2026-06-12';
   ```
3. Del `data.sql`, copia todos los `INSERT INTO appointments` del rango afectado
4. Pégalos y ejecuta en el SQL Editor

---

## Caso 3: Pérdida total (proyecto eliminado o corrupción grave)
> 🕐 Tiempo estimado: 30-60 minutos
> ⚠️ Primero restaurar en un proyecto de PRUEBA, verificar, y luego decidir

### Paso 1 — Crear un proyecto nuevo en Supabase
- Ir a supabase.com → New project
- Anotar la nueva cadena de conexión (Session pooler)

### Paso 2 — Extraer el backup
Descomprime el `.zip` más reciente. Tendrás `roles.sql`, `schema.sql`, `data.sql`.

### Paso 3 — Restaurar el esquema
En el SQL Editor del proyecto nuevo, ejecuta el contenido de `schema.sql` completo.
Esto recrea todas las tablas, funciones, triggers y políticas RLS.

### Paso 4 — Restaurar los datos
Ejecuta el contenido de `data.sql` completo en el SQL Editor.

> 💡 Si el archivo es muy grande para el SQL Editor, usar `psql`:
> ```
> psql "postgresql://postgres.XXXX:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres" -f schema.sql
> psql "postgresql://postgres.XXXX:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres" -f data.sql
> ```

### Paso 5 — Actualizar variables de entorno en Vercel
Si el proyecto de Supabase es nuevo, actualizar en Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Y redesplegar la app.

---

## Referencia rápida: estructura del data.sql

El archivo tiene secciones por tabla, ordenadas para respetar las claves foráneas:

```
-- clinics
INSERT INTO public.clinics ...

-- profiles (usuarios/doctores)
INSERT INTO public.profiles ...

-- patients (pacientes)
INSERT INTO public.patients ...

-- appointments (citas)
INSERT INTO public.appointments ...

-- treatments (tratamientos)
INSERT INTO public.treatments ...

-- payments (pagos)
INSERT INTO public.payments ...

-- odontogram_teeth (odontogramas)
INSERT INTO public.odontogram_teeth ...
```

Para encontrar un registro rápido: `Ctrl+F` por nombre, teléfono, carnet, o UUID.

---

## ¿Cuántos días atrás puedo ir?

El script conserva los últimos **14 días** de respaldos.
Si necesitas ir más atrás y no tienes el archivo, no hay recuperación posible
(por eso es importante no saltarse días de backup).

Para aumentar la retención, editar `$RetentionDays = 14` en `scripts\backup-supabase.ps1`.
