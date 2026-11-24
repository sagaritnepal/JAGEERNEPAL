-- Delete bills that were saved more than once (Save pressed twice before 1dede42 stopped it).
--
-- NOT a migration: run by hand in the Supabase SQL Editor. Run STEP 1 first - it only reads.
--
-- A copy is a bill with the same owner, type, party, bill no., bill date, amount and items as another one.
-- The first one saved is kept; the later copies are deleted. Deleting a bill takes its entry off the
-- customer's / vendor's ledger too (the ledger sync triggers), exactly as the Delete button in the app does.
-- Two bills that share a number but differ in anything (amount, date, items) are NOT touched - check those
-- yourself. One transaction: if anything fails, nothing is deleted.

-- ============================================================================================
-- STEP 1 - look first (read-only): every copy that STEP 2 would delete, next to the one it keeps.
-- ============================================================================================
with ranked as (
  select b.*,
         row_number() over (
           partition by b.owner_id, b.type, coalesce(b.customer_id::text, lower(trim(b.party_name))),
                        lower(trim(b.bill_no)), b.bill_date, b.amount, coalesce(b.items, '[]'::jsonb)
           order by b.created_at, b.id
         ) as copy_no
    from business_transactions b
   where coalesce(trim(b.bill_no), '') <> ''
)
select type, party_name, bill_no, bill_date, amount, copy_no,
       case when copy_no = 1 then 'KEEP' else 'DELETE' end as action, created_at, id
  from ranked r
 where exists (select 1 from ranked x where x.owner_id = r.owner_id and x.type = r.type
                 and coalesce(x.customer_id::text, lower(trim(x.party_name))) = coalesce(r.customer_id::text, lower(trim(r.party_name)))
                 and lower(trim(x.bill_no)) = lower(trim(r.bill_no)) and x.bill_date is not distinct from r.bill_date
                 and x.amount = r.amount and coalesce(x.items, '[]'::jsonb) = coalesce(r.items, '[]'::jsonb)
                 and x.copy_no > 1)
 order by party_name, bill_no, copy_no;

-- ============================================================================================
-- STEP 2 - delete the copies (only the rows STEP 1 marked DELETE).
-- ============================================================================================
with ranked as (
  select b.id,
         row_number() over (
           partition by b.owner_id, b.type, coalesce(b.customer_id::text, lower(trim(b.party_name))),
                        lower(trim(b.bill_no)), b.bill_date, b.amount, coalesce(b.items, '[]'::jsonb)
           order by b.created_at, b.id
         ) as copy_no
    from business_transactions b
   where coalesce(trim(b.bill_no), '') <> ''
)
delete from business_transactions b
 using ranked r
 where b.id = r.id and r.copy_no > 1
returning b.type, b.party_name, b.bill_no, b.amount;
