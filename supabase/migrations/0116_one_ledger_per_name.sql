-- One ledger per name.
--
-- A person (ledger) could be saved twice under the same name: renaming "Cash" to "Local Purchase" while
-- a "Local Purchase" already existed left two ledgers with one name, each with its own entries and
-- balance. This change:
--
--   1. refuses a NEW ledger, or a RENAME, that gives a shop two ledgers with the same name (compared
--      without caring about capitals or extra spaces: "local  purchase" is "Local Purchase"). A ledger
--      whose name is not being changed is never refused, so duplicates that already exist can still be
--      edited - and merged (below). A ledger pulled in from the phone's contacts (phone_contact_id) is
--      let through: the contact sync must not fail as a whole over one name, and it skips taken names
--      itself (contactsSync.ts).
--   2. adds merge_customers(keep, drop): moves everything on `drop` - ledger entries, vendor entries,
--      bills, jobs, and anything else that points at the person - onto `keep`, fills what `keep` has no
--      value for (phone, address, type...) from `drop`, then removes `drop`. One ledger, one balance.
--      Only the shop's owner (or an admin) can use it, and only on two ledgers of the same shop.
--
-- Additive only. Safe to run more than once. Run once in the Supabase SQL Editor.

-- 1. No second ledger with the same name --------------------------------------

create or replace function customers_block_duplicate_name()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  key text := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
begin
  -- Not a rename: nothing to refuse (and an existing duplicate stays editable).
  if tg_op = 'UPDATE' and lower(regexp_replace(btrim(old.name), '\s+', ' ', 'g')) = key then
    return new;
  end if;
  -- Created by the phone-contacts sync, which keeps names unique on its own side.
  if new.phone_contact_id is not null then
    return new;
  end if;

  if exists (
    select 1
      from customers c
     where c.owner_id = new.owner_id
       and c.id <> new.id
       and lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = key
  ) then
    raise exception 'A ledger named "%" already exists. Use that one, or merge the two.', btrim(new.name)
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_block_duplicate_name on customers;
create trigger customers_block_duplicate_name
  before insert or update of name on customers
  for each row execute function customers_block_duplicate_name();

-- 2. Merge two ledgers into one ------------------------------------------------

create or replace function merge_customers(p_keep uuid, p_drop uuid, p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_row customers%rowtype;
  drop_row customers%rowtype;
  fk record;
  final_name text;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'Pick two different ledgers to merge';
  end if;

  select * into keep_row from customers where id = p_keep for update;
  select * into drop_row from customers where id = p_drop for update;
  if keep_row.id is null or drop_row.id is null then
    raise exception 'Ledger not found';
  end if;
  if keep_row.owner_id <> drop_row.owner_id then
    raise exception 'Those two ledgers belong to different shops';
  end if;
  if keep_row.owner_id is distinct from auth.uid() and not is_admin() then
    raise exception 'You can only merge your own ledgers';
  end if;

  -- Bills and jobs first: their sync triggers move the ledger entries they booked (each is one row per
  -- bill / job, so nothing is booked twice).
  update business_transactions set customer_id = p_keep where customer_id = p_drop;
  update service_requests set customer_id = p_keep where customer_id = p_drop;
  -- Then the entries themselves (typed payments, receipts, ...).
  update customer_ledger_entries set customer_id = p_keep where customer_id = p_drop;
  update vendor_ledger_entries set vendor_id = p_keep where vendor_id = p_drop;

  -- Anything else that points at a person (a link added after this was written) goes along too, so that
  -- deleting `drop` cannot cascade away something that should have moved.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.customers'::regclass
       and array_length(c.conkey, 1) = 1
       and c.conrelid <> 'public.customers'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using p_keep, p_drop;
  end loop;

  -- Remove the second ledger before `keep` takes its phone (the phone is unique per shop).
  delete from customers where id = p_drop;

  update customers
     set name = coalesce(nullif(btrim(p_name), ''), name),
         phone = coalesce(phone, drop_row.phone),
         address = coalesce(address, drop_row.address),
         latitude = case when latitude is null or longitude is null then drop_row.latitude else latitude end,
         longitude = case when latitude is null or longitude is null then drop_row.longitude else longitude end,
         contact_person_name = coalesce(contact_person_name, drop_row.contact_person_name),
         contact_person_phone = coalesce(contact_person_phone, drop_row.contact_person_phone),
         party_type_id = coalesce(party_type_id, drop_row.party_type_id),
         phone_contact_id = coalesce(phone_contact_id, drop_row.phone_contact_id),
         updated_at = now()
   where id = p_keep;

  -- The name a bill or a job carries as its own copy follows the ledger's.
  select name into final_name from customers where id = p_keep;
  update business_transactions set party_name = final_name
   where customer_id = p_keep and party_name is distinct from final_name;
  update service_requests set customer_name = final_name
   where customer_id = p_keep and customer_name is distinct from final_name;
end;
$$;

revoke all on function merge_customers(uuid, uuid, text) from public, anon;
grant execute on function merge_customers(uuid, uuid, text) to authenticated;
