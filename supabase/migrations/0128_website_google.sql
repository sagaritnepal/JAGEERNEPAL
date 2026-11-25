-- 0128: a website's Google links, for the Google section of Jageer's Website page
-- (read by the google-website-stats edge function).
--   ga_measurement_id  e.g. G-AB12CD34EF   the Google Analytics tag the website carries
--   ga_property_id     e.g. 456789123      the GA4 property the figures are read from
--   gsc_site_url       e.g. sc-domain:mansa.com.np   the Search Console property
--
-- Run once in the Supabase SQL Editor. Safe to run more than once.

alter table websites add column if not exists ga_measurement_id text;
alter table websites add column if not exists ga_property_id text;
alter table websites add column if not exists gsc_site_url text;

notify pgrst, 'reload schema';
