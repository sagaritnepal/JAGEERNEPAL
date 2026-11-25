// lib/components/MarketingScreen.tsx
//
// A reseller's Marketing tab: Leads (a read-only funnel rollup of their own Service Requests and
// Marketplace Orders - no new table, just a marketing-focused lens on data the app already keeps)
// and Visits (how many people opened their public shop/profile over the last 30 days, from the
// anonymous profile_visits log - see migration 0110 and useLogProfileVisit).
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../hooks/useAuth';
import { useSupabaseQuery } from '../hooks/useSupabase';
import { STATUS_STYLES } from '../constants/requestStatus';
import { Card, CARD_SHADOW } from './finance/dashboard/FinanceDashboard';
import type { OrderStatus } from '../../types/database.types';

const npr = (n: number) => `NPR ${Math.round(n).toLocaleString()}`;

const ORDER_STATUS_STYLES: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Pending' },
  confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Confirmed' },
  shipped: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Shipped' },
  delivered: { bg: 'bg-green-50', text: 'text-green-700', label: 'Delivered' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-600', label: 'Cancelled' },
};

type View_ = 'leads' | 'visits';

function Segmented({ value, onChange }: { value: View_; onChange: (v: View_) => void }) {
  return (
    <View className="mb-4 flex-row rounded-xl bg-gray-100 p-1">
      {(['leads', 'visits'] as const).map((v) => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          className={`flex-1 items-center rounded-lg py-2 ${v === value ? 'bg-white' : ''}`}
          style={v === value ? CARD_SHADOW : undefined}
        >
          <Text className={`text-sm font-bold ${v === value ? 'text-blue-600' : 'text-gray-500'}`}>
            {v === 'leads' ? 'Leads' : 'Visits'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <View className="min-w-[88px] flex-1 items-center rounded-xl bg-gray-50 px-3 py-3">
      <Text className="text-xl font-extrabold" style={color ? { color } : undefined}>
        {value}
      </Text>
      <Text className="mt-0.5 text-center text-[11px] text-gray-500">{label}</Text>
    </View>
  );
}

export function MarketingScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const [view, setView] = useState<View_>('leads');
  const router = useRouter();

  const { data: requests = [], isLoading: loadingRequests } = useSupabaseQuery('service_requests', {
    filters: userId ? { reseller_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!userId,
  });
  const { data: orders = [], isLoading: loadingOrders } = useSupabaseQuery('orders', {
    filters: userId ? { seller_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!userId,
  });
  const { data: visits = [], isLoading: loadingVisits } = useSupabaseQuery('profile_visits', {
    filters: userId ? { profile_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!userId && view === 'visits',
  });

  const reqCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const orderStats = useMemo(() => {
    const c: Record<string, number> = {};
    let revenue = 0;
    for (const o of orders) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (o.status === 'delivered') revenue += Number(o.total_amount) || 0;
    }
    return { c, revenue };
  }, [orders]);

  const visitStats = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = visits.filter((v) => new Date(v.created_at).getTime() >= since);
    const byDay = new Map<string, number>();
    const uniq = new Set<string>();
    for (const v of recent) {
      const day = v.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (v.viewer_id) uniq.add(v.viewer_id);
    }
    const days = [...byDay.keys()].sort().reverse().slice(0, 14);
    return { total: recent.length, unique: uniq.size, days: days.map((day) => ({ day, count: byDay.get(day)! })) };
  }, [visits]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Segmented value={view} onChange={setView} />

      {/* The shop's own website (e.g. mansa.com.np): its visitors and enquiries live on the Website page. */}
      <Pressable
        onPress={() => router.push('/(reseller)/website' as any)}
        className="mb-4 flex-row items-center rounded-2xl border border-blue-100 bg-white px-4 py-3"
        style={{ gap: 10 }}
      >
        <Ionicons name="globe-outline" size={20} color="#2563EB" />
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-gray-900">Your website</Text>
          <Text className="text-[12px] text-gray-500">Visitors and enquiries from your own website</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </Pressable>

      {view === 'leads' ? (
        <>
          <Card title="Service requests" subtitle="Every booking sent to you, by stage">
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              <StatPill label="New" value={(reqCounts.pending ?? 0) + (reqCounts.quoted ?? 0)} color="#D97706" />
              <StatPill
                label="In progress"
                value={(reqCounts.approved ?? 0) + (reqCounts.assigned ?? 0) + (reqCounts.in_progress ?? 0)}
                color="#2563EB"
              />
              <StatPill label="Resolved" value={reqCounts.resolved ?? 0} color="#15803D" />
              <StatPill label="Cancelled" value={reqCounts.cancelled ?? 0} color="#DC2626" />
            </View>
            {loadingRequests ? (
              <Text className="mt-4 text-center text-sm text-gray-400">Loading…</Text>
            ) : requests.length === 0 ? (
              <Text className="mt-4 text-center text-sm text-gray-400">No service requests yet.</Text>
            ) : (
              <View className="mt-4" style={{ gap: 10 }}>
                {requests.slice(0, 8).map((r) => (
                  <View key={r.id} className="flex-row items-center justify-between border-t border-gray-100 pt-3">
                    <View style={{ flexShrink: 1, flexGrow: 1 }}>
                      <Text className="text-sm font-semibold text-gray-900">{r.customer_name || 'Client'}</Text>
                      <Text className="text-xs text-gray-400">
                        {r.issue_type} · {new Date(r.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[r.status].bg}`}>
                      <Text className={`text-[10px] font-semibold capitalize ${STATUS_STYLES[r.status].text}`}>
                        {STATUS_STYLES[r.status].label}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <View className="h-4" />

          <Card title="Marketplace orders" subtitle="Product orders placed with you, by stage">
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              <StatPill label="Pending" value={orderStats.c.pending ?? 0} color="#D97706" />
              <StatPill label="Shipped" value={(orderStats.c.confirmed ?? 0) + (orderStats.c.shipped ?? 0)} color="#2563EB" />
              <StatPill label="Delivered" value={orderStats.c.delivered ?? 0} color="#15803D" />
              <StatPill label="Revenue" value={npr(orderStats.revenue)} color="#15803D" />
            </View>
            {loadingOrders ? (
              <Text className="mt-4 text-center text-sm text-gray-400">Loading…</Text>
            ) : orders.length === 0 ? (
              <Text className="mt-4 text-center text-sm text-gray-400">No orders yet.</Text>
            ) : (
              <View className="mt-4" style={{ gap: 10 }}>
                {orders.slice(0, 8).map((o) => (
                  <View key={o.id} className="flex-row items-center justify-between border-t border-gray-100 pt-3">
                    <Text className="text-xs text-gray-400">
                      #{o.ticket_no ?? o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleDateString()}
                    </Text>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Text className="text-sm font-bold text-gray-900">{npr(o.total_amount)}</Text>
                      <View className={`rounded-full px-2 py-0.5 ${ORDER_STATUS_STYLES[o.status].bg}`}>
                        <Text className={`text-[10px] font-semibold ${ORDER_STATUS_STYLES[o.status].text}`}>
                          {ORDER_STATUS_STYLES[o.status].label}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      ) : (
        <Card title="Shop visits" subtitle="Last 30 days · no names or personal details recorded">
          <View className="flex-row" style={{ gap: 10 }}>
            <StatPill label="Page views" value={visitStats.total} color="#2563EB" />
            <StatPill label="Unique visitors" value={visitStats.unique} color="#2563EB" />
          </View>
          {loadingVisits ? (
            <Text className="mt-4 text-center text-sm text-gray-400">Loading…</Text>
          ) : visitStats.days.length === 0 ? (
            <Text className="mt-4 text-center text-sm text-gray-400">No visits recorded yet.</Text>
          ) : (
            <View className="mt-4" style={{ gap: 8 }}>
              {visitStats.days.map(({ day, count }) => (
                <View key={day} className="flex-row items-center justify-between border-t border-gray-100 pt-2">
                  <Text className="text-xs text-gray-500">{day}</Text>
                  <Text className="text-sm font-semibold text-gray-900">
                    {count} view{count === 1 ? '' : 's'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}
