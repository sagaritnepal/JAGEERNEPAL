// lib/components/technician/MyDayTimeline.tsx
import { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSupabaseQuery } from '../../hooks/useSupabase';
import { useMyEmployment } from '../../hooks/useTechnicianEmployment';
import {
  EmployeeDay,
  useJobTimes,
  workedOn,
  offeredOn,
  minutesOf,
  minutesLabel,
  dayFigures,
  busyIntervals,
  WORKED_GREEN,
  UNUSED_RED,
  type DayItem,
} from '../requests/WorkHubPanel';
import type { ServiceRequest } from '../../../types/database.types';

const CARD = 'rounded-2xl border border-gray-200 bg-white';

/** A live job on the timeline - just enough to tap through to it, not the reseller's full job card
 * (reassign and the rest of that toolkit isn't this technician's own job to work with). */
function MiniJobCard({ request }: { request: ServiceRequest }) {
  return (
    <Pressable
      onPress={() => router.push(`/(technician)/job/${request.id}`)}
      className="rounded-xl border border-gray-200 bg-white p-2.5"
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

/** Today's own Assigned/Accepted timeline - the same gantt the reseller's Work Hub draws for the whole
 * team (see WorkHubPanel's EmployeeDay), but just this one technician's own day, on their own
 * Dashboard. Nothing here is anyone else's work: only their own requests and their own duty hours.
 * Nothing shows for someone not on a team - there is no duty time to measure a day against. */
export function MyDayTimeline({ technicianId }: { technicianId: string }) {
  const { current: employment } = useMyEmployment(technicianId);
  const { data: requests } = useSupabaseQuery('service_requests', {
    filters: { technician_id: technicianId },
    enabled: !!technicianId,
  });
  const ids = useMemo(() => (requests ?? []).map((r) => r.id).sort(), [requests]);
  const jobTimes = useJobTimes(ids);

  if (!employment) return null;

  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const nowMin = (now - dayStart) / 60_000;
  const dutyFrom = minutesOf(employment.work_start_time, 9 * 60);
  const dutyTo = minutesOf(employment.work_end_time, 17 * 60);

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
    <View className={CARD} style={{ padding: 16, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text className="text-base font-bold text-gray-900">Today's timeline</Text>
        <Text className="text-[11px] text-gray-600">
          On duty {employment.work_start_time?.slice(0, 5) ?? '09:00'}–{employment.work_end_time?.slice(0, 5) ?? '17:00'}
        </Text>
        <View className="flex-row flex-wrap items-center" style={{ columnGap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: WORKED_GREEN }} />
            <Text className="text-[11px] font-semibold text-gray-700">Worked {minutesLabel(figures.worked)}</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: UNUSED_RED }} />
            <Text className="text-[11px] font-semibold text-gray-700">Not used {minutesLabel(figures.unused)}</Text>
          </View>
        </View>
      </View>
      <EmployeeDay
        items={dayItems}
        busy={busyIntervals(spans)}
        dutyFrom={dutyFrom}
        dutyTo={dutyTo}
        nowMin={nowMin}
        showNow
        renderCard={(r) => <MiniJobCard request={r} />}
      />
    </View>
  );
}
