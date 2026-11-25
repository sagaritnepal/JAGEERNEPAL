// lib/components/website/GoogleSection.tsx
//
// The Website page's Google part: Search Console (what people searched, clicks, impressions, position) and
// Google Analytics 4 (users, sessions, time on site, cities, countries, channels), fetched by the
// google-website-stats edge function with a Google service account. The site's Google links live on its
// websites row (migration 0128) and are set in the Google settings card here.
import { useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useSupabaseUpdate } from '../../hooks/useSupabase';
import { showAlert, getErrorMessage } from '../../utils/alert';
import { toBsDayChartLabel } from '../../utils/nepaliDate';
import { LineChart } from '../finance/dashboard/LineChart';
import type { Website } from '../../../types/database.types';

// The google-website-stats code is deployed in Supabase under the name 'smart-function'.
const GOOGLE_FN = 'smart-function';
const CARD = 'rounded-2xl border border-gray-200 bg-white';
const BLUE = '#2563EB';

type Row = { label: string; clicks: number; impressions: number; ctr: number; position: number };
type Count = { label: string; count: number };
type Gsc = { clicks: number; impressions: number; ctr: number; position: number; queries: Row[]; pages: Row[]; dates: Row[] };
type Ga = { users: number; newUsers: number; sessions: number; pageViews: number; avgSeconds: number; cities: Count[]; countries: Count[]; channels: Count[] };
type Failed = { error: string };
type Result = { serviceAccount?: string | null; error?: string; gsc?: Gsc | Failed | null; ga?: Ga | Failed | null };

const fmt = (n: number) => Math.round(n).toLocaleString();
const failed = (x: unknown): x is Failed => !!x && typeof x === 'object' && 'error' in x;
const duration = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

function Panel({ title, subtitle, right, children, style }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; style?: object }) {
  return (
    <View className={`${CARD} p-5`} style={style}>
      <View className="mb-4 flex-row items-start justify-between" style={{ gap: 10 }}>
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-gray-900">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-[12.5px] text-gray-400">{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="min-w-[110px] flex-1 rounded-xl px-3.5 py-3" style={{ backgroundColor: `${color}14` }}>
      <Text className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
        {label}
      </Text>
      <Text className="mt-0.5 text-[20px] font-bold text-gray-900">{value}</Text>
    </View>
  );
}

function Bars({ title, rows, color }: { title: string; rows: Count[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View className="min-w-[200px] flex-1">
      <Text className="mb-2 text-[12.5px] font-semibold text-gray-600">{title}</Text>
      {rows.length === 0 ? (
        <Text className="text-[12.5px] text-gray-400">No data yet</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {rows.slice(0, 8).map((r) => (
            <View key={r.label} className="overflow-hidden rounded-lg bg-gray-50">
              <View className="absolute bottom-0 left-0 top-0" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: `${color}26` }} />
              <View className="flex-row items-center justify-between px-3 py-1.5">
                <Text className="mr-2 flex-1 text-[12.5px] text-gray-800" numberOfLines={1}>
                  {r.label === '(not set)' ? 'Unknown' : r.label}
                </Text>
                <Text className="text-[12.5px] font-semibold text-gray-900">{fmt(r.count)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Google's own error, and what to do about it. */
function Problem({ text, account, where }: { text: string; account?: string | null; where: string }) {
  const access = /permission|not have|forbidden|403|access/i.test(text);
  const disabled = /has not been used|is disabled|SERVICE_DISABLED/i.test(text);
  return (
    <View className="rounded-xl bg-red-50 px-4 py-3">
      <Text className="text-[13px] font-semibold text-red-700">Google did not send the figures</Text>
      <Text className="mt-1 text-[12.5px] text-red-700">
        {disabled
          ? `Turn on the API for ${where} in Google Cloud (APIs & Services > Library), then wait a few minutes.`
          : access && account
            ? `Add ${account} as a user in ${where}.`
            : text}
      </Text>
      {access || disabled ? <Text className="mt-1 text-[11.5px] text-red-400">{text}</Text> : null}
    </View>
  );
}

function Field({ label, hint, value, onChange, placeholder }: { label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View className="min-w-[220px] flex-1">
      <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        className="mt-1 h-10 rounded-lg border border-gray-300 bg-white px-3 text-[13.5px] text-gray-900"
      />
      <Text className="mt-1 text-[11.5px] text-gray-400">{hint}</Text>
    </View>
  );
}

function GoogleSettings({ site, account, onDone }: { site: Website; account?: string | null; onDone: () => void }) {
  const [gsc, setGsc] = useState(site.gsc_site_url ?? `sc-domain:${site.domain}`);
  const [property, setProperty] = useState(site.ga_property_id ?? '');
  const [tag, setTag] = useState(site.ga_measurement_id ?? '');
  const update = useSupabaseUpdate('websites');
  const save = async () => {
    try {
      await update.mutateAsync({
        id: site.id,
        values: {
          gsc_site_url: gsc.trim() || null,
          ga_property_id: property.replace(/\D/g, '') || null,
          ga_measurement_id: tag.trim().toUpperCase() || null,
        },
      });
      onDone();
    } catch (e) {
      showAlert('Could not save', getErrorMessage(e));
    }
  };
  const copy = async () => {
    if (account && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(account).catch(() => undefined);
    }
  };
  return (
    <Panel title="Connect Google" subtitle={`Google Search Console and Google Analytics for ${site.domain}`}>
      <View className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
        <Text className="text-[12.5px] font-semibold text-gray-700">Give Jageer read access in Google</Text>
        {account ? (
          <Pressable onPress={copy} className="mt-1.5 flex-row items-center self-start rounded-lg border border-gray-300 bg-white px-3 py-1.5" style={{ gap: 6 }}>
            <Ionicons name="copy-outline" size={13} color="#374151" />
            <Text className="text-[12.5px] font-semibold text-gray-800">{account}</Text>
          </Pressable>
        ) : (
          <Text className="mt-1 text-[12.5px] text-amber-700">The Google key is not set up on the server yet.</Text>
        )}
        <Text className="mt-2 text-[12px] leading-[18px] text-gray-500">
          Search Console: Settings &gt; Users and permissions &gt; Add user &gt; paste this email (Restricted).{'\n'}
          Google Analytics: Admin &gt; Property access management &gt; + &gt; paste this email (Viewer).
        </Text>
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 14 }}>
        <Field label="Search Console property" hint="sc-domain:yourdomain, or the full https:// address you added" value={gsc} onChange={setGsc} placeholder="sc-domain:mansa.com.np" />
        <Field label="GA4 property ID" hint="Analytics > Admin > Property details (numbers only)" value={property} onChange={setProperty} placeholder="456789123" />
        <Field label="GA4 measurement ID" hint="Admin > Data streams > your web stream" value={tag} onChange={setTag} placeholder="G-AB12CD34EF" />
      </View>
      <View className="mt-4 flex-row justify-end" style={{ gap: 8 }}>
        <Pressable onPress={onDone} className="rounded-lg border border-gray-300 bg-white px-4 py-2">
          <Text className="text-[13px] font-semibold text-gray-700">Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={update.isPending} className="rounded-lg px-4 py-2" style={{ backgroundColor: BLUE }}>
          <Text className="text-[13px] font-semibold text-white">{update.isPending ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </Panel>
  );
}

export function GoogleSection({ site, days, wide }: { site: Website; days: number; wide: boolean }) {
  const linked = !!(site.gsc_site_url || site.ga_property_id);
  const [editing, setEditing] = useState(false);
  const gscDays = Math.max(days, 7);

  const { data: info } = useQuery({
    queryKey: ['google-website-stats', 'info'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke(GOOGLE_FN, { body: { action: 'info' } });
      return (data ?? {}) as { serviceAccount?: string | null };
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['google-website-stats', site.id, site.gsc_site_url, site.ga_property_id, days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(GOOGLE_FN, { body: { website_id: site.id, days } });
      if (error) throw error;
      return data as Result;
    },
    enabled: linked,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const account = data?.serviceAccount ?? info?.serviceAccount;
  const gsc = data?.gsc;
  const ga = data?.ga;

  const header = (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <Ionicons name="logo-google" size={15} color="#374151" />
      <Text className="text-[14.5px] font-semibold text-gray-800">Google</Text>
      <View className="h-px flex-1 bg-gray-200" />
      {linked && !editing ? (
        <Pressable onPress={() => setEditing(true)} className="flex-row items-center" style={{ gap: 4 }}>
          <Ionicons name="settings-outline" size={13} color={BLUE} />
          <Text className="text-[12.5px] font-semibold text-blue-600">Google settings</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!linked && !editing) {
    return (
      <>
        {header}
        <View className={`${CARD} flex-row flex-wrap items-center justify-between p-5`} style={{ gap: 12 }}>
          <View className="flex-1" style={{ minWidth: 240 }}>
            <Text className="text-[15px] font-semibold text-gray-900">See your Google figures here</Text>
            <Text className="mt-0.5 text-[12.5px] text-gray-500">
              What people search on Google to find you, your position, clicks - and Google Analytics visitors, cities and countries.
            </Text>
          </View>
          <Pressable onPress={() => setEditing(true)} className="flex-row items-center rounded-lg px-4 py-2" style={{ backgroundColor: BLUE, gap: 6 }}>
            <Ionicons name="logo-google" size={14} color="#fff" />
            <Text className="text-[13px] font-semibold text-white">Connect Google</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (editing) {
    return (
      <>
        {header}
        <GoogleSettings site={site} account={account} onDone={() => setEditing(false)} />
      </>
    );
  }

  const row = { flexDirection: wide ? ('row' as const) : ('column' as const), gap: 20 };
  const problem = data?.error || (error ? getErrorMessage(error) : '');

  return (
    <>
      {header}
      {problem ? <Problem text={problem} account={account} where="Google" /> : null}
      <View style={row}>
        <Panel
          title="Google Search"
          subtitle={`Search Console · last ${gscDays} days · Google shows search figures 2-3 days late`}
          right={
            <Pressable onPress={() => Linking.openURL('https://search.google.com/search-console')}>
              <Ionicons name="open-outline" size={15} color="#9CA3AF" />
            </Pressable>
          }
          style={{ flex: wide ? 1 : undefined }}
        >
          {!site.gsc_site_url ? (
            <Text className="text-[12.5px] text-gray-400">Add the Search Console property in Google settings.</Text>
          ) : isLoading ? (
            <Text className="py-6 text-center text-[13px] text-gray-400">Asking Google…</Text>
          ) : failed(gsc) ? (
            <Problem text={gsc.error} account={account} where="Search Console" />
          ) : gsc ? (
            <>
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                <Mini label="Clicks" value={fmt(gsc.clicks)} color="#2563EB" />
                <Mini label="Shown in Google" value={fmt(gsc.impressions)} color="#7C3AED" />
                <Mini label="Click rate" value={`${(gsc.ctr * 100).toFixed(1)}%`} color="#059669" />
                <Mini label="Avg position" value={gsc.position ? gsc.position.toFixed(1) : '-'} color="#EA580C" />
              </View>
              <View className="mt-4">
                <LineChart
                  labels={gsc.dates.map((d) => toBsDayChartLabel(new Date(`${d.label}T00:00:00`)))}
                  series={[
                    { key: 'impressions', label: 'Shown', color: '#7C3AED', values: gsc.dates.map((d) => d.impressions) },
                    { key: 'clicks', label: 'Clicks', color: '#2563EB', values: gsc.dates.map((d) => d.clicks), area: true },
                  ]}
                  height={200}
                  emptyText="No Google search figures yet"
                />
              </View>
              <Text className="mb-2 mt-4 text-[12.5px] font-semibold text-gray-600">What people searched</Text>
              {gsc.queries.length === 0 ? (
                <Text className="text-[12.5px] text-gray-400">No searches yet - a new site takes a few weeks to show in Google.</Text>
              ) : (
                <View>
                  <View className="flex-row border-b border-gray-200 pb-1.5">
                    <Text className="flex-1 text-[11.5px] font-semibold text-gray-500">Search</Text>
                    <Text className="w-[56px] text-right text-[11.5px] font-semibold text-gray-500">Clicks</Text>
                    <Text className="w-[60px] text-right text-[11.5px] font-semibold text-gray-500">Shown</Text>
                    <Text className="w-[56px] text-right text-[11.5px] font-semibold text-gray-500">Position</Text>
                  </View>
                  {gsc.queries.map((q) => (
                    <View key={q.label} className="flex-row items-center border-b border-gray-100 py-2">
                      <Text className="flex-1 pr-2 text-[13px] text-gray-900" numberOfLines={1}>
                        {q.label}
                      </Text>
                      <Text className="w-[56px] text-right text-[13px] font-semibold text-blue-600">{fmt(q.clicks)}</Text>
                      <Text className="w-[60px] text-right text-[13px] text-gray-700">{fmt(q.impressions)}</Text>
                      <Text className="w-[56px] text-right text-[13px] text-gray-700">{q.position.toFixed(1)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}
        </Panel>

        <Panel
          title="Google Analytics"
          subtitle={`GA4 · last ${days === 1 ? 'day' : `${days} days`}`}
          right={
            <Pressable onPress={() => Linking.openURL('https://analytics.google.com/')}>
              <Ionicons name="open-outline" size={15} color="#9CA3AF" />
            </Pressable>
          }
          style={{ flex: wide ? 1 : undefined }}
        >
          {!site.ga_property_id ? (
            <Text className="text-[12.5px] text-gray-400">Add the GA4 property ID in Google settings.</Text>
          ) : isLoading ? (
            <Text className="py-6 text-center text-[13px] text-gray-400">Asking Google…</Text>
          ) : failed(ga) ? (
            <Problem text={ga.error} account={account} where="Google Analytics" />
          ) : ga ? (
            <>
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                <Mini label="Users" value={fmt(ga.users)} color="#2563EB" />
                <Mini label="New users" value={fmt(ga.newUsers)} color="#059669" />
                <Mini label="Sessions" value={fmt(ga.sessions)} color="#7C3AED" />
                <Mini label="Avg time" value={duration(ga.avgSeconds)} color="#EA580C" />
              </View>
              <View className="mt-4 flex-row flex-wrap" style={{ gap: 18 }}>
                <Bars title="Top cities" rows={ga.cities} color="#2563EB" />
                <Bars title="Countries" rows={ga.countries} color="#059669" />
              </View>
              <View className="mt-4">
                <Bars title="How they arrived" rows={ga.channels} color="#7C3AED" />
              </View>
            </>
          ) : null}
        </Panel>
      </View>
    </>
  );
}
