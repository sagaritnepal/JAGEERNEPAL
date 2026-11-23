// lib/components/technician/TechnicianDashboardView.tsx
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryBadge } from '../CategoryBadge';
import { Appear, PressScale, Pulse, Rise } from '../Motion';
import { CategoryLineChart } from './CategoryLineChart';
import { CategoryTimeCard, timeLabel } from './CategoryTimeCard';
import { ReviewsCard } from './ReviewsCard';
import { NeedsAttentionCard } from './NeedsAttentionCard';
import { DateRangeSheet } from './DateRangeSheet';
import { useCalendarMode } from '../../hooks/useCalendarMode';
import { localTodayIso } from '../../utils/localDate';
import { computeTechnicianKpis, type TechnicianKpis } from '../../utils/technicianKpis';
import {
  NARROW_LIMITS,
  WIDE_LIMITS,
  buildBuckets,
  buildSeries,
  categoryColors,
  presetRange,
  rangeDays,
  rangeLabel,
  scopeOf,
  totalsByCategory,
  type Completion,
  type DateRange,
  type Preset,
} from '../../utils/dashboardStats';

const fmt = (n: number) => n.toLocaleString('en-US');

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'custom', label: 'Custom date' },
];

const CARD = 'rounded-2xl border border-gray-200 bg-white';

/** Today / 7 days / Custom date. */
function RangeToggle({ preset, onPick, wide }: { preset: Preset; onPick: (p: Preset) => void; wide: boolean }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Date range"
      className="flex-row items-center rounded-full bg-gray-100"
      style={{ padding: 3, gap: 2, height: wide ? 40 : 48, alignSelf: wide ? 'flex-start' : 'stretch' }}
    >
      {PRESETS.map((p) => {
        const on = preset === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => onPick(p.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            className={`items-center justify-center rounded-full ${on ? 'bg-blue-600' : ''}`}
            style={{ height: wide ? 34 : 42, paddingHorizontal: 14, flex: wide ? undefined : 1 }}
          >
            <Text className={`font-semibold ${on ? 'text-white' : 'text-gray-600'}`} style={{ fontSize: wide ? 13 : 14 }}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One compact KPI chip - with a chevron and press-through for the two that open their own screen
 * (Jobs completed, Earnings), read-only for the rest (avg time, on-time rate, rating, repeat
 * visits). All six share one small card so the whole row reads as one dense strip, not two
 * differently-sized rows stacked on top of each other. */
function KpiTile({
  icon,
  label,
  value,
  caption,
  color,
  bg,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  caption: string;
  color: string;
  bg: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      <View className="flex-row items-center gap-1.5">
        <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
          <Ionicons name={icon} size={11} color={color} />
        </View>
        <Text className="flex-1 text-[9px] font-bold uppercase text-gray-500" style={{ letterSpacing: 0.4 }} numberOfLines={1}>
          {label}
        </Text>
        {onPress && <Ionicons name="chevron-forward" size={11} color="#9CA3AF" />}
      </View>
      <Text className="font-extrabold text-gray-900" style={{ fontSize: 15 }} numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-[10px] text-gray-500" numberOfLines={1}>
        {caption}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <PressScale
        scaleTo={0.985}
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        className={CARD}
        style={{ padding: 8, gap: 2 }}
        wrapStyle={{ flex: 1, minWidth: 120 }}
      >
        {content}
      </PressScale>
    );
  }
  return (
    <View className={CARD} style={{ flex: 1, minWidth: 120, padding: 8, gap: 2 }}>
      {content}
    </View>
  );
}

function Skeleton({ wide }: { wide: boolean }) {
  const block = 'rounded-md bg-gray-100';
  return (
    <Pulse>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} className={`${CARD}`} style={{ flex: 1, minWidth: 120, padding: 8, gap: 6 }}>
            <View className={`${block} h-3 w-16`} />
            <View className={`${block} h-4 w-12`} />
          </View>
        ))}
      </View>
      <View className={`${CARD} mt-3 p-4`} style={{ gap: 14 }}>
        <View className={`${block} h-4 w-48`} />
        <View className={`${block} h-3 w-full`} />
        <View className="rounded-lg bg-gray-100" style={{ height: wide ? 180 : 140 }} />
      </View>
      <View className={`${CARD} mt-3 p-4`} style={{ gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row items-center gap-3">
            <View className="h-10 w-10 rounded-2xl bg-gray-100" />
            <View className={`${block} h-3 flex-1`} />
            <View className={`${block} h-3 w-10`} />
          </View>
        ))}
      </View>
    </Pulse>
  );
}

export function TechnicianDashboardView({
  completions,
  loading,
  kpiInputs,
  onOpenCompleted,
  onOpenEarnings,
  workingNow,
  monthlyHours,
}: {
  completions: Completion[];
  loading: boolean;
  /** Everything computeTechnicianKpis needs except the date range, which this view already owns -
   * undefined while its own queries are still loading. */
  kpiInputs?: Omit<Parameters<typeof computeTechnicianKpis>[0], 'range'>;
  onOpenCompleted: () => void;
  onOpenEarnings: () => void;
  /** The "working on now" card - the live, actionable thing, so it leads the page ahead of every
   * report below it (shown even before there are any stats to report). */
  workingNow?: ReactNode;
  /** The month work-hours calendar - its own labelled section further down, since it's a pattern to
   * check occasionally rather than the live status `workingNow` is. */
  monthlyHours?: ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // The layout follows the room this screen really has (a web sidebar takes
  // some of the window), not the window itself: a phone-style column under
  // 600, a desktop-style page from 600, chart beside the list from 900.
  const [boxWidth, setBoxWidth] = useState(0);
  const available = boxWidth || windowWidth;
  const wide = available >= 600;
  const split = available >= 900;
  const [mode] = useCalendarMode();
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('week', localTodayIso()));
  const [selected, setSelected] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = localTodayIso();
  const range: DateRange = preset === 'custom' ? custom : presetRange(preset, today);
  const days = rangeDays(range);

  const totals = useMemo(() => totalsByCategory(completions, range), [completions, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const colors = useMemo(() => categoryColors(completions), [completions]);
  const picked = selected.filter((c) => totals.some((t) => t.category === c));
  const scope = scopeOf(totals, picked);
  const buckets = useMemo(
    () => buildBuckets(range, wide ? WIDE_LIMITS : NARROW_LIMITS, mode),
    [range.start, range.end, wide, mode] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const drawn = picked.length ? picked : totals.filter((t) => t.jobs > 0).map((t) => t.category);
  const series = useMemo(
    () => buildSeries(completions, buckets, drawn, colors),
    [completions, buckets, drawn.join('|'), colors] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalAll = totals.reduce((s, t) => s + t.jobs, 0);
  const rangeText = rangeLabel(range, mode);

  const kpis: TechnicianKpis | null = useMemo(
    () => (kpiInputs ? computeTechnicianKpis({ ...kpiInputs, range }) : null),
    [kpiInputs, range.start, range.end] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggle = (category: string) =>
    setSelected((cur) => (cur.includes(category) ? cur.filter((c) => c !== category) : cur.concat(category)));
  const pickPreset = (p: Preset) => {
    if (p === 'custom') {
      setSheetOpen(true);
      return;
    }
    setPreset(p);
  };

  let order = 0;
  const next = () => order++;

  const sheet = (
    <DateRangeSheet
      visible={sheetOpen}
      initial={range}
      wide={wide}
      onApply={(r) => {
        setCustom(r);
        setPreset('custom');
        setSheetOpen(false);
      }}
      onToday={() => {
        setPreset('today');
        setSheetOpen(false);
      }}
      onClose={() => setSheetOpen(false)}
    />
  );

  // ---- blocks shared by the phone and wide layouts

  const kpiTiles = (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      <KpiTile
        icon="checkmark-circle-outline"
        label="Jobs completed"
        value={String(scope.jobs)}
        caption={scope.name}
        color="#2563EB"
        bg="#EFF6FF"
        onPress={onOpenCompleted}
        accessibilityLabel={`Jobs completed, ${scope.jobs}. View completed jobs in My Jobs`}
      />
      <KpiTile
        icon="cash-outline"
        label="Earnings"
        value={`NPR ${fmt(scope.earn)}`}
        caption={scope.name}
        color="#2563EB"
        bg="#EFF6FF"
        onPress={onOpenEarnings}
        accessibilityLabel={`Earnings, NPR ${fmt(scope.earn)}. View detailed earnings`}
      />
      {kpis && (
        <>
          <KpiTile
            icon="speedometer-outline"
            label="Avg time to finish"
            value={kpis.avgMinutesOverall != null ? timeLabel(kpis.avgMinutesOverall) : '—'}
            caption={`${kpis.jobsWithTime} ${kpis.jobsWithTime === 1 ? 'job' : 'jobs'} timed`}
            color="#B45309"
            bg="#FFFBEB"
          />
          <KpiTile
            icon="checkmark-done-circle-outline"
            label="On-time rate"
            value={kpis.onTimeRate != null ? `${Math.round(kpis.onTimeRate)}%` : '—'}
            caption="vs category targets"
            color="#15803D"
            bg="#F0FDF4"
          />
          <KpiTile
            icon="star-outline"
            label="Customer rating"
            value={kpis.reviews.average != null ? `${kpis.reviews.average.toFixed(1)} / 5` : '—'}
            caption={`${kpis.reviews.count} ${kpis.reviews.count === 1 ? 'review' : 'reviews'}`}
            color="#C2410C"
            bg="#FFF7ED"
          />
          <KpiTile
            icon="repeat-outline"
            label="Repeat visits"
            value={`${kpis.repeatVisits} of ${kpis.jobsWithTime}`}
            caption="Needed a return trip"
            color="#B91C1C"
            bg="#FEF2F2"
          />
        </>
      )}
    </View>
  );

  const performanceSection = kpis ? (
    <View style={{ flexDirection: split ? 'row' : 'column', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ flex: split ? 1.75 : undefined, minWidth: 0, width: split ? undefined : '100%' }}>
        <CategoryTimeCard categories={kpis.categories} />
      </View>
      <View style={{ flex: split ? 1 : undefined, minWidth: 0, width: split ? undefined : '100%', gap: 10 }}>
        <ReviewsCard reviews={kpis.reviews} />
        <NeedsAttentionCard items={kpis.needsAttention} />
      </View>
    </View>
  ) : null;

  const chartCard = (
    <View className={CARD} style={{ padding: wide ? 14 : 16, paddingBottom: wide ? 10 : 12 }}>
      <Text className="mb-2 text-sm font-bold text-gray-900">Jobs completed by category</Text>
      {days <= 1 ? (
        <View className="mb-3 items-center rounded-xl bg-gray-50 px-6 py-10" style={{ gap: 8 }}>
          <Ionicons name="analytics-outline" size={28} color="#6b7280" />
          <Text className="text-sm font-semibold text-gray-900">A single day has no trend to plot</Text>
          <Text className="text-center text-[13px] text-gray-500" style={{ maxWidth: 320 }}>
            Choose 7 days or a longer custom range to compare categories over time. The list shows this day's jobs by category.
          </Text>
          <Pressable onPress={() => setPreset('week')} className="mt-1 items-center justify-center rounded-full border border-blue-600 px-4" style={{ minHeight: 36 }}>
            <Text className="text-[13px] font-semibold text-blue-700">Show 7 days</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <CategoryLineChart
            buckets={buckets}
            series={series}
            height={wide ? 180 : 240}
            endLabels={wide}
            totalLabel={picked.length ? 'Selected total' : 'Total jobs'}
            emptyText="No jobs in this range"
            focusId={focusId}
            onFocus={setFocusId}
          />
          {!wide && <Text className="mt-2 text-center text-xs text-gray-500">Touch the chart to see the numbers for each point.</Text>}
        </>
      )}
    </View>
  );

  const listCard = (
    <View className={CARD} style={{ padding: wide ? 14 : 16, paddingBottom: 6 }}>
      <Text className="text-sm font-bold text-gray-900">Work by category</Text>
      <Text className="mb-2 mt-0.5 text-[12px] text-gray-500">
        {totals.length} {totals.length === 1 ? 'category' : 'categories'} {'·'} {totalAll} {totalAll === 1 ? 'job' : 'jobs'}
      </Text>
      <View className="flex-row items-center px-1 pb-2" style={{ columnGap: 10 }}>
        <View style={{ width: 12 }} />
        <View style={{ width: 40 }} />
        <Text className="flex-1 text-[11px] font-bold capitalize text-gray-500" style={{ letterSpacing: 0.6 }}>
          Category
        </Text>
        <Text className="w-8 text-right text-[11px] font-bold capitalize text-gray-500" style={{ letterSpacing: 0.6 }}>
          Jobs
        </Text>
        <Text className="text-right text-[11px] font-bold capitalize text-gray-500" style={{ width: 72, letterSpacing: 0.6 }}>
          NPR
        </Text>
      </View>
      {totals.map((t) => {
        const on = picked.includes(t.category);
        return (
          <View key={t.category} className="border-t border-gray-100">
            <PressScale
              scaleTo={0.99}
              onPress={() => toggle(t.category)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t.category}, ${t.jobs} jobs, NPR ${fmt(t.earn)}`}
              {...(Platform.OS === 'web' ? { onHoverIn: () => setFocusId(t.category), onHoverOut: () => setFocusId(null) } : {})}
              className="flex-row items-center rounded-xl px-1"
              style={{
                columnGap: 8,
                minHeight: 38,
                borderWidth: 1.5,
                borderColor: on ? '#3b82f6' : 'transparent',
                backgroundColor: on ? '#eff6ff' : focusId === t.category ? '#f3f4f6' : 'transparent',
              }}
            >
              <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: colors.get(t.category) ?? '#9ca3af' }} />
              <CategoryBadge category={t.category} size={26} />
              <Text className="flex-1 text-[12.5px] font-semibold text-gray-900" numberOfLines={1}>
                {t.category}
              </Text>
              <Text className="w-8 text-right text-[12.5px] font-bold text-gray-900">{t.jobs}</Text>
              <Text className="text-right text-[12.5px] text-gray-600" style={{ width: 72 }}>
                {fmt(t.earn)}
              </Text>
            </PressScale>
          </View>
        );
      })}
      <View className="flex-row items-center border-t border-gray-200 px-1" style={{ columnGap: 8, minHeight: 36 }}>
        <View style={{ width: 62 }} />
        <Text className="flex-1 text-sm font-bold text-gray-900">Total</Text>
        <Text className="w-8 text-right text-sm font-extrabold text-gray-900">{totalAll}</Text>
        <Text className="text-right text-[13px] font-bold text-gray-900" style={{ width: 72 }}>
          {fmt(totals.reduce((s, t) => s + t.earn, 0))}
        </Text>
      </View>
    </View>
  );

  const empty = (
    <View className="items-center rounded-2xl border border-dashed border-gray-200 bg-white py-12" style={{ gap: 6 }}>
      <Ionicons name="stats-chart-outline" size={30} color="#D1D5DB" />
      <Text className="mt-1 text-gray-600">No completed jobs yet.</Text>
      <Text className="text-xs text-gray-500">Jobs you finish show up here, with what they earned.</Text>
    </View>
  );

  const chips = picked.length > 0 && (
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      {picked.map((c) => (
        <Appear key={c}>
          <Pressable
            onPress={() => toggle(c)}
            accessibilityLabel={`Remove ${c}`}
            className="flex-row items-center rounded-xl border border-blue-500 bg-blue-50 pl-2 pr-3"
            style={{ height: 40, gap: 8 }}
          >
            <CategoryBadge category={c} size={24} />
            <Text className="text-[13px] font-bold text-blue-700">{c}</Text>
            <Ionicons name="close" size={14} color="#1d4ed8" />
          </Pressable>
        </Appear>
      ))}
      {picked.length > 1 && (
        <Pressable onPress={() => setSelected([])} className="justify-center px-3" style={{ minHeight: 40 }}>
          <Text className="text-[13px] font-bold text-blue-700">Clear all</Text>
        </Pressable>
      )}
    </View>
  );

  const monthlySection = monthlyHours ? (
    <View style={{ gap: 10 }}>
      <Text className="px-1 text-[11px] font-bold capitalize text-gray-500" style={{ letterSpacing: 0.6 }}>
        Work hours
      </Text>
      {monthlyHours}
    </View>
  ) : null;

  // ---- wide screens: header row, wide tiles, chart beside the list

  if (wide) {
    return (
      <View className="flex-1 bg-gray-50" onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}>
          {workingNow ? <Rise index={next()}>{workingNow}</Rise> : null}
          {loading ? (
            <Skeleton wide />
          ) : completions.length === 0 ? (
            <Rise index={next()}>{empty}</Rise>
          ) : (
            <>
              <Rise index={next()}>
                <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 12 }}>
                  <View className="flex-1" style={{ minWidth: 200 }}>
                    {chips || null}
                  </View>
                  <View className="flex-row items-center" style={{ gap: 12 }}>
                    <RangeToggle preset={preset} onPick={pickPreset} wide />
                    <Text className="text-[13px] font-medium text-gray-500">{rangeText}</Text>
                  </View>
                </View>
              </Rise>
              <Rise index={next()}>{kpiTiles}</Rise>
              {performanceSection ? <Rise index={next()}>{performanceSection}</Rise> : null}
              {monthlySection ? <Rise index={next()}>{monthlySection}</Rise> : null}
              <Rise index={next()}>
                <View style={{ flexDirection: split ? 'row' : 'column', gap: 16, alignItems: split ? 'flex-start' : 'stretch' }}>
                  <View style={{ flex: split ? 2 : undefined, minWidth: 0 }}>{chartCard}</View>
                  <View style={{ flex: split ? 1 : undefined, minWidth: 0 }}>{listCard}</View>
                </View>
              </Rise>
            </>
          )}
        </ScrollView>
        {sheet}
      </View>
    );
  }

  // ---- phones: the range toggle stays pinned while the rest scrolls

  const ready = !loading && completions.length > 0;

  return (
    <View className="flex-1 bg-gray-50" onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      {/* "Working on now" scrolls away normally; the toggle right after it is the one that has to be
          an un-fragmented child (not wrapped) for stickyHeaderIndices to pin it. */}
      <ScrollView className="flex-1" stickyHeaderIndices={ready ? [1] : []} contentContainerStyle={{ paddingBottom: picked.length ? 96 : 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: ready ? 6 : 0 }}>
          {workingNow ? <Rise index={next()}>{workingNow}</Rise> : null}
        </View>
        {ready ? (
          <View className="bg-gray-50" style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <RangeToggle preset={preset} onPick={pickPreset} wide={false} />
          </View>
        ) : null}
        {ready ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <Text className="text-center text-[13px] font-medium text-gray-500">{rangeText}</Text>
            <Rise index={next()}>{kpiTiles}</Rise>
            {performanceSection ? <Rise index={next()}>{performanceSection}</Rise> : null}
            {monthlySection ? <Rise index={next()}>{monthlySection}</Rise> : null}
            <Rise index={next()}>{chartCard}</Rise>
            <Rise index={next()}>{listCard}</Rise>
          </View>
        ) : loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
            <Skeleton wide={false} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
            <Rise index={next()}>{empty}</Rise>
          </View>
        )}
      </ScrollView>

      {picked.length > 0 && !loading && (
        <Appear style={{ position: 'absolute', left: 16, right: 16, bottom: 12 }}>
          <View
            accessibilityRole="summary"
            className="flex-row items-center justify-between rounded-2xl border border-blue-500 bg-blue-50"
            style={{
              minHeight: 56,
              paddingLeft: 16,
              paddingRight: 8,
              paddingVertical: 6,
              shadowColor: '#111827',
              shadowOpacity: 0.16,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View className="flex-1" style={{ gap: 2 }}>
              <Text className="text-[13px] font-bold text-blue-700" numberOfLines={1}>
                {scope.name}
              </Text>
              <Text className="text-xs text-gray-700">
                {scope.jobs} {scope.jobs === 1 ? 'job' : 'jobs'} {'·'} NPR {fmt(scope.earn)}
              </Text>
            </View>
            <Pressable onPress={() => setSelected([])} accessibilityLabel="Clear selected categories" className="items-center justify-center px-3" style={{ minHeight: 44 }}>
              <Text className="text-[13px] font-bold text-blue-700">Clear</Text>
            </Pressable>
          </View>
        </Appear>
      )}
      {sheet}
    </View>
  );
}
