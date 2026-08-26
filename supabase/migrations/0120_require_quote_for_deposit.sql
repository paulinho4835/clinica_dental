-- Un adelanto siempre debe tener una cotización que permita calcular el saldo
-- y vincular el cobro a un tratamiento con valor definido.
create or replace function public.validate_appointment_finance_values()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.deposit, 0) > 0 and coalesce(new.consult_price, 0) <= 0 then
    raise exception 'appointment_quote_required' using
      errcode = '22023',
      message = 'La cotización es obligatoria cuando registras un adelanto.';
  end if;
  if coalesce(new.deposit, 0) > coalesce(new.consult_price, 0) then
    raise exception 'appointment_deposit_exceeds_quote' using
      errcode = '22023',
      message = 'El adelanto no puede ser mayor que la cotización.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_appointment_finance_values
  on public.appointments;
create trigger trg_validate_appointment_finance_values
before insert or update of consult_price, deposit
on public.appointments
for each row
execute function public.validate_appointment_finance_values();

notify pgrst, 'reload schema';
