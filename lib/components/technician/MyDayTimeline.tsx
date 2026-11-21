// lib/components/technician/MyDayTimeline.tsx
import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSupabaseQuery } from '../../hooks/useSupabase';
import { useMyEmployment } from '../../hooks/useTechnicianEmployment';
import { useTick } from '../TeamActivity';
import { useCalendarMode, dateLabels } from '../../hooks/useCalendarMode';
import { localTodayIso } from '../../utils/localDate';
import {
  EmployeeDay,
  useJobTimes,
  workedOn,
  offeredOn,
  minutesOf,
  minutesLabel,
  dayFigures,
  busyIntervals,
  HOUR_PX,
  type DayItem,
} from '../requests/WorkHubPanel';
import type { ServiceRequest } from '../../../types/database.types';

const BLUE = '#2563EB';
/** How tall the gantt's visible window is before it scrolls - about 11-12 hours, enough to see a
 * whole shift without the mostly-empty overnight hours pushing the dashboard's other cards away. */
const VISIBLE_PX = 420;

function clockText(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** A live job on the timeline - just enough to tap through to it, not the reseller's full job card
 * (reassign and the rest of that toolkit isn't this technician's own job to work with). */
function MiniJobCard({ request }: { request: ServiceRequest }) {
  return (
    <Pressable
      onPress={() => router.push(`/(technician)/job/${request.id}`)}
      className="rounded-xl border border-blue-100 bg-blue-50 p-2.5"
      style={{ gap: 2 }}
    >
      <Text className="text-[12px] font-bold text-gray-900" numberOfLines={1}>
        {request.issue_type}
      </Text>
      <Text className="text-[10.5px] text-gray-500" numberOfLines={1}>
        {request.customer_name ?? 'Customer'}
      </Text>
    </Pressable>
  );
}

function StatChip({ icon, label, value, color, bg }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string; bg: string }) {
  return (
    <View className="flex-1 flex-row items-center rounded-xl px-3 py-2.5" style={{ backgroundColor: bg, gap: 8 }}>
      <Ionicons name={icon} size={16} color={color} />
      <View style={{ gap: 1 }}>
        <Text className="text-[10px] font-bold uppercase text-gray-500" style={{ letterSpacing: 0.4 }}>
          {label}
        </Text>
        <Text className="text-[14.5px] font-extrabold" style={{ color }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Today's own Assigned/Accepted timeline - the same gantt the reseller's Work Hub draws for the whole
 * team (see WorkHubPanel's EmployeeDay), but just this one technician's own day, on their own
 * Dashboard. Nothing here is anyone else's work: only their own requests and their own duty hours.
 * Nothing shows for someone not on a team - there is no duty time to measure a day against. */
export function MyDayTimeline({ technicianId }: { technicianId: string }) {
  const [calendarMode] = useCalendarMode();
  const { current: employment } = useMyEmployment(technicianId);
  const { data: requests } = useSupabaseQuery('service_requests', {
    filters: { technician_id: technicianId },
    enabled: !!technicianId,
  });
  const ids = useMemo(() => (requests ?? []).map((r) => r.id).sort(), [requests]);
  const jobTimes = useJobTimes(ids);
  const now = useTick(30_000);

  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  const today = localTodayIso();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const nowMin = (now - dayStart) / 60_000;
  const dutyFrom = minutesOf(employment?.work_start_time, 9 * 60);
  const dutyTo = minutesOf(employment?.work_end_time, 17 * 60);

  // Centers the visible window a little ahead of now, once - a manual scroll afterward is left alone.
  useEffect(() => {
    if (scrolled.current || !employment) return;
    scrolled.current = true;
    const y = Math.max(0, ((nowMin - 90) / 60) * HOUR_PX);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  }, [employment, nowMin]);

  if (!employment) return null;

  const all = requests ?? [];
  const spans = workedOn(all, jobTimes, technicianId, dayStart, now);
  const offers = offeredOn(all, jobTimes, technicianId, dayStart, now);
  const figures = dayFigures(spans, dutyFrom, dutyTo, nowMin);

  const liveIds = new Set(all.filter((r) => r.status === 'in_progress' || r.status === 'assigned').map((r) => r.id));
  const dayItems: DayItem[] = [
    ...offers.map((o): DayItem => ({ id: `offer:${o.id}`, request: o.request, kind: 'offer', from: o.from, to: o.to, live: o.waiting, open: o.waiting })),
    ...spans.map((s): DayItem => ({ id: `work:${s.id}`, request: s.request, kind: 'work', from: s.from, to: s.to, live: s.running, open: s.running })),
  ].filter((item) => !item.live || liveIds.has(item.request.id));

  return (
    <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <View className="flex-row items-center gap-3 px-4 py-3.5" style={{ backgroundColor: '#EFF6FF' }}>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
          <Ionicons name="calendar" size={18} color={BLUE} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-gray-900" numberOfLines={1}>
            {dateLabels(today, calendarMode)[0] || 'Today'}
          </Text>
          <Text className="text-[11px] text-gray-600" numberOfLines={1}>
            {dateLabels(today, calendarMode)[1]} · On duty {employment.work_start_time?.slice(0, 5) ?? '09:00'}–
            {employment.work_end_time?.slice(0, 5) ?? '17:00'}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] font-bold uppercase text-blue-600" style={{ letterSpacing: 0.4 }}>
            Now
          </Text>
          <Text className="text-[13px] font-extrabold text-blue-700">{clockText(now)}</Text>
        </View>
      </View>

      <View className="flex-row px-4 pt-3.5" style={{ gap: 8 }}>
        <StatChip icon="checkmark-done" label="Worked" value={minutesLabel(figures.worked)} color="#15803D" bg="#F0FDF4" />
        <StatChip icon="time-outline" label="Idle" value={minutesLabel(figures.unused)} color="#B91C1C" bg="#FEF2F2" />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: VISIBLE_PX, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        nestedScrollEnabled
      >
        <EmployeeDay
          items={dayItems}
          busy={busyIntervals(spans)}
          dutyFrom={dutyFrom}
          dutyTo={dutyTo}
          nowMin={nowMin}
          showNow
          renderCard={(r) => <MiniJobCard request={r} />}
        />
      </ScrollView>
      <Text className="px-4 pb-3.5 pt-1 text-[10.5px] text-gray-400">Scroll to see the rest of the day.</Text>
    </View>
  );
}
