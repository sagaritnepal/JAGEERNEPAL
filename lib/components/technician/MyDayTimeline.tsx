// lib/components/technician/MyDayTimeline.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSupabaseQuery } from '../../hooks/useSupabase';
import { useMyEmployment } from '../../hooks/useTechnicianEmployment';
import { useTick } from '../TeamActivity';
import { useJobTimes, workedOn, minutesOf, minutesLabel, dayFigures, busyIntervals, WORKED_GREEN, UNUSED_RED } from '../requests/WorkHubPanel';

const BLUE = '#2563EB';
const DAY_MS = 24 * 60 * 60 * 1000;
/** One calendar row's height, and the gap the rows sit at - together they're what a month-change
 * auto-scroll steps by to land on today's row. */
const ROW_H = 26;
const ROW_GAP = 4;
const ROW_STEP = ROW_H + ROW_GAP;
/** How tall the month's visible window is before it scrolls - enough rows to get a feel for the
 * month without pushing the rest of the dashboard down a full screen's worth. */
const VISIBLE_PX = 300;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Every 3 hours across the day - evenly spaced, so eight equal-width labels line up with the same
 * eight points a day row's hour track is measured against. */
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

function hourTickLabel(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
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

/** One calendar day: its date on the left, then a 24-hour-wide track on the right - the duty window as
 * a light band, the duty time already passed and not worked as a red tint underneath, and the actual
 * worked stretches as green bars on top. A thin red line marks the current time on today's row only. */
function DayRow({
  date,
  isToday,
  isWeekend,
  busy,
  dutyFrom,
  dutyTo,
  passedMin,
}: {
  date: Date;
  isToday: boolean;
  isWeekend: boolean;
  busy: [number, number][];
  dutyFrom: number;
  dutyTo: number;
  /** Minutes from midnight already behind this day - 0 for a future day, 1440 for a past one, the
   * live clock for today. */
  passedMin: number;
}) {
  const idleFrom = Math.min(dutyFrom, passedMin);
  const idleTo = Math.min(dutyTo, passedMin);
  const pct = (m: number): `${number}%` => `${(Math.max(0, Math.min(1440, m)) / 1440) * 100}%`;

  return (
    <View className="flex-row items-center" style={{ height: ROW_H, gap: 8 }}>
      <View style={{ width: 40 }}>
        <Text className={`text-[11px] font-bold ${isToday ? 'text-blue-700' : isWeekend ? 'text-red-400' : 'text-gray-700'}`}>
          {date.getDate()} <Text className="text-[9px] font-semibold text-gray-400">{WEEKDAY_SHORT[date.getDay()]}</Text>
        </Text>
      </View>
      <View className="flex-1 overflow-hidden rounded-md bg-gray-50" style={{ height: 16 }}>
        {dutyTo > dutyFrom && (
          <View style={{ position: 'absolute', left: pct(dutyFrom), width: pct(dutyTo - dutyFrom), top: 0, bottom: 0, backgroundColor: '#EFF6FF' }} />
        )}
        {idleTo > idleFrom && (
          <View style={{ position: 'absolute', left: pct(idleFrom), width: pct(idleTo - idleFrom), top: 0, bottom: 0, backgroundColor: UNUSED_RED, opacity: 0.4 }} />
        )}
        {busy.map(([from, to], i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: pct(from),
              width: pct(Math.max(to - from, 6)),
              top: 1,
              bottom: 1,
              borderRadius: 3,
              backgroundColor: WORKED_GREEN,
            }}
          />
        ))}
        {isToday && <View style={{ position: 'absolute', left: pct(passedMin), top: -2, bottom: -2, width: 2, backgroundColor: '#DC2626' }} />}
      </View>
    </View>
  );
}

/** The team's own month-at-a-glance: every day of the selected month as a row, with the hours of the
 * day running left to right across it - how much of each day's duty time was spent on a job (green)
 * and how much went unused (red), and the live progress line on today. Replaces the old single-day
 * gantt (hours running top to bottom, one day at a time) with dates vertical and hours horizontal, so
 * a whole month's work pattern reads at a glance instead of one day at a time.
 *
 * Nothing shows for someone not on a team - there is no duty time to measure a day against. */
export function MyDayTimeline({ technicianId }: { technicianId: string }) {
  const { current: employment } = useMyEmployment(technicianId);
  const { data: requests } = useSupabaseQuery('service_requests', {
    filters: { technician_id: technicianId },
    enabled: !!technicianId,
  });
  const ids = useMemo(() => (requests ?? []).map((r) => r.id).sort(), [requests]);
  const jobTimes = useJobTimes(ids);
  const now = useTick(30_000);
  const [monthOffset, setMonthOffset] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const today = new Date(now);
  const viewed = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewed.getFullYear();
  const month = viewed.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const dutyFrom = minutesOf(employment?.work_start_time, 9 * 60);
  const dutyTo = minutesOf(employment?.work_end_time, 17 * 60);

  // Centers today's row once, and jumps back to the top whenever a different month is opened.
  useEffect(() => {
    if (monthOffset !== 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const y = Math.max(0, (today.getDate() - 1) * ROW_STEP - VISIBLE_PX / 2);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
    // Only the month (not every tick of `now`) should re-trigger the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOffset, year, month]);

  if (!employment) return null;

  const all = requests ?? [];
  let monthWorked = 0;
  let monthIdle = 0;
  const rows = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1);
    const dayStart = date.getTime();
    const isToday = dayStart === todayStart;
    const isFuture = dayStart > todayStart;
    const nowForDay = isToday ? now : isFuture ? dayStart : dayStart + DAY_MS;
    const spans = workedOn(all, jobTimes, technicianId, dayStart, nowForDay);
    const busy = busyIntervals(spans);
    const passedMin = isFuture ? 0 : isToday ? (now - dayStart) / 60_000 : 1440;
    const figures = dayFigures(spans, dutyFrom, dutyTo, passedMin);
    monthWorked += figures.worked;
    monthIdle += figures.unused;
    return { date, isToday, busy, passedMin };
  });

  const monthLabel = viewed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const atCurrentMonth = monthOffset >= 0;

  return (
    <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3.5" style={{ backgroundColor: '#EFF6FF' }}>
        <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full bg-white">
          <Ionicons name="chevron-back" size={16} color={BLUE} />
        </Pressable>
        <Text className="text-[15px] font-extrabold text-gray-900">{monthLabel}</Text>
        <Pressable
          onPress={() => !atCurrentMonth && setMonthOffset((o) => o + 1)}
          disabled={atCurrentMonth}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full bg-white"
          style={{ opacity: atCurrentMonth ? 0.35 : 1 }}
        >
          <Ionicons name="chevron-forward" size={16} color={BLUE} />
        </Pressable>
      </View>

      <View className="flex-row px-4 pt-3.5" style={{ gap: 8 }}>
        <StatChip icon="checkmark-done" label="Worked" value={minutesLabel(monthWorked)} color="#15803D" bg="#F0FDF4" />
        <StatChip icon="time-outline" label="Idle" value={minutesLabel(monthIdle)} color="#B91C1C" bg="#FEF2F2" />
      </View>

      <View className="flex-row items-center px-4 pb-1 pt-3.5" style={{ gap: 8 }}>
        <View style={{ width: 40 }} />
        <View className="flex-1 flex-row">
          {HOUR_TICKS.map((h) => (
            <Text key={h} style={{ flex: 1 }} className="text-[9px] font-semibold text-gray-400">
              {hourTickLabel(h)}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: VISIBLE_PX }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: ROW_GAP }}
        nestedScrollEnabled
      >
        {rows.map((row) => (
          <DayRow
            key={row.date.getTime()}
            date={row.date}
            isToday={row.isToday}
            isWeekend={row.date.getDay() === 6}
            busy={row.busy}
            dutyFrom={dutyFrom}
            dutyTo={dutyTo}
            passedMin={row.passedMin}
          />
        ))}
      </ScrollView>

      <View className="flex-row items-center px-4 pb-3.5 pt-2" style={{ gap: 16 }}>
        <View className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: WORKED_GREEN }} />
          <Text className="text-[10.5px] text-gray-500">Worked</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: UNUSED_RED, opacity: 0.6 }} />
          <Text className="text-[10.5px] text-gray-500">Idle in duty hours</Text>
        </View>
        <Text className="text-[10.5px] text-gray-400">
          Duty {employment.work_start_time?.slice(0, 5) ?? '09:00'}–{employment.work_end_time?.slice(0, 5) ?? '17:00'}
        </Text>
      </View>
    </View>
  );
}
