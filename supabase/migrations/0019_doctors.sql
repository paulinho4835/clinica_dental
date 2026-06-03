-- Tabla de doctores de la clínica (independiente de cuentas de usuario).
CREATE TABLE doctors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  specialty  text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation" ON doctors
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Columna en treatment_items que apunta al doctor de la tabla doctors.
ALTER TABLE treatment_items
  ADD COLUMN doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL;
