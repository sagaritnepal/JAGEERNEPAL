-- A job reaches the customer's ledger only when it is billed.
--
-- Until now a completed job put its price on the customer's ledger at once (a 'Receivable' line named after the
-- job's service, no bill no.), and a bill made from it later took that line's place (0119). From here a job
-- puts nothing on the ledger of its own: what the customer owes for it is the bill made from it ("Create bill"),
-- with its bill no. A payment recorded on a job still goes on the ledger as soon as it is received.
--
-- Also removes the lines completed jobs already put there - each job that has been billed is on the ledger
-- through its bill; one not billed yet appears once it is.
--
-- Run once in the Supabase SQL Editor. Safe to run more than once. (Self-contained: it does not need 0119.)

-- A job no longer posts what it comes to: only its bill does (sync_sale_to_customer_ledger, 0119/0091).
create or replace function refresh_job_debit(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from customer_ledger_entries where source_type = 'service_request' and source_id = p_request_id;
end;
$$;

create or replace function sync_service_request_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_job_debit(new.id);
  return new;
end;
$$;

-- A job's bill is on the ledger like any other Sale (as 0119 has it), whether or not 0119 was run.
create or replace function sync_sale_to_customer_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from customer_ledger_entries where source_type = 'business_transaction' and source_id = old.id;
    return old;
  end if;

  if new.type = 'sale' and new.customer_id is not null and new.amount > 0 then
    insert into customer_ledger_entries (customer_id, owner_id, entry_type, amount, note, source, source_type, source_id, entry_date)
    values (new.customer_id, new.owner_id, 'debit', new.amount, new.note, 'booking', 'business_transaction', new.id, new.bill_date)
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set amount = excluded.amount, customer_id = excluded.customer_id, note = excluded.note, entry_date = excluded.entry_date;
  else
    delete from customer_ledger_entries where source_type = 'business_transaction' and source_id = new.id;
  end if;
  return new;
end;
$$;

-- The lines completed jobs already put on ledgers.
delete from customer_ledger_entries where source_type = 'service_request';

-- Every job bill to a saved customer is on their ledger (re-runs the trigger above for each).
update business_transactions set amount = amount
 where type = 'sale' and source_type = 'service_request_bill' and customer_id is not null;
