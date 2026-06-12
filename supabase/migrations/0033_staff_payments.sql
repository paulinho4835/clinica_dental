-- Registro de pagos que el administrador realiza al personal de la clínica.
create table staff_payments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid references clinics(id) on delete cascade not null,
  employee_id  uuid references profiles(id) on delete restrict not null,
  amount       numeric(10,2) not null check (amount > 0),
  method       text not null default 'cash',
  concept      text,
  paid_at      date not null default current_date,
  created_at   timestamptz not null default now()
);

alter table staff_payments enable row level security;

-- Solo el admin de la clínica puede leer y escribir.
create policy "staff_payments_admin_all" on staff_payments
  for all to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and clinic_id = staff_payments.clinic_id
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and clinic_id = staff_payments.clinic_id
        and role = 'admin'
    )
  );
