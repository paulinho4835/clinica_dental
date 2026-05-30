-- ============================================================================
-- seed.sql — Datos demo (corre con `supabase db reset`)
-- 2 clínicas para PROBAR el aislamiento RLS + usuarios por rol.
-- Login demo: <email> / password123
-- IDs literales (no variables psql: lo corre el batch sender de Supabase, no psql)
--   Clínica A = 11111111-1111-1111-1111-111111111111
--   Clínica B = 22222222-2222-2222-2222-222222222222
-- ============================================================================

insert into clinics (id, name, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica Dental Sonrisa', 'America/Mexico_City'),
  ('22222222-2222-2222-2222-222222222222', 'Dental Norte', 'America/Mexico_City');

-- ----------------------------------------------------------------------------
-- Usuarios auth + identidades (login por email/contraseña)
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_pwd text := crypt('password123', gen_salt('bf'));
begin
  for r in
    select * from (values
      ('aaaaaaa1-0000-0000-0000-000000000001'::uuid, 'admin@sonrisa.com',     '11111111-1111-1111-1111-111111111111'::uuid, 'admin',              'Ana Admin'),
      ('aaaaaaa1-0000-0000-0000-000000000002'::uuid, 'recepcion@sonrisa.com', '11111111-1111-1111-1111-111111111111'::uuid, 'recepcionista',      'Rita Recepción'),
      ('aaaaaaa1-0000-0000-0000-000000000003'::uuid, 'doctor@sonrisa.com',    '11111111-1111-1111-1111-111111111111'::uuid, 'odontologo_general', 'Dr. Gómez'),
      ('bbbbbbb2-0000-0000-0000-000000000001'::uuid, 'admin@dentalnorte.com', '22222222-2222-2222-2222-222222222222'::uuid, 'admin',              'Beto Admin')
    ) as t(uid, email, clinic, role, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', r.uid, 'authenticated', 'authenticated', r.email, v_pwd,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
    ) values (
      gen_random_uuid(), r.uid, r.uid::text,
      jsonb_build_object('sub', r.uid::text, 'email', r.email),
      'email', now(), now(), now()
    );

    insert into public.profiles (id, clinic_id, role, full_name)
    values (r.uid, r.clinic, r.role::app_role, r.name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Datos clínicos demo — Clínica A
-- ----------------------------------------------------------------------------
insert into operatories (id, clinic_id, name) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sillón 1'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Sillón 2');

insert into patients (id, clinic_id, full_name, dob, phone, allergies, medical_alerts) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'María López',   '1990-04-12', '5551234567', '{"penicilina"}', '{"Anticoagulado"}'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Juan Pérez',    '1985-11-03', '5559876543', '{}', '{}');

-- Odontograma demo (JSONB) — sin una sola imagen.
insert into odontograms (clinic_id, patient_id, teeth) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', '{
     "16": {"present": true,  "whole": null,        "surfaces": {"O":"caries","M":"sano","D":"resina","V":"sano","L":"sano"}},
     "21": {"present": true,  "whole": "endodoncia", "surfaces": {"O":"sano","M":"sano","D":"sano","V":"sano","L":"sano"}},
     "36": {"present": false, "whole": "ausente",    "surfaces": {}}
   }'::jsonb);

insert into procedure_catalog (clinic_id, code, name, base_price, default_commission_pct, specialty) values
  ('11111111-1111-1111-1111-111111111111', 'RES01', 'Resina simple',        800.00,  20, 'general'),
  ('11111111-1111-1111-1111-111111111111', 'ENDO01','Endodoncia unirradicular', 2500.00, 30, 'endodoncia'),
  ('11111111-1111-1111-1111-111111111111', 'LIMP01','Limpieza dental',      600.00,  15, 'general');

insert into inventory_items (clinic_id, name, category, unit, min_stock, current_stock) values
  ('11111111-1111-1111-1111-111111111111', 'Resina A2',       'restauración', 'jeringa', 5,  3),   -- bajo mínimo (alerta)
  ('11111111-1111-1111-1111-111111111111', 'Anestesia lidocaína', 'anestesia','cartucho', 20, 50),
  ('11111111-1111-1111-1111-111111111111', 'Guantes M',       'protección',   'caja',    4,  10);

insert into inventory_batches (clinic_id, item_id, lot, expiry_date, quantity)
select '11111111-1111-1111-1111-111111111111', id, 'LOTE-2026A', '2026-08-01', current_stock
from inventory_items where clinic_id = '11111111-1111-1111-1111-111111111111' and name = 'Anestesia lidocaína';
