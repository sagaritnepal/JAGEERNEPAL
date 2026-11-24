-- A bill made from a job goes on the customer's ledger.
--
-- Until now a job's bill ("Create bill", source_type 'service_request_bill') put nothing on the ledger
-- (0091): the job itself was meant to, when it was completed. But a job only does that with a price
-- (quoted_price, or its parts and labor) and a saved customer - so a job billed without a price on the
-- job (the price is on the bill) never reached the ledger at all.
--
-- From here the bill is what the customer owes for the job:
--   1. A job's bill posts its own amount to the customer's ledger, like any other Sale bill, dated the
--      bill date (the ledger shows the bill's number from the bill).
--   2. A job billed to a saved customer posts nothing of its own - so nothing is owed twice. A walk-in
--      bill leaves the job's own entry as it is; deleting the bill brings it back.
--   3. Applied once to every bill already made from a job.
--
-- Run once in the Supabase SQL Editor (after 0118). Safe to run more than once.

-- What a job (with no bill) puts on its customer's ledger: what it comes to, once it is complete.
create or replace function refresh_job_debit(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req service_requests%rowtype;
  amount numeric;
begin
  select * into req from service_requests where id = p_request_id;
  if not found then return; end if;
  amount := service_request_amount(req.id, req.quoted_price);
  -- A bill to a saved customer made from this job is what they owe for it.
  if exists (
       select 1 from business_transactions b
        where b.type = 'sale' and b.source_type = 'service_request_bill' and b.customer_id is not null
          and (b.source_id = req.id or req.id = any (b.source_job_ids))
     )
     or req.customer_id is null or amount is null or amount <= 0 or req.status <> 'resolved' then
    delete from customer_ledger_entries where source_type = 'service_request' and source_id = req.id;
    return;
  end if;
  insert into customer_ledger_entries (customer_id, owner_id, entry_type, amount, note, source, source_type, source_id)
  values (req.customer_id, req.reseller_id, 'debit', amount, req.issue_type, 'booking', 'service_request', req.id)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set amount = excluded.amount, customer_id = excluded.customer_id, note = excluded.note;
end;
$$;

-- The job's trigger (0077), now through refresh_job_debit (which leaves a billed job to its bill).
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

-- The Sale bill's trigger (0091): every Sale to a saved customer is on their ledger, a job's bill too.
create or replace function sync_sale_to_customer_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jobs uuid[];
  j uuid;
begin
  if tg_op = 'DELETE' then
    delete from customer_ledger_entries where source_type = 'business_transaction' and source_id = old.id;
    -- A job whose bill is gone owes what it comes to again.
    if coalesce(old.source_type, '') = 'service_request_bill' then
      foreach j in array array_remove(array_append(coalesce(old.source_job_ids, '{}'), old.source_id), null) loop
        perform refresh_job_debit(j);
      end loop;
    end if;
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

  -- The jobs this bill covers (now, and before an edit) settle whether they post their own entry.
  jobs := '{}';
  if coalesce(new.source_type, '') = 'service_request_bill' then
    jobs := array_append(coalesce(new.source_job_ids, '{}'), new.source_id);
  end if;
  if tg_op = 'UPDATE' and coalesce(old.source_type, '') = 'service_request_bill' then
    jobs := jobs || array_append(coalesce(old.source_job_ids, '{}'), old.source_id);
  end if;
  foreach j in array array_remove(jobs, null) loop
    perform refresh_job_debit(j);
  end loop;

  return new;
end;
$$;

-- 3. Every bill already made from a job: on the ledger now, and its jobs' own entries taken off.
update business_transactions set amount = amount
 where type = 'sale' and source_type = 'service_request_bill';
