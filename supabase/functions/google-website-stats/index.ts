// Deployed in Supabase as 'smart-function' (the name the app calls - see GoogleSection.tsx).
// google-website-stats: Google's figures for a reseller's own website, for Jageer's Website page.
//   - Search Console: what people searched on Google, impressions, clicks, position, top pages.
//   - Google Analytics 4: users, sessions, time on site, cities, countries, channels.
//
// One file on purpose, so it can be pasted into Supabase > Edge Functions > "Deploy a new function"
// in the dashboard (no CLI needed). Keep "Verify JWT" ON: only a signed-in Jageer user can call it,
// and the website row is read with THEIR login, so nobody can read someone else's site.
//
// Secret (Supabase > Edge Functions > Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON   the whole JSON key file of a Google Cloud service account that has
//                                 "Google Analytics Data API" and "Google Search Console API" enabled,
//                                 and has been added as a user in the GA4 property and in Search Console.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided to every function.
//
// Body: { website_id: string, days?: number }  or  { action: "info" } (returns the service account email).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// A Google access token for the service account (signed JWT -> OAuth token), cached while it is good.
let cached: { token: string; until: number } | null = null;
async function googleToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function google(token: string, url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Google answered ${res.status}`);
  return data;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function searchConsole(token: string, site: string, days: number) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const end = new Date();
  const start = new Date(Date.now() - (days - 1) * 86400000);
  const base = { startDate: isoDay(start), endDate: isoDay(end), dataState: 'all' };
  const [totals, queries, pages, dates] = await Promise.all([
    google(token, url, { ...base }),
    google(token, url, { ...base, dimensions: ['query'], rowLimit: 15 }),
    google(token, url, { ...base, dimensions: ['page'], rowLimit: 10 }),
    google(token, url, { ...base, dimensions: ['date'], rowLimit: 500 }),
  ]);
  const t = totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const row = (r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
    label: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  });
  return {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.ctr,
    position: t.position,
    queries: (queries.rows ?? []).map(row),
    pages: (pages.rows ?? []).map(row),
    dates: (dates.rows ?? []).map(row),
  };
}

async function analytics(token: string, property: string, days: number) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`;
  const dateRanges = [{ startDate: days <= 1 ? 'today' : `${days - 1}daysAgo`, endDate: 'today' }];
  const list = (dimension: string, metric: string, limit = 10) =>
    google(token, url, {
      dateRanges,
      dimensions: [{ name: dimension }],
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit,
    }).then((r) =>
      (r.rows ?? []).map((x: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
        label: x.dimensionValues[0].value,
        count: Number(x.metricValues[0].value),
      })),
    );
  const [totals, cities, countries, channels] = await Promise.all([
    google(token, url, {
      dateRanges,
      metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    }),
    list('city', 'activeUsers'),
    list('country', 'activeUsers'),
    list('sessionDefaultChannelGroup', 'sessions'),
  ]);
  const m = (totals.rows?.[0]?.metricValues ?? []).map((v: { value: string }) => Number(v.value));
  return {
    users: m[0] ?? 0,
    newUsers: m[1] ?? 0,
    sessions: m[2] ?? 0,
    pageViews: m[3] ?? 0,
    avgSeconds: m[4] ?? 0,
    cities,
    countries,
    channels,
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { website_id?: string; days?: number; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send JSON' }, 400);
  }

  const sa = serviceAccount();
  if (body.action === 'info') return json({ serviceAccount: sa?.client_email ?? null });
  if (!sa) return json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not set in Supabase > Edge Functions > Secrets.' }, 200);
  if (!body.website_id) return json({ error: 'website_id is required' }, 400);

  // Read the site as the caller: RLS only lets its owner (or an admin) see it.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: site, error } = await userClient
    .from('websites')
    .select('id, domain, ga_property_id, gsc_site_url')
    .eq('id', body.website_id)
    .maybeSingle();
  if (error || !site) return json({ error: 'Website not found' }, 404);

  const days = Math.min(Math.max(Math.round(Number(body.days) || 30), 1), 365);
  let token: string;
  try {
    token = await googleToken(sa);
  } catch (e) {
    return json({ error: message(e), serviceAccount: sa.client_email });
  }

  const [gsc, ga] = await Promise.all([
    site.gsc_site_url
      ? searchConsole(token, site.gsc_site_url, Math.max(days, 7)).catch((e) => ({ error: message(e) }))
      : Promise.resolve(null),
    site.ga_property_id
      ? analytics(token, String(site.ga_property_id).replace(/\D/g, ''), days).catch((e) => ({ error: message(e) }))
      : Promise.resolve(null),
  ]);
  return json({ serviceAccount: sa.client_email, gsc, ga });
});
