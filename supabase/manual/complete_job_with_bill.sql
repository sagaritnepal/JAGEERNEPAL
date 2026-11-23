-- Record a job as done by a technician and billed with an existing bill - the entries the app makes when a
-- job is marked done and then billed with "Create bill" from it.
--
-- NOT a migration: do not put this in supabase/migrations. Run by hand in the Supabase SQL Editor.
-- Set up for: customer Santosh Thapa, technician Roshan Tamang, bill E144, reseller Sagar Rayamajhi.
-- Edit the names in STEP 1 and in the variables of STEP 2 to use it for another job.
--
-- What STEP 2 does, in one transaction (if anything does not look right it stops and changes nothing):
--   1. Finds the customer's one job that is not cancelled, and bill E144 (a Sale).
--   2. Marks the job complete (status 'resolved'), done by Roshan Tamang, with its job card.
--   3. Makes the job carry the bill's amount and the bill's customer, so the job's ledger entry is the bill.
--   4. Links bill E144 to the job (as "Create bill" does). The bill then adds no ledger entry of its own,
--      so the customer is charged once, and the job shows as billed / awaiting payment.
-- Payments are not touched: anything already received stays as it is.
--
-- Run STEP 1 first. It only reads.

-- ============================================================================================
-- STEP 1 - look first (read-only)
-- ============================================================================================

-- 1a. The reseller. Exactly one row.
select id, full_name from profiles
where role = 'reseller'::user_role and lower(trim(full_name)) = lower('Sagar Rayamajhi');

-- 1b. Santosh Thapa's jobs.
select sr.id, sr.ticket_no, sr.issue_type, sr.status, sr.payment_status, sr.quoted_price,
       sr.customer_id, sr.technician_id, sr.completed_by_name, sr.created_at
from service_requests sr
where sr.reseller_id = (select id from profiles where role = 'reseller'::user_role and lower(trim(full_name)) = lower('Sagar Rayamajhi'))
  and lower(trim(sr.customer_name)) = lower('Santosh Thapa')
order by sr.created_at;

-- 1c. Bill E144.
select b.id, b.type, b.bill_no, b.bill_date, b.amount, b.party_name, b.customer_id, b.source_type, b.source_id, b.payment_mode
from business_transactions b
where b.owner_id = (select id from profiles where role = 'reseller'::user_role and lower(trim(full_name)) = lower('Sagar Rayamajhi'))
  and upper(replace(replace(b.bill_no, '-', ''), ' ', '')) = 'E144';

-- 1d. Santosh Thapa's ledger as it stands.
select e.entry_date, e.created_at, e.entry_type, e.amount, e.source_type, e.note, e.receipt_no
from customer_ledger_entries e
join customers c on c.id = e.customer_id
where c.owner_id = (select id from profiles where role = 'reseller'::user_role and lower(trim(full_name)) = lower('Sagar Rayamajhi'))
  and lower(trim(c.name)) = lower('Santosh Thapa')
order by e.created_at;

-- 1e. Roshan Tamang, if he has an app account.
select id, full_name, role from profiles where lower(trim(full_name)) = lower('Roshan Tamang');

-- ============================================================================================
-- STEP 2 - fix. Run only after STEP 1 looks right.
-- If 1b lists more than one job that is not cancelled, put the right one's ticket_no in v_ticket_no.
-- ============================================================================================
do $$
declare
  v_reseller_name text := 'Sagar Rayamajhi';
  v_customer_name text := 'Santosh Thapa';
  v_technician    text := 'Roshan Tamang';
  v_bill_no       text := 'E144';
  v_ticket_no     text := null;   -- e.g. '123' when the customer has more than one job

  v_reseller uuid;
  v_tech     uuid;
  v_job      service_requests%rowtype;
  v_bill     business_transactions%rowtype;
  v_n        int;
  v_card     uuid;
begin
  select id into v_reseller from profiles
   where role = 'reseller'::user_role and lower(trim(full_name)) = lower(v_reseller_name);
  if v_reseller is null then raise exception 'Reseller % not found', v_reseller_name; end if;

  -- The job.
  select count(*) into v_n from service_requests
   where reseller_id = v_reseller and lower(trim(customer_name)) = lower(v_customer_name)
     and status <> 'cancelled' and (v_ticket_no is null or ticket_no::text = v_ticket_no);
  if v_n <> 1 then
    raise exception 'Found % jobs for % - set v_ticket_no to the right one (see STEP 1b)', v_n, v_customer_name;
  end if;
  select * into v_job from service_requests
   where reseller_id = v_reseller and lower(trim(customer_name)) = lower(v_customer_name)
     and status <> 'cancelled' and (v_ticket_no is null or ticket_no::text = v_ticket_no)
   for update;

  -- The bill.
  select count(*) into v_n from business_transactions
   where owner_id = v_reseller and type = 'sale'
     and upper(replace(replace(bill_no, '-', ''), ' ', '')) = upper(v_bill_no);
  if v_n <> 1 then raise exception 'Found % sale bills numbered %', v_n, v_bill_no; end if;
  select * into v_bill from business_transactions
   where owner_id = v_reseller and type = 'sale'
     and upper(replace(replace(bill_no, '-', ''), ' ', '')) = upper(v_bill_no)
   for update;

  if v_bill.source_type = 'service_request_bill' and v_bill.source_id is distinct from v_job.id then
    raise exception 'Bill % is already linked to another job (%)', v_bill_no, v_bill.source_id;
  end if;
  if v_bill.customer_id is null and v_job.customer_id is null then
    raise exception 'Neither the job nor bill % is linked to a saved customer - link the bill to % first', v_bill_no, v_customer_name;
  end if;

  select id into v_tech from profiles where lower(trim(full_name)) = lower(v_technician) limit 1;

  -- 1. Link the bill to the job first: from here the bill puts nothing on the ledger itself.
  update business_transactions
     set source_type = 'service_request_bill',
         source_id = v_job.id,
         customer_id = coalesce(customer_id, v_job.customer_id)
   where id = v_bill.id;

  -- 2. The job: done by Roshan Tamang, at the bill's amount, on the bill's customer. Completing it puts its
  --    one ledger entry (the bill's amount) on the customer.
  update service_requests
     set status = 'resolved',
         completed_by_name = case when technician_id is null then v_technician else completed_by_name end,
         quoted_price = v_bill.amount,
         customer_id = coalesce(v_bill.customer_id, customer_id)
   where id = v_job.id;

  -- The ledger entry is dated the bill's date, so it sits where the bill does in the statement.
  update customer_ledger_entries
     set entry_date = coalesce(v_bill.bill_date, entry_date),
         receipt_no = coalesce(receipt_no, v_bill.bill_no)
   where source_type = 'service_request' and source_id = v_job.id;

  -- 3. The job card keeps when the work ended and who did it.
  select id into v_card from job_cards where service_request_id = v_job.id order by created_at limit 1;
  if v_card is not null then
    update job_cards set completed_at = coalesce(completed_at, now()) where id = v_card;
  else
    insert into job_cards (service_request_id, technician_id, completed_at)
    values (v_job.id, coalesce(v_job.technician_id, v_tech, v_reseller), now());
  end if;

  raise notice 'Job % (%) complete by %, billed with % for NPR %', v_job.ticket_no, v_job.issue_type, v_technician, v_bill.bill_no, v_bill.amount;
end;
$$;

-- STEP 3 - check: Santosh Thapa's ledger should now show bill E144's amount once.
select e.entry_date, e.entry_type, e.amount, e.source_type, e.note, e.receipt_no
from customer_ledger_entries e
join customers c on c.id = e.customer_id
where c.owner_id = (select id from profiles where role = 'reseller'::user_role and lower(trim(full_name)) = lower('Sagar Rayamajhi'))
  and lower(trim(c.name)) = lower('Santosh Thapa')
order by e.created_at;
