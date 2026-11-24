-- Clear the walk-in Sales that a job's payment left behind once the job had a customer or a bill.
--
-- A job paid while it had no saved customer wrote a Sale for the money (source_type
-- 'service_request_payment'). If the job was linked to a customer afterwards without its payment being
-- changed again, that Sale stayed - so the Sales report showed it next to the job's real bill (Irish Pub:
-- "Job #0059" and a second line with no remark), and the money counted twice as received. 0118 only
-- cleared it for jobs that still had no customer.
--
-- For every such Sale:
--   - the job has a saved customer: the payment goes on their ledger as a receipt (as the payment sync
--     does), and the Sale is removed;
--   - the job has no customer but has a bill: the bill is the sale paid on the spot, so the Sale is removed.
-- A walk-in job with no bill keeps its Sale - it is the only record of that sale.
--
-- Run once in the Supabase SQL Editor (after 0118). Safe to run more than once.

do $$
declare
  p record;
begin
  for p in
    select b.id as sale_id, b.amount, sr.id as job_id, sr.customer_id, sr.reseller_id, sr.issue_type
      from business_transactions b
      join service_requests sr on sr.id = b.source_id
     where b.source_type = 'service_request_payment'
  loop
    if p.customer_id is not null then
      insert into customer_ledger_entries (customer_id, owner_id, entry_type, amount, note, source, source_type, source_id)
      values (p.customer_id, p.reseller_id, 'credit', p.amount, p.issue_type, 'booking', 'service_request_payment', p.job_id)
      on conflict (source_type, source_id) where source_type is not null and source_id is not null
      do update set amount = excluded.amount, customer_id = excluded.customer_id;
      delete from business_transactions where id = p.sale_id;
    elsif job_has_bill(p.job_id) then
      delete from business_transactions where id = p.sale_id;
    end if;
  end loop;
end;
$$;
