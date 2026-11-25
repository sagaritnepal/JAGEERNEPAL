-- 0127: a reseller's own website (e.g. mansa.com.np) reports its visits and contact-form leads to Jageer,
-- shown in the reseller's Website page. The site carries a small script (copied from that page) that calls
-- the two public functions below with the site's key; nothing on the website can read anything back.
--
-- Run once in the Supabase SQL Editor. Safe to run more than once.

create table if not exists websites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  domain text not null,
  site_key text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create unique index if not exists websites_owner_domain_idx on websites(owner_id, lower(domain));

create table if not exists website_visits (
  id bigint generated always as identity primary key,
  website_id uuid not null references websites(id) on delete cascade,
  visitor_id text,
  path text,
  referrer text,
  device text,
  created_at timestamptz not null default now()
);
create index if not exists website_visits_site_idx on website_visits(website_id, created_at desc);

create table if not exists website_leads (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references websites(id) on delete cascade,
  name text,
  phone text,
  email text,
  message text,
  page text,
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'contacted')),
  created_at timestamptz not null default now()
);
create index if not exists website_leads_site_idx on website_leads(website_id, created_at desc);

alter table websites enable row level security;
alter table website_visits enable row level security;
alter table website_leads enable row level security;

-- The owner manages their own site; an admin can look.
drop policy if exists websites_owner on websites;
create policy websites_owner on websites
  for all using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid() or is_admin());

drop policy if exists website_visits_owner_read on website_visits;
create policy website_visits_owner_read on website_visits
  for select using (exists (select 1 from websites w where w.id = website_id and (w.owner_id = auth.uid() or is_admin())));

drop policy if exists website_leads_owner on website_leads;
create policy website_leads_owner on website_leads
  for all using (exists (select 1 from websites w where w.id = website_id and (w.owner_id = auth.uid() or is_admin())))
  with check (exists (select 1 from websites w where w.id = website_id and (w.owner_id = auth.uid() or is_admin())));

-- Called by the website's script for every page opened. Unknown keys are ignored.
create or replace function track_website_visit(p_key text, p_visitor text, p_path text, p_referrer text, p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site uuid;
begin
  select id into v_site from websites where site_key = p_key;
  if v_site is null then
    return;
  end if;
  insert into website_visits (website_id, visitor_id, path, referrer, device)
  values (v_site, left(p_visitor, 64), left(coalesce(nullif(p_path, ''), '/'), 300), left(nullif(p_referrer, ''), 300), left(p_device, 20));
end;
$$;

-- Called by the website's script when a visitor sends a form (contact, enquiry, quote...).
create or replace function submit_website_lead(
  p_key text, p_name text, p_phone text, p_email text, p_message text, p_page text, p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site uuid;
begin
  select id into v_site from websites where site_key = p_key;
  if v_site is null then
    return;
  end if;
  insert into website_leads (website_id, name, phone, email, message, page, fields)
  values (
    v_site,
    left(nullif(trim(p_name), ''), 150),
    left(nullif(trim(p_phone), ''), 40),
    left(nullif(trim(p_email), ''), 150),
    left(nullif(trim(p_message), ''), 3000),
    left(p_page, 300),
    case when p_fields is null or pg_column_size(p_fields) > 16000 then '{}'::jsonb else p_fields end
  );
end;
$$;

revoke all on function track_website_visit(text, text, text, text, text) from public;
revoke all on function submit_website_lead(text, text, text, text, text, text, jsonb) from public;
grant execute on function track_website_visit(text, text, text, text, text) to anon, authenticated;
grant execute on function submit_website_lead(text, text, text, text, text, text, jsonb) to anon, authenticated;

-- The Website page's figures, counted in the database (Nepal days) so a busy site is not cut at 1000 rows.
create or replace function website_stats(p_website uuid, p_days int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with v as (
    select *, (created_at at time zone 'Asia/Kathmandu')::date as day
    from website_visits
    where website_id = p_website
      and created_at >= now() - make_interval(days => greatest(p_days, 1))
  ),
  src as (
    select case
             when referrer is null then 'Direct'
             when referrer ~* 'google\.' then 'Google'
             when referrer ~* 'facebook\.|fb\.' then 'Facebook'
             when referrer ~* 'instagram\.' then 'Instagram'
             when referrer ~* 'tiktok\.' then 'TikTok'
             when referrer ~* 'youtube\.' then 'YouTube'
             when referrer ~* 'bing\.' then 'Bing'
             else coalesce(substring(referrer from '^[a-z]+://(?:www\.)?([^/:?#]+)'), 'Other')
           end as source
    from v
  )
  select jsonb_build_object(
    'total', (select count(*) from v),
    'unique', (select count(distinct visitor_id) from v),
    'today', (select count(*) from v where day = (now() at time zone 'Asia/Kathmandu')::date),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day desc)
                      from (select day, count(*) c from v group by day) d), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('label', path, 'count', c) order by c desc)
                       from (select path, count(*) c from v group by path order by c desc limit 10) p), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('label', source, 'count', c) order by c desc)
                         from (select source, count(*) c from src group by source order by c desc limit 10) s), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(device, 'unknown'), 'count', c) order by c desc)
                         from (select device, count(*) c from v group by device) dv), '[]'::jsonb)
  );
$$;

grant execute on function website_stats(uuid, int) to authenticated;

-- Let the app see the new tables straight away.
notify pgrst, 'reload schema';
