-- A job's bill is its sale - never a second one.
--
-- When a job with no saved customer was marked paid, the payment sync (0078) wrote a Sale of its own
-- for the money (source_type 'service_request_payment': a walk-in paid on the spot). A bill made from
-- that job ("Create bill", source_type 'service_request_bill') is a Sale too, so the job was in the
-- Sales report twice, and the money counted twice as received.
--
-- From here:
--   1. A bill made out to a saved customer gives its job that customer, when the job had none. The job
--      then puts what is owed on the customer's ledger and its payment as a receipt there - and the
--      walk-in Sale the payment had written is removed (the payment sync now also runs when a job's
--      customer changes).
--   2. A bill to nobody saved (a walk-in bill) is itself the sale paid on the spot, so the job's own
--      walk-in Sale is removed, and none is written again for a job that has a bill.
--   3. Both are applied once to the bills already made.
--
-- Run once in the Supabase SQL Editor. Safe to run more than once.

-- A sale bill made from this job (as its first job, or one of several it covers).
create or replace function job_has_bill(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_transactions b
     where b.type = 'sale' and b.source_type = 'service_request_bill'
       and (b.source_id = p_request_id or p_request_id = any (b.source_job_ids))
  );
$$;

-- 0078's payment sync, plus: a job with no customer that has a bill books no Sale of its own.
create or replace function sync_service_request_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_total numeric;
  booked numeric;
begin
  job_total := service_request_amount(new.id, new.quoted_price);
  booked := case
    when new.payment_status = 'paid' then job_total
    when new.payment_status = 'partial' then least(coalesce(new.amount_paid, 0), coalesce(job_total, coalesce(new.amount_paid, 0)))
    else 0
  end;

  if booked is null or booked <= 0 or new.reseller_id is null then
    delete from customer_ledger_entries where source_type = 'service_request_payment' and source_id = new.id;
    delete from business_transactions where source_type = 'service_request_payment' and source_id = new.id;
    return new;
  end if;

  if new.customer_id is not null then
    delete from business_transactions where source_type = 'service_request_payment' and source_id = new.id;
    insert into customer_ledger_entries (customer_id, owner_id, entry_type, amount, note, source, source_type, source_id)
    values (new.customer_id, new.reseller_id, 'credit', booked, new.issue_type, 'booking', 'service_request_payment', new.id)
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set amount = excluded.amount, customer_id = excluded.customer_id;
  elsif job_has_bill(new.id) then
    -- The walk-in bill made from the job is the sale, paid on the spot.
    delete from customer_ledger_entries where source_type = 'service_request_payment' and source_id = new.id;
    delete from business_transactions where source_type = 'service_request_payment' and source_id = new.id;
  else
    delete from customer_ledger_entries where source_type = 'service_request_payment' and source_id = new.id;
    insert into business_transactions (owner_id, type, amount, note, party_name, source_type, source_id)
    values (new.reseller_id, 'sale', booked, new.issue_type, new.customer_name, 'service_request_payment', new.id)
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set amount = excluded.amount;
  end if;

  return new;
end;
$$;

-- Also when the job's customer changes (step 1 sets it).
drop trigger if exists service_requests_sync_payment on service_requests;
create trigger service_requests_sync_payment
  after update of payment_status, customer_id on service_requests
  for each row execute function sync_service_request_payment();

-- A bill made from a job settles which sale the job has.
create or replace function job_bill_takes_over_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jobs uuid[];
begin
  if new.type <> 'sale' or coalesce(new.source_type, '') <> 'service_request_bill' then
    return new;
  end if;
  jobs := array_remove(array_append(coalesce(new.source_job_ids, '{}'), new.source_id), null);
  if new.customer_id is not null then
    -- The job takes the bill's customer; its triggers move the debit and the payment onto their ledger.
    update service_requests set customer_id = new.customer_id
     where id = any (jobs) and customer_id is null;
  else
    delete from business_transactions
     where source_type = 'service_request_payment'
       and source_id in (select id from service_requests where id = any (jobs) and customer_id is null);
  end if;
  return new;
end;
$$;

drop trigger if exists business_transactions_job_bill_sale on business_transactions;
create trigger business_transactions_job_bill_sale
  after insert or update of source_type, source_id, source_job_ids, customer_id, type on business_transactions
  for each row execute function job_bill_takes_over_sale();

-- 3. The bills already made. (Touching the columns fires the trigger above for each.)
update business_transactions set source_type = source_type
 where type = 'sale' and source_type = 'service_request_bill';

-- What is left: a walk-in Sale written for a job that a bill now covers.
delete from business_transactions p
 where p.source_type = 'service_request_payment'
   and job_has_bill(p.source_id)
   and exists (select 1 from service_requests sr where sr.id = p.source_id and sr.customer_id is null);
