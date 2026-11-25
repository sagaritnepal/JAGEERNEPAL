// lib/components/website/WebsiteScreen.tsx
//
// Website: the reseller's own website (e.g. mansa.com.np) - its visitors and the leads its forms send.
// The site carries a small script copied from this page; it calls track_website_visit / submit_website_lead
// (migration 0127) with the site's key. Figures are counted in the database by website_stats.
import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useSupabaseDelete, useSupabaseInsert, useSupabaseQuery, useSupabaseUpdate } from '../../hooks/useSupabase';
import { showAlert, getErrorMessage } from '../../utils/alert';
import { Card } from '../finance/dashboard/FinanceDashboard';
import type { Website, WebsiteLead } from '../../../types/database.types';

const BLUE = '#2563EB';
const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

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

function Stat({ label, value, color = BLUE }: { label: string; value: number | string; color?: string }) {
  return (
    <View className="min-w-[110px] flex-1 rounded-xl border border-gray-100 bg-white px-4 py-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</Text>
      <Text className="mt-1 text-2xl font-extrabold" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

/** A ranked list with a bar behind each count. */
function Ranked({ rows, empty }: { rows: Count[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <Text className="py-3 text-center text-sm text-gray-400">{empty}</Text>;
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <View key={r.label} className="overflow-hidden rounded-lg bg-gray-50">
          <View className="absolute bottom-0 left-0 top-0 bg-blue-100" style={{ width: `${(r.count / max) * 100}%` }} />
          <View className="flex-row items-center justify-between px-3 py-2">
            <Text className="mr-2 flex-1 text-[13px] text-gray-800" numberOfLines={1}>
              {r.label}
            </Text>
            <Text className="text-[13px] font-bold text-gray-900">{r.count}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

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
    <Card title="Connect your website" subtitle="See who visits your website and the enquiries it receives, right here.">
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
    </Card>
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
    <Card
      title="Add this code to your website"
      subtitle={`Paste it once into every page of ${site.domain}, just before </head> (or in the site's "header scripts" setting). Visits and form enquiries then show here.`}
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
    </Card>
  );
}

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
  const extra = Object.entries(lead.fields ?? {}).filter(
    ([, v]) => v && v !== lead.name && v !== lead.phone && v !== lead.email && !(lead.message ?? '').includes(v),
  );
  return (
    <View className="border-t border-gray-100 py-3">
      <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-gray-900">{lead.name || 'No name given'}</Text>
          <Text className="mt-0.5 text-[11.5px] text-gray-400">
            {new Date(lead.created_at).toLocaleString()} · {lead.page || '/'}
          </Text>
        </View>
        <Pressable onPress={toggle} className={`rounded-full px-2.5 py-1 ${contacted ? 'bg-green-50' : 'bg-amber-50'}`}>
          <Text className={`text-[11px] font-semibold ${contacted ? 'text-green-700' : 'text-amber-600'}`}>
            {contacted ? 'Contacted' : 'New'}
          </Text>
        </Pressable>
        <Pressable onPress={askDelete} hitSlop={8} accessibilityLabel="Delete lead">
          <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
        </Pressable>
      </View>
      <View className="mt-1.5 flex-row flex-wrap" style={{ columnGap: 14, rowGap: 4 }}>
        {lead.phone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${lead.phone}`)} className="flex-row items-center" style={{ gap: 4 }}>
            <Ionicons name="call-outline" size={13} color={BLUE} />
            <Text className="text-[13px] font-semibold" style={{ color: BLUE }}>
              {lead.phone}
            </Text>
          </Pressable>
        ) : null}
        {lead.email ? (
          <Pressable onPress={() => Linking.openURL(`mailto:${lead.email}`)} className="flex-row items-center" style={{ gap: 4 }}>
            <Ionicons name="mail-outline" size={13} color={BLUE} />
            <Text className="text-[13px] font-semibold" style={{ color: BLUE }}>
              {lead.email}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {lead.message ? <Text className="mt-1.5 text-[13px] leading-[19px] text-gray-700">{lead.message}</Text> : null}
      {extra.length > 0 ? (
        <Text className="mt-1 text-[12px] text-gray-500">{extra.map(([k, v]) => `${k}: ${v}`).join(' · ')}</Text>
      ) : null}
    </View>
  );
}

export function WebsiteScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [days, setDays] = useState<number>(30);
  const [showCode, setShowCode] = useState(false);

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

  const { data: leads = [] } = useSupabaseQuery('website_leads', {
    filters: site ? { website_id: site.id } : {},
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!site,
  });

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const periodLeads = leads.filter((l) => new Date(l.created_at).getTime() >= since);
  const newLeads = leads.filter((l) => l.status === 'new').length;
  const daily = stats?.days ?? [];
  const dayMax = Math.max(1, ...daily.map((d) => d.count));
  const noData = !!stats && stats.total === 0 && leads.length === 0;

  if (!userId || isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-sm text-gray-400">Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      {!site ? (
        <ConnectSite userId={userId} />
      ) : (
        <>
          <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 10 }}>
            <Pressable onPress={() => Linking.openURL(`https://${site.domain}`)} className="flex-row items-center" style={{ gap: 6 }}>
              <Ionicons name="globe-outline" size={18} color={BLUE} />
              <Text className="text-[17px] font-extrabold text-gray-900">{site.domain}</Text>
              <Ionicons name="open-outline" size={14} color="#9CA3AF" />
            </Pressable>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="flex-row rounded-lg bg-gray-100 p-1">
                {PERIODS.map((p) => (
                  <Pressable
                    key={p.days}
                    onPress={() => setDays(p.days)}
                    className={`rounded-md px-3 py-1.5 ${days === p.days ? 'bg-white' : ''}`}
                  >
                    <Text className={`text-[12px] font-bold ${days === p.days ? 'text-blue-600' : 'text-gray-500'}`}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => setShowCode((s) => !s)}
                className="flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5"
                style={{ gap: 6 }}
              >
                <Ionicons name="code-slash-outline" size={14} color="#374151" />
                <Text className="text-[12px] font-semibold text-gray-700">Website code</Text>
              </Pressable>
            </View>
          </View>

          {showCode || noData ? <InstallCard site={site} /> : null}

          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            <Stat label="Visits" value={stats?.total ?? '–'} />
            <Stat label="Visitors" value={stats?.unique ?? '–'} />
            <Stat label="Today" value={stats?.today ?? '–'} />
            <Stat label="Leads" value={periodLeads.length} color="#15803D" />
            <Stat label="New leads" value={newLeads} color="#D97706" />
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
            <View style={{ flex: wide ? 3 : undefined, gap: 16 }}>
              <Card title="Leads" subtitle="Enquiries sent from your website's forms. Tap New / Contacted to mark them.">
                {leads.length === 0 ? (
                  <Text className="py-3 text-center text-sm text-gray-400">No enquiries yet.</Text>
                ) : (
                  leads.slice(0, 50).map((l) => <LeadRow key={l.id} lead={l} />)
                )}
              </Card>
              <Card title="Visits by day" subtitle={`Last ${days} days`}>
                {loadingStats ? (
                  <Text className="py-3 text-center text-sm text-gray-400">Loading…</Text>
                ) : daily.length === 0 ? (
                  <Text className="py-3 text-center text-sm text-gray-400">No visits yet.</Text>
                ) : (
                  <View style={{ gap: 5 }}>
                    {daily.slice(0, 31).map((d) => (
                      <View key={d.day} className="flex-row items-center" style={{ gap: 10 }}>
                        <Text className="w-[78px] text-[12px] text-gray-500">{d.day}</Text>
                        <View className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                          <View className="h-4 rounded" style={{ width: `${(d.count / dayMax) * 100}%`, backgroundColor: BLUE }} />
                        </View>
                        <Text className="w-[36px] text-right text-[12px] font-bold text-gray-900">{d.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </View>
            <View style={{ flex: wide ? 2 : undefined, gap: 16 }}>
              <Card title="Where visitors come from">
                <Ranked rows={stats?.sources ?? []} empty="No visits yet." />
              </Card>
              <Card title="Most opened pages">
                <Ranked rows={stats?.pages ?? []} empty="No visits yet." />
              </Card>
              <Card title="Devices">
                <Ranked
                  rows={(stats?.devices ?? []).map((d) => ({ ...d, label: d.label === 'mobile' ? 'Mobile' : d.label === 'desktop' ? 'Computer' : d.label }))}
                  empty="No visits yet."
                />
              </Card>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
