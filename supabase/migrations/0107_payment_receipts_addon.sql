-- Recibos no fiscales de pagos. Cada fila conserva una copia de los datos
-- emitidos para que una edición posterior del trabajo no cambie el documento.
create table public.payment_receipts (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  payment_id          uuid not null unique references public.payments(id) on delete cascade,
  patient_id          uuid not null references public.patients(id) on delete restrict,
  receipt_number      bigint generated always as identity unique,
  patient_name        text not null,
  patient_national_id text,
  description         text not null,
  amount              numeric(12,2) not null check (amount > 0),
  currency            text not null default 'Bs',
  payment_method      text not null,
  issued_at           timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index idx_payment_receipts_clinic_issued
  on public.payment_receipts(clinic_id, issued_at desc);

alter table public.payment_receipts enable row level security;

create policy payment_receipts_tenant_select on public.payment_receipts
  for select using (clinic_id = (select public.auth_clinic_id()));

create policy payment_receipts_tenant_insert on public.payment_receipts
  for insert with check (clinic_id = (select public.auth_clinic_id()));

-- No hay policies UPDATE/DELETE: un recibo emitido no se edita. Si se revierte
-- el pago, el cascade elimina también su recibo porque deja de representar un
-- cobro vigente.
