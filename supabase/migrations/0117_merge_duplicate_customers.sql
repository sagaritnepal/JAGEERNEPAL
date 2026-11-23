-- One name, one ledger. The Ledger lists one row per saved customer, so two customer records with the
-- same name (e.g. "Binayak Computer" saved twice, or once as "binayak computer ") showed up as two
-- people, each holding half of the entries.
--
-- 1. Merges every set of same-name customers under an owner into one record. Names are compared
--    ignoring case and extra spaces. The oldest record is kept; every row that points at the others
--    (ledger entries, vendor entries, bills, jobs, and anything else with a foreign key to customers)
--    is moved to it, the others are deleted, and the kept record picks up any phone, address,
--    contact person, location or Ledger type it was missing from them.
-- 2. Adds a unique index so the same name cannot be saved twice for one owner again.
--
-- Runs as one transaction: if anything cannot be moved, nothing is changed. Safe to run more than once.

do $$
declare
  ref       record;
  grp       record;
  refs      text[][] := '{}';
  v_keep    customers%rowtype;
  v_dups    uuid[];
  v_phone   text;
  v_contact text;
  i         int;
begin
  -- Every column that holds a customer id: the foreign keys to customers, plus vendor_ledger_entries.vendor_id
  -- (it points at customers too, with or without a declared foreign key).
  for ref in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.customers'::regclass
       and array_length(c.conkey, 1) = 1
       and c.conrelid <> 'public.customers'::regclass
    union
    select 'vendor_ledger_entries', 'vendor_id'
     where exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'vendor_ledger_entries' and column_name = 'vendor_id')
  loop
    refs := refs || array[[ref.tbl, ref.col]];
  end loop;

  -- Moving ids is a re-label, not a new payment, bill or job: the tables' own triggers (finance sync,
  -- notifications, points) stay off while it runs, as in 0089.
  for i in 1 .. coalesce(array_length(refs, 1), 0) loop
    execute format('alter table %s disable trigger user', refs[i][1]);
  end loop;

  for grp in
    select owner_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as norm,
           array_agg(id order by created_at, id) as ids
      from customers
     group by 1, 2
    having count(*) > 1
  loop
    select * into v_keep from customers where id = grp.ids[1];
    v_dups := grp.ids[2:];

    for i in 1 .. coalesce(array_length(refs, 1), 0) loop
      execute format('update %s set %I = $1 where %I = any($2)', refs[i][1], refs[i][2], refs[i][2])
        using v_keep.id, v_dups;
    end loop;

    -- What the kept record is missing, from the newest duplicate that has it.
    select coalesce(v_keep.phone, (select phone from customers where id = any(v_dups) and nullif(phone, '') is not null order by created_at desc limit 1)),
           coalesce(v_keep.phone_contact_id, (select phone_contact_id from customers where id = any(v_dups) and phone_contact_id is not null order by created_at desc limit 1))
      into v_phone, v_contact;

    update customers k set
      address              = coalesce(k.address, d.address),
      contact_person_name  = coalesce(k.contact_person_name, d.contact_person_name),
      contact_person_phone = coalesce(k.contact_person_phone, d.contact_person_phone),
      latitude             = coalesce(k.latitude, d.latitude),
      longitude            = coalesce(k.longitude, d.longitude),
      party_type_id        = coalesce(k.party_type_id, d.party_type_id)
      from (select (array_agg(address) filter (where nullif(address, '') is not null))[1] as address,
                   (array_agg(contact_person_name) filter (where contact_person_name is not null))[1] as contact_person_name,
                   (array_agg(contact_person_phone) filter (where contact_person_phone is not null))[1] as contact_person_phone,
                   (array_agg(latitude) filter (where latitude is not null))[1] as latitude,
                   (array_agg(longitude) filter (where longitude is not null))[1] as longitude,
                   (array_agg(party_type_id) filter (where party_type_id is not null))[1] as party_type_id
              from customers where id = any(v_dups)) d
     where k.id = v_keep.id;

    -- Phone and phone contact are unique per owner, so the duplicates go before the kept record takes them.
    delete from customers where id = any(v_dups);
    update customers set phone = v_phone, phone_contact_id = v_contact, name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
     where id = v_keep.id;
  end loop;

  for i in 1 .. coalesce(array_length(refs, 1), 0) loop
    execute format('alter table %s enable trigger user', refs[i][1]);
  end loop;
end;
$$;

create unique index if not exists customers_owner_name_idx
  on customers (owner_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
