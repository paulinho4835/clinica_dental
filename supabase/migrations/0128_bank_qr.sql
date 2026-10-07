-- Cobro con QR dinámico del banco (Banco Económico, API Market) como addon premium `cobro_qr` (clinics.features).
--
-- * payment_providers: credenciales por clínica. Las secretas (contraseña y cuenta, ya cifradas con
--   la llave AES del banco, y la propia llave) solo las lee el servidor de Next con service_role.
-- * qr_payments: cada QR pedido al banco con su monto, estado y quién pagó. Su id es el transactionId.
-- * Solo el superadmin enciende el addon: un trigger impide que el administrador de la clínica
--   cambie `features.cobro_qr` desde el navegador (la política clinics_update le permite actualizar su clínica).

create table if not exists public.payment_providers (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  provider text not null default 'baneco' check (provider in ('baneco')),
  environment text not null default 'certification' check (environment in ('certification', 'production')),
  enabled boolean not null default true,
  username text not null check (length(trim(username)) between 1 and 80),
  password_encrypted text not null,
  aes_key text not null,
  account_encrypted text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{1,4}$'),
  currency text not null default 'BOB' check (currency in ('BOB', 'USD')),
  branch_code text check (branch_code is null or length(branch_code) between 1 and 5),
  token text,
  token_expires_at timestamptz,
  verified_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.payment_providers enable row level security;
revoke all on public.payment_providers from anon, authenticated;
grant all on public.payment_providers to service_role;

create table if not exists public.qr_payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid,
  provider text not null default 'baneco',
  environment text not null,
  qr_id text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'BOB',
  description text check (description is null or length(description) <= 120),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'error')),
  error_message text,
  payer_name text,
  payer_bank_code text,
  payer_account text,
  bank_transaction_id text,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists qr_payments_provider_qr_idx on public.qr_payments(provider, qr_id) where qr_id is not null;
create index if not exists qr_payments_clinic_created_idx on public.qr_payments(clinic_id, created_at desc);
alter table public.qr_payments enable row level security;
drop policy if exists qr_payment_read on public.qr_payments;
create policy qr_payment_read on public.qr_payments for select using (clinic_id = (select auth_clinic_id()));
revoke all on public.qr_payments from anon, authenticated;
grant select on public.qr_payments to authenticated;
grant all on public.qr_payments to service_role;

-- Solo service_role (el panel de superadmin) o un superadmin pueden cambiar el addon premium.
create or replace function public.guard_premium_features()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.features ->> 'cobro_qr', '') is distinct from coalesce(old.features ->> 'cobro_qr', '')
     and coalesce(auth.role(), '') <> 'service_role'
     and not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'Solo el superadmin puede activar o desactivar el cobro QR dinámico.';
  end if;
  return new;
end; $$;

drop trigger if exists clinics_guard_premium_features on public.clinics;
create trigger clinics_guard_premium_features before update of features on public.clinics
  for each row execute function public.guard_premium_features();
