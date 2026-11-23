// lib/components/technician/CategoryTimeCard.tsx
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryBadge } from '../CategoryBadge';
import type { CategoryTimeStat } from '../../utils/technicianKpis';

const CARD = 'rounded-2xl border border-gray-200 bg-white';

export function timeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_STYLE: Record<CategoryTimeStat['status'], { bg: string; fg: string; label: string }> = {
  within: { bg: '#F0FDF4', fg: '#15803D', label: 'Within target' },
  over: { bg: '#FFFBEB', fg: '#B45309', label: 'Over target' },
  no_target: { bg: '#F3F4F6', fg: '#6B7280', label: 'No target set' },
};

function CategoryRow({ stat }: { stat: CategoryTimeStat }) {
  const style = STATUS_STYLE[stat.status];
  // How far the average sits along a 0-150%-of-target scale, so "right at target" sits
  // two-thirds of the way across rather than filling the bar - a target is a line, not an edge.
  const pct = stat.targetMinutes ? Math.min(1, stat.avgMinutes / (stat.targetMinutes * 1.5)) : Math.min(1, stat.avgMinutes / 240);
  const targetPct = stat.targetMinutes ? Math.min(1, stat.targetMinutes / (stat.targetMinutes * 1.5)) : null;

  return (
    <View className="flex-row flex-wrap items-center gap-3 border-t border-gray-100 py-3 first:border-t-0">
      <CategoryBadge category={stat.category} size={36} />
      <View style={{ minWidth: 140, flexShrink: 0 }}>
        <Text className="text-[13px] font-bold text-gray-900" numberOfLines={1}>
          {stat.category}
        </Text>
        <Text className="text-[11px] text-gray-500">
          {stat.jobs} {stat.jobs === 1 ? 'job' : 'jobs'}
        </Text>
      </View>
      <View style={{ minWidth: 72, flexShrink: 0 }}>
        <Text className="text-sm font-extrabold text-gray-900">{timeLabel(stat.avgMinutes)}</Text>
        <Text className="text-[11px] text-gray-400">avg</Text>
      </View>
      <View className="relative" style={{ flex: 1, minWidth: 90, height: 8, borderRadius: 4, backgroundColor: '#F3F4F6' }}>
        <View style={{ position: 'absolute', left: 0, width: `${pct * 100}%`, top: 0, bottom: 0, borderRadius: 4, backgroundColor: style.fg }} />
        {targetPct != null && (
          <View style={{ position: 'absolute', left: `${targetPct * 100}%`, top: -3, bottom: -3, width: 2, backgroundColor: '#374151' }} />
        )}
      </View>
      <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: style.bg, flexShrink: 0 }}>
        <Text className="text-[11px] font-bold" style={{ color: style.fg }}>
          {style.label}
        </Text>
      </View>
      <Text className="text-right text-[12.5px] text-gray-500" style={{ width: 80, flexShrink: 0 }}>
        NPR {Math.round(stat.earn).toLocaleString()}
      </Text>
    </View>
  );
}

/** How long a job in each category actually took this range, against the target set in Team >
 * Targets - a tick mark on the bar where the target sits, a status chip either side of it. A
 * category with no target shows its time with nothing to compare it against yet. */
export function CategoryTimeCard({ categories }: { categories: CategoryTimeStat[] }) {
  if (categories.length === 0) {
    return (
      <View className={CARD} style={{ padding: 20, gap: 4 }}>
        <Text className="text-base font-bold text-gray-900">Time to finish by category</Text>
        <Text className="text-sm text-gray-500">No jobs finished in this range yet.</Text>
      </View>
    );
  }
  return (
    <View className={CARD} style={{ padding: 20 }}>
      <View className="mb-1 flex-row items-center gap-2">
        <Ionicons name="speedometer-outline" size={16} color="#2563EB" />
        <Text className="text-base font-bold text-gray-900">Time to finish by category</Text>
      </View>
      <Text className="mb-1 text-xs text-gray-500">Average time per job against each category's target.</Text>
      {categories.map((c) => (
        <CategoryRow key={c.category} stat={c} />
      ))}
    </View>
  );
}
