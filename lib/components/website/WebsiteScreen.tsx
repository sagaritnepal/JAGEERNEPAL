// lib/components/website/WebsiteScreen.tsx
//
// Website: the reseller's own website (e.g. mansa.com.np) - its visitors and the leads its forms send, laid out
// like a dashboard: a summary band, today's leads, three key figures, the visits trend beside the lead alerts,
// traffic sources and top pages, then devices and the recent leads.
// The site carries a small script copied from this page; it calls track_website_visit / submit_website_lead
// (migration 0127) with the site's key. Totals are counted in the database by website_stats.
import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useSupabaseDelete, useSupabaseInsert, useSupabaseQuery, useSupabaseUpdate } from '../../hooks/useSupabase';
import { showAlert, getErrorMessage } from '../../utils/alert';
import { toBsLabel, toBsDayChartLabel } from '../../utils/nepaliDate';
import { LineChart } from '../finance/dashboard/LineChart';
import { GoogleSection } from './GoogleSection';
import type { Website, WebsiteLead } from '../../../types/database.types';

type IconName = keyof typeof Ionicons.glyphMap;

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const CARD = 'rounded-2xl border border-gray-200 bg-white';
const PERIODS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type Count = { label: string; count: number };
type Stats = {
  total: number;
  unique: number;
  today: number;
  days: { day: string; count: number }[];
  pages: Count[];
  sources: Count[];
  devices: Count[];
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const pad2 = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const bsDay = (iso: string) => toBsLabel(localDay(new Date(iso))) || new Date(iso).toLocaleDateString();
/** "2 x H7C (Rs 7,000) - Total Rs 7,000" -> "Rs 7,000" */
const leadTotal = (l: WebsiteLead) => (l.message ?? '').match(/Total\s+([^|]+)$/i)?.[1]?.trim() ?? '';

/** "https://www.Mansa.com.np/shop" -> "mansa.com.np" */
function cleanDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

/** The script the website pastes in: logs each page opened and sends every filled form as a lead. */
function trackingSnippet(siteKey: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return `<!-- Jageer: website visits and leads -->
<script>
(function(){
var U="${url}/rest/v1/rpc/",K="${anon}",S="${siteKey}";
function post(f,b){try{fetch(U+f,{method:"POST",keepalive:true,headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify(b)})}catch(e){}}
var v="";try{v=localStorage.getItem("jageer_vid")||"";if(!v){v=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("jageer_vid",v)}}catch(e){}
var dev=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)?"mobile":"desktop",last="";
function ref(){try{var r=document.referrer;return r&&new URL(r).host!==location.host?r:""}catch(e){return ""}}
function visit(){if(location.pathname===last)return;last=location.pathname;post("track_website_visit",{p_key:S,p_visitor:v,p_path:location.pathname,p_referrer:ref(),p_device:dev})}
visit();
var ps=history.pushState;history.pushState=function(){ps.apply(this,arguments);setTimeout(visit,0)};addEventListener("popstate",visit);
document.addEventListener("submit",function(e){var f=e.target,d={},n="",p="",m="",em="",i,el,k,val;if(!f||!f.elements)return;
for(i=0;i<f.elements.length;i++){el=f.elements[i];k=(el.name||el.id||"").toLowerCase();val=String(el.value||"").trim();
if(!k||!val||/password|hidden|file|submit|button|reset/.test(el.type)||((el.type==="checkbox"||el.type==="radio")&&!el.checked)||/pass|card|cvv|otp|token|csrf|captcha|nonce/.test(k))continue;
d[el.name||el.id]=val.slice(0,1000);
if(el.type==="email"||/mail/.test(k)){if(!em)em=val}
else if(el.type==="tel"||/phone|mobile|tel|whatsapp|number/.test(k)){if(!p)p=val}
else if(/name/.test(k)&&!/company|business|user/.test(k)){n=n?n+" "+val:val}
else if(el.tagName==="TEXTAREA"||/message|msg|comment|enquiry|inquiry|query|detail|requirement/.test(k)){m=m?m+" | "+val:val}}
if(n||p||em||m)post("submit_website_lead",{p_key:S,p_name:n,p_phone:p,p_email:em,p_message:m,p_page:location.pathname,p_fields:d})},true);
})();
</script>`;
}

// ---------- building blocks ----------

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

/** One of the three coloured tiles in the summary band. */
function SummaryTile({ icon, label, value, note, color }: { icon: IconName; label: string; value: string; note: string; color: string }) {
  return (
    <View className="min-w-[220px] flex-1 flex-row items-center rounded-xl px-4 py-5" style={{ backgroundColor: color, gap: 16 }}>
      <View className="h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
        <Ionicons name={icon} size={19} color="#fff" />
      </View>
      <View className="flex-1">
        <Text className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {label}
        </Text>
        <Text className="text-[22px] font-extrabold text-white">{value}</Text>
        <Text className="text-[12px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {note}
        </Text>
      </View>
    </View>
  );
}

/** A white figure card with a coloured icon square on the right. */
function KpiCard({ label, value, note, icon, color }: { label: string; value: string; note?: string; icon: IconName; color: string }) {
  return (
    <View className={`${CARD} min-w-[220px] flex-1 flex-row items-start justify-between p-5`}>
      <View>
        <Text className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</Text>
        <Text className="mt-1.5 text-[24px] font-bold text-gray-900">{value}</Text>
        {note ? <Text className="mt-1 text-[12px] text-gray-500">{note}</Text> : null}
      </View>
      <View className="h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: color }}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
    </View>
  );
}

/** A tinted alert tile, like the stock alerts. */
function AlertTile({ title, note, count, tone, onPress }: { title: string; note: string; count: number; tone: 'red' | 'orange' | 'yellow' | 'blue'; onPress?: () => void }) {
  const t = {
    red: { bg: '#FDE2E4', fg: '#B42318' },
    orange: { bg: '#FDE7D2', fg: '#B54708' },
    yellow: { bg: '#FEF7C3', fg: '#93690B' },
    blue: { bg: '#DCE8FC', fg: '#1D4ED8' },
  }[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="rounded-xl px-4 py-4" style={{ backgroundColor: t.bg }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="warning-outline" size={15} color={t.fg} />
          <Text className="text-[14px] font-semibold" style={{ color: t.fg }}>
            {title}
          </Text>
        </View>
        <Text className="text-[20px] font-bold" style={{ color: t.fg }}>
          {count}
        </Text>
      </View>
      <Text className="mt-1.5 text-[12px]" style={{ color: t.fg, opacity: 0.8 }}>
        {note}
      </Text>
    </Pressable>
  );
}

function Segment<T extends number>({ value, options, onChange }: { value: T; options: readonly { days: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-lg bg-gray-100 p-1">
      {options.map((o) => (
        <Pressable key={o.days} onPress={() => onChange(o.days)} className={`rounded-md px-3 py-1.5 ${value === o.days ? 'bg-white' : ''}`}>
          <Text className={`text-[12.5px] ${value === o.days ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const Empty = ({ text }: { text: string }) => <Text className="py-8 text-center text-[13px] text-gray-400">{text}</Text>;

// ---------- setup ----------

function ConnectSite({ userId }: { userId: string }) {
  const [domain, setDomain] = useState('');
  const insert = useSupabaseInsert('websites');
  const save = async () => {
    const d = cleanDomain(domain);
    if (!d || !d.includes('.')) {
      showAlert('Website address', 'Type the website address, e.g. mansa.com.np');
      return;
    }
    try {
      await insert.mutateAsync({ owner_id: userId, domain: d });
    } catch (e) {
      showAlert('Could not connect the website', getErrorMessage(e));
    }
  };
  return (
    <Panel title="Connect your website" subtitle="See who visits your website and the enquiries it receives, right here.">
      <Text className="mb-1.5 text-[12px] font-semibold text-gray-600">Website address</Text>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <TextInput
          value={domain}
          onChangeText={setDomain}
          placeholder="e.g. mansa.com.np"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={save}
          className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-[14px] text-gray-900"
        />
        <Pressable onPress={save} disabled={insert.isPending} className="h-10 justify-center rounded-lg px-4" style={{ backgroundColor: BLUE }}>
          <Text className="text-[13px] font-bold text-white">{insert.isPending ? 'Connecting…' : 'Connect'}</Text>
        </Pressable>
      </View>
    </Panel>
  );
}

function InstallCard({ site }: { site: Website }) {
  const snippet = useMemo(() => trackingSnippet(site.site_key), [site.site_key]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // fall through to the manual hint
    }
    showAlert('Copy the code', 'Press and hold the code box, select all and copy it.');
  };
  return (
    <Panel
      title="Website code"
      subtitle={`Paste it once into every page of ${site.domain}, just before </head>. Visits and form enquiries then show here.`}
      right={
        <Pressable onPress={copy} className="flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5" style={{ gap: 6 }}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#15803D' : '#374151'} />
          <Text className="text-[12px] font-semibold text-gray-700">{copied ? 'Copied' : 'Copy code'}</Text>
        </Pressable>
      }
    >
      <TextInput
        value={snippet}
        editable={false}
        multiline
        selectTextOnFocus
        className="rounded-lg bg-gray-900 p-3 text-[11px] text-green-200"
        style={{ height: 150, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}
      />
    </Panel>
  );
}

// ---------- leads ----------

/** A row of Recent Leads, like a Recent Updates row. */
function LeadRow({ lead }: { lead: WebsiteLead }) {
  const update = useSupabaseUpdate('website_leads');
  const remove = useSupabaseDelete('website_leads');
  const contacted = lead.status === 'contacted';
  const toggle = () =>
    update.mutate(
      { id: lead.id, values: { status: contacted ? 'new' : 'contacted' } },
      { onError: (e) => showAlert('Could not update', getErrorMessage(e)) },
    );
  const askDelete = () =>
    showAlert('Delete this lead?', lead.name || lead.phone || lead.email || '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(lead.id, { onError: (e) => showAlert('Could not delete', getErrorMessage(e)) }),
      },
    ]);
  const total = leadTotal(lead);
  const detail = (lead.message ?? '').replace(/\s*-\s*Total\s+[^|]+$/i, '');
  const meta = [`${bsDay(lead.created_at)} · ${timeOf(lead.created_at)}`, lead.page && lead.page !== '/' ? lead.page : null, lead.email]
    .filter(Boolean)
    .join(' · ');
  return (
    <View className="flex-row items-start border-t border-gray-100 py-3.5" style={{ gap: 12 }}>
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: contacted ? '#E7F6EC' : '#F1EAFE' }}>
        <Ionicons name={contacted ? 'checkmark-done-outline' : 'clipboard-outline'} size={17} color={contacted ? GREEN : '#7C3AED'} />
      </View>
      <View className="flex-1">
        <View className="flex-row flex-wrap items-baseline" style={{ columnGap: 8 }}>
          <Text className="text-[14.5px] font-semibold text-gray-900">{lead.name || 'No name given'}</Text>
          {lead.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${lead.phone}`)}>
              <Text className="text-[11.5px] font-semibold tracking-wide text-gray-600" style={{ fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                {lead.phone}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={toggle} hitSlop={6}>
          <Text className="text-[12px] font-semibold" style={{ color: contacted ? GREEN : '#7C3AED' }}>
            {contacted ? 'Contacted' : 'New lead · tap when called'}
          </Text>
        </Pressable>
        <Text className="mt-0.5 text-[12px] text-gray-500" numberOfLines={2}>
          {meta}
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <View className="items-end" style={{ gap: 8 }}>
        {total ? <Text className="text-[14px] font-semibold text-gray-900">{total}</Text> : null}
        <Pressable onPress={askDelete} hitSlop={8} accessibilityLabel="Delete lead">
          <Ionicons name="trash-outline" size={15} color="#9CA3AF" />
        </Pressable>
      </View>
    </View>
  );
}

/** A small card in the Today's Leads band. */
function TodayLead({ lead }: { lead: WebsiteLead }) {
  const total = leadTotal(lead);
  const detail = (lead.message ?? '').replace(/\s*-\s*Total\s+[^|]+$/i, '');
  return (
    <View className="w-[230px] rounded-xl border border-gray-200 bg-white p-3.5">
      <Text className="text-[14px] font-semibold text-gray-900" numberOfLines={1}>
        {lead.name || 'No name given'}
      </Text>
      <Text className="mt-0.5 text-[12.5px] text-gray-500" numberOfLines={1}>
        {lead.phone || lead.email || 'No phone'}
      </Text>
      {total ? <Text className="mt-1.5 text-[15px] font-semibold text-green-700">{total}</Text> : null}
      {detail ? (
        <Text className="mt-0.5 text-[12px] text-orange-600" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      <Text className="mt-1 text-[12px] text-gray-500">Received: {timeOf(lead.created_at)}</Text>
    </View>
  );
}

// ---------- the page ----------

export function WebsiteScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [days, setDays] = useState<1 | 7 | 30>(30);
  // Where the website code is open: under the top line, above the bottom bar, or nowhere.
  const [codeAt, setCodeAt] = useState<'top' | 'bottom' | null>(null);
  const [allLeads, setAllLeads] = useState(false);
  const [onlyWaiting, setOnlyWaiting] = useState(false);

  const { data: sites = [], isLoading } = useSupabaseQuery('websites', {
    filters: userId ? { owner_id: userId } : {},
    orderBy: { column: 'created_at' },
    enabled: !!userId,
  });
  const site = sites[0] as Website | undefined;

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['website_visits', 'stats', site?.id, days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('website_stats', { p_website: site!.id, p_days: days });
      if (error) throw error;
      return data as Stats;
    },
    enabled: !!site,
    refetchInterval: 60_000,
  });

  // The last 24 hours one by one: the hourly trend for "1 day" and who is on the site right now.
  const { data: lastDay = [] } = useQuery({
    queryKey: ['website_visits', 'last-day', site?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('website_visits')
        .select('created_at, visitor_id')
        .eq('website_id', site!.id)
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as { created_at: string; visitor_id: string | null }[];
    },
    enabled: !!site,
    refetchInterval: 60_000,
  });

  const { data: leads = [] } = useSupabaseQuery('website_leads', {
    filters: site ? { website_id: site.id } : {},
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!site,
  });

  const now = Date.now();
  const today = localDay(new Date());
  const since = now - days * DAY_MS;
  const periodLeads = leads.filter((l) => new Date(l.created_at).getTime() >= since);
  const todayLeads = leads.filter((l) => localDay(new Date(l.created_at)) === today);
  const newLeads = leads.filter((l) => l.status === 'new');
  const waiting = newLeads.filter((l) => now - new Date(l.created_at).getTime() > 2 * DAY_MS);
  const contacted = leads.length - newLeads.length;
  const online = new Set(lastDay.filter((v) => now - new Date(v.created_at).getTime() < 5 * 60 * 1000).map((v) => v.visitor_id)).size;
  const total = stats?.total ?? 0;
  const conversion = stats && stats.unique > 0 ? (periodLeads.length / stats.unique) * 100 : 0;
  const deviceCount = (k: string) => stats?.devices.find((d) => d.label === k)?.count ?? 0;
  const periodWord = days === 1 ? 'last 24 hours' : days === 7 ? 'last 7 days' : 'last 30 days';

  // The trend: hour by hour for a day, day by day (every day, even the empty ones) for a week or a month.
  const trend = useMemo(() => {
    if (days === 1) {
      const start = new Date(now - 23 * 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      const buckets = Array.from({ length: 24 }, (_, i) => new Date(start.getTime() + i * 60 * 60 * 1000));
      const values = buckets.map(() => 0);
      for (const v of lastDay) {
        const i = Math.floor((new Date(v.created_at).getTime() - start.getTime()) / (60 * 60 * 1000));
        if (i >= 0 && i < 24) values[i] += 1;
      }
      return { labels: buckets.map((b) => `${pad2(b.getHours())}:00`), values };
    }
    const byDay = new Map((stats?.days ?? []).map((d) => [d.day, d.count]));
    const dates = Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * DAY_MS));
    return { labels: dates.map((d) => toBsDayChartLabel(d)), values: dates.map((d) => byDay.get(localDay(d)) ?? 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, stats, lastDay]);

  if (!userId || isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-sm text-gray-400">Loading…</Text>
      </View>
    );
  }
  if (!site) {
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
        <ConnectSite userId={userId} />
      </ScrollView>
    );
  }

  const shownLeads = (onlyWaiting ? waiting : leads).slice(0, allLeads ? 200 : 8);
  const devices = (stats?.devices ?? []).map((d) => ({
    ...d,
    name: d.label === 'mobile' ? 'Mobile' : d.label === 'desktop' ? 'Computer' : 'Other',
    color: d.label === 'mobile' ? '#F59E0B' : d.label === 'desktop' ? '#22C55E' : '#8B5CF6',
  }));
  const sourceMax = Math.max(1, ...(stats?.sources ?? []).map((s) => s.count));
  const row = { flexDirection: wide ? ('row' as const) : ('column' as const), gap: 20 };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: wide ? 24 : 14, paddingBottom: 48, gap: 20 }}>
      {/* Top line: the site, who is on it now, today's date, the code. */}
      <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 10 }}>
        <Pressable onPress={() => Linking.openURL(`https://${site.domain}`)} className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="globe-outline" size={20} color={BLUE} />
          <Text className="text-[20px] font-bold text-gray-900">{site.domain}</Text>
          <Ionicons name="open-outline" size={14} color="#9CA3AF" />
        </Pressable>
        <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
          <View className="flex-row items-center rounded-lg border border-green-200 bg-green-50 px-3 py-1.5" style={{ gap: 6 }}>
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: online ? '#22C55E' : '#9CA3AF' }} />
            <Ionicons name="people-outline" size={14} color={GREEN} />
            <Text className="text-[12.5px] font-semibold text-green-700">
              {online} visitor{online === 1 ? '' : 's'} online
            </Text>
          </View>
          <View className="flex-row items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5" style={{ gap: 6 }}>
            <Ionicons name="calendar-outline" size={14} color={BLUE} />
            <Text className="text-[12.5px] font-semibold text-blue-700">{toBsLabel(today)} BS</Text>
          </View>
          <Pressable onPress={() => setCodeAt((c) => (c === 'top' ? null : 'top'))} className="flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5" style={{ gap: 6 }}>
            <Ionicons name="code-slash-outline" size={14} color="#374151" />
            <Text className="text-[12.5px] font-semibold text-gray-700">Website code</Text>
          </Pressable>
        </View>
      </View>

      {codeAt === 'top' || (codeAt === null && stats && stats.total === 0 && leads.length === 0) ? <InstallCard site={site} /> : null}

      {/* Summary band and today's leads. */}
      <View className={`${CARD} p-5`}>
        <Text className="text-[16px] font-semibold text-gray-900">Website Summary</Text>
        <Text className="mt-0.5 text-[12.5px] text-gray-500">
          {periodWord[0].toUpperCase() + periodWord.slice(1)} · to {toBsLabel(today)}
        </Text>
        <View className="mt-4 flex-row flex-wrap" style={{ gap: 14 }}>
          <SummaryTile icon="eye-outline" label="Total visits" value={loadingStats ? '…' : fmt(total)} note={`${fmt(stats?.unique ?? 0)} visitors`} color="#3B82F6" />
          <SummaryTile icon="chatbubbles-outline" label="Total leads" value={fmt(periodLeads.length)} note={`${newLeads.length} waiting for a call`} color="#22C55E" />
          <SummaryTile
            icon="trending-up-outline"
            label="Conversion"
            value={`${conversion.toFixed(1)}%`}
            note={conversion > 0 ? 'Visitors who sent an enquiry' : 'No enquiries in this period'}
            color="#059669"
          />
        </View>
        <View className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <View className="mb-3 flex-row items-center" style={{ gap: 8 }}>
            <Ionicons name="sparkles-outline" size={16} color={GREEN} />
            <Text className="text-[14.5px] font-semibold text-green-700">Today's Leads</Text>
            <View className="rounded-full bg-green-100 px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-green-700">{todayLeads.length} today</Text>
            </View>
          </View>
          {todayLeads.length === 0 ? (
            <Text className="py-2 text-[12.5px] text-green-700" style={{ opacity: 0.7 }}>
              No enquiries yet today.
            </Text>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
              {todayLeads.slice(0, 8).map((l) => (
                <TodayLead key={l.id} lead={l} />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Three figures. */}
      <View className="flex-row flex-wrap" style={{ gap: 20 }}>
        <KpiCard label="Unique visitors" value={fmt(stats?.unique ?? 0)} note={periodWord} icon="people-outline" color="#3B82F6" />
        <KpiCard label="Visits today" value={fmt(stats?.today ?? 0)} note={`${online} on the site now`} icon="pulse-outline" color="#6366F1" />
        <KpiCard label="New leads" value={fmt(newLeads.length)} note="Not called yet" icon="call-outline" color="#F97316" />
      </View>

      {/* Trend beside the lead alerts. */}
      <View style={row}>
        <Panel
          title="Visits trend"
          subtitle={`${fmt(total)} visits in the ${periodWord}`}
          right={<Segment value={days} options={PERIODS} onChange={setDays} />}
          style={{ flex: wide ? 2 : undefined }}
        >
          <LineChart
            labels={trend.labels}
            series={[{ key: 'visits', label: 'Visits', color: '#059669', values: trend.values, area: true }]}
            height={260}
            formatValue={(v) => `${fmt(v)} visit${v === 1 ? '' : 's'}`}
            emptyText="No visits in this period yet"
          />
        </Panel>
        <Panel title="Lead Alerts" style={{ flex: wide ? 1 : undefined }}>
          <View style={{ gap: 12 }}>
            <AlertTile title="New Leads" note="Not called yet. Call them today." count={newLeads.length} tone="red" />
            <AlertTile
              title="Waiting Over 2 Days"
              note="Enquiries nobody has called back."
              count={waiting.length}
              tone="orange"
              onPress={waiting.length ? () => setOnlyWaiting(true) : undefined}
            />
            <AlertTile title="Contacted" note="Leads you have already called." count={contacted} tone="yellow" />
            <AlertTile title="Mobile Visitors" note={`Visits from phones in the ${periodWord}.`} count={deviceCount('mobile')} tone="blue" />
          </View>
        </Panel>
      </View>

      {/* Sources and pages. */}
      <View style={row}>
        <Panel title="Traffic Sources" subtitle={`Where visitors came from · ${periodWord}`} style={{ flex: wide ? 1 : undefined }}>
          {(stats?.sources ?? []).length === 0 ? (
            <Empty text="No visits in this period yet" />
          ) : (
            <View style={{ gap: 10 }}>
              {stats!.sources.map((s) => (
                <View key={s.label} className="flex-row items-center" style={{ gap: 10 }}>
                  <Text className="w-[110px] text-right text-[12.5px] text-gray-600" numberOfLines={1}>
                    {s.label}
                  </Text>
                  <View className="h-4 flex-1 justify-center border-l border-gray-300">
                    <View className="h-3.5 rounded-r" style={{ width: `${(s.count / sourceMax) * 100}%`, backgroundColor: '#3B82F6' }} />
                  </View>
                  <Text className="w-[40px] text-[12.5px] font-semibold text-gray-900">{s.count}</Text>
                </View>
              ))}
            </View>
          )}
        </Panel>
        <Panel title="Top Pages" subtitle={`Most opened · ${periodWord}`} style={{ flex: wide ? 1 : undefined }}>
          {(stats?.pages ?? []).length === 0 ? (
            <Empty text="No visits in this period yet" />
          ) : (
            <View>
              <View className="flex-row border-b border-gray-200 pb-2">
                <Text className="w-[30px] text-[11.5px] font-semibold text-gray-600">#</Text>
                <Text className="flex-1 text-[11.5px] font-semibold text-gray-600">Page</Text>
                <Text className="w-[70px] text-right text-[11.5px] font-semibold text-gray-600">Visits</Text>
                <Text className="w-[60px] text-right text-[11.5px] font-semibold text-gray-600">Share</Text>
              </View>
              {stats!.pages.map((p, i) => (
                <View key={p.label} className="flex-row items-center border-b border-gray-100 py-3">
                  <Text className="w-[30px] text-[12px] text-gray-400">{i + 1}</Text>
                  <View className="flex-1 pr-3">
                    <Text className="text-[13.5px] text-gray-900" numberOfLines={1}>
                      {p.label === '/' ? 'Home' : p.label}
                    </Text>
                    <View className="mt-1.5 h-1 rounded-full bg-gray-100">
                      <View className="h-1 rounded-full" style={{ width: `${(p.count / Math.max(1, total)) * 100}%`, backgroundColor: BLUE }} />
                    </View>
                  </View>
                  <Text className="w-[70px] text-right text-[13px] text-gray-900">{fmt(p.count)}</Text>
                  <Text className="w-[60px] text-right text-[13px] font-semibold text-blue-600">{((p.count / Math.max(1, total)) * 100).toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          )}
        </Panel>
      </View>

      {/* Google: Search Console and Analytics. */}
      <GoogleSection site={site} days={days} wide={wide} />

      {/* Leads section. */}
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <Text className="text-[14.5px] font-semibold text-gray-800">Leads</Text>
        <View className="h-px flex-1 bg-gray-200" />
      </View>

      <View style={row}>
        <Panel title="Visitors by Device" subtitle="What people open your website on" style={{ flex: wide ? 1 : undefined }}>
          <View className="flex-row border-b border-gray-200 pb-2">
            <Text className="flex-1 text-[11.5px] font-semibold text-gray-600">Device</Text>
            <Text className="w-[70px] text-right text-[11.5px] font-semibold text-gray-600">Visits</Text>
            <Text className="w-[64px] text-right text-[11.5px] font-semibold text-gray-600">Share</Text>
          </View>
          {devices.length === 0 ? (
            <Empty text="No visits in this period yet" />
          ) : (
            devices.map((d) => (
              <View key={d.label} className="flex-row items-center border-b border-gray-100 py-3.5">
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <Text className="text-[13.5px] text-gray-900">{d.name}</Text>
                  </View>
                  <View className="mt-2 h-1.5 rounded-full bg-gray-100">
                    <View className="h-1.5 rounded-full" style={{ width: `${(d.count / Math.max(1, total)) * 100}%`, backgroundColor: d.color }} />
                  </View>
                </View>
                <Text className="w-[70px] text-right text-[13px] text-gray-700">{fmt(d.count)}</Text>
                <Text className="w-[64px] text-right text-[13px] font-semibold text-blue-600">{((d.count / Math.max(1, total)) * 100).toFixed(1)}%</Text>
              </View>
            ))
          )}
          <View className="flex-row items-center py-3.5">
            <Text className="flex-1 text-[13.5px] font-semibold text-gray-900">All Devices</Text>
            <Text className="w-[70px] text-right text-[13px] font-semibold text-gray-900">{fmt(total)}</Text>
            <Text className="w-[64px] text-right text-[13px] font-semibold text-gray-900">100%</Text>
          </View>
          {waiting.length > 0 ? (
            <Pressable onPress={() => setOnlyWaiting(true)} className="mt-1 flex-row items-center rounded-xl bg-red-50 px-4 py-3" style={{ gap: 8 }}>
              <Ionicons name="time-outline" size={16} color="#B42318" />
              <Text className="flex-1 text-[13.5px] font-semibold text-red-700">
                {waiting.length} Lead{waiting.length === 1 ? '' : 's'} Waiting Over 2 Days
              </Text>
              <Ionicons name="chevron-forward" size={15} color="#B42318" />
            </Pressable>
          ) : null}
        </Panel>

        <Panel
          title={onlyWaiting ? 'Leads Waiting Over 2 Days' : 'Recent Leads'}
          subtitle="Enquiries and orders sent from your website"
          right={
            <Pressable onPress={() => (onlyWaiting ? setOnlyWaiting(false) : setAllLeads((a) => !a))}>
              <Text className="text-[13px] font-semibold text-blue-600">{onlyWaiting ? 'Show all' : allLeads ? 'Show less' : 'View All'}</Text>
            </Pressable>
          }
          style={{ flex: wide ? 1 : undefined }}
        >
          {shownLeads.length === 0 ? <Empty text="No enquiries yet." /> : shownLeads.map((l) => <LeadRow key={l.id} lead={l} />)}
        </Panel>
      </View>

      {codeAt === 'bottom' ? <InstallCard site={site} /> : null}

      {/* Bottom bar, for the website code. */}
      <View className="flex-row flex-wrap items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4" style={{ gap: 12 }}>
        <View className="flex-1">
          <Text className="text-[14.5px] font-semibold text-blue-800">Adding a new page to your website?</Text>
          <Text className="mt-0.5 text-[12.5px] text-blue-700">Paste the website code into its header too, so its visits and enquiries show here.</Text>
        </View>
        <Pressable onPress={() => setCodeAt((c) => (c === 'bottom' ? null : 'bottom'))} className="rounded-lg px-4 py-2" style={{ backgroundColor: BLUE }}>
          <Text className="text-[13.5px] font-semibold text-white">Website code</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
