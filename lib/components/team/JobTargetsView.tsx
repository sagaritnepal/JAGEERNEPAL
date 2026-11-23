// lib/components/team/JobTargetsView.tsx
// The "Targets" tab of the reseller Team hub: how long a job in each category
// should take, set once here and read everywhere a technician's actual time
// is shown next to it (the dashboard's "on target" / "over target" read).
import { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../hooks/useAuth';
import { useSupabaseQuery, useSupabaseUpsert } from '../../hooks/useSupabase';
import { useWideDetail } from '../detail/DetailLayout';
import { CategoryBadge } from '../CategoryBadge';
import { digitsInput } from '../../utils/number';

function minutesToText(m: number | null | undefined): string {
  if (!m) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function TargetRow({
  label,
  minutes,
  onSave,
}: {
  label: string;
  minutes: number | null;
  onSave: (minutes: number | null) => void;
}) {
  const [text, setText] = useState(minutes ? String(minutes) : '');

  function commit() {
    const n = Number(text);
    onSave(text.trim() && n > 0 ? Math.round(n) : null);
  }

  return (
    <View className="flex-row items-center gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
      <CategoryBadge category={label} size={36} />
      <Text className="flex-1 text-sm font-semibold text-gray-900" numberOfLines={2}>
        {label}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <TextInput
          value={text}
          onChangeText={(v) => setText(digitsInput(v))}
          onBlur={commit}
          placeholder="e.g. 240"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          className="w-20 rounded-lg border border-gray-300 px-2.5 py-2 text-right text-sm text-gray-900"
        />
        <Text className="text-xs text-gray-500">min</Text>
      </View>
      <Text className="w-16 text-right text-xs text-gray-400">{minutesToText(minutes)}</Text>
    </View>
  );
}

/** How long a job in each category should take - the reseller sets it once here; a technician's
 * actual time on a completed job reads against it everywhere the dashboard shows "on target" /
 * "over target" (see lib/utils/technicianKpis.ts). Not used to limit or block a job in any way. */
export function JobTargetsView() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const wide = useWideDetail();
  const { data: categories } = useSupabaseQuery('service_categories', {
    filters: { is_active: true },
    orderBy: { column: 'sort_order', ascending: true },
  });
  const { data: targets } = useSupabaseQuery('reseller_category_targets', {
    filters: userId ? { owner_id: userId } : {},
    enabled: !!userId,
  });
  const upsertTarget = useSupabaseUpsert('reseller_category_targets', 'owner_id,category_id');

  const targetByCategory = useMemo(() => new Map((targets ?? []).map((t) => [t.category_id, t])), [targets]);

  function save(categoryId: string, minutes: number | null) {
    if (!userId || minutes == null) return;
    upsertTarget.mutate({ owner_id: userId, category_id: categoryId, target_minutes: minutes });
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 40 }}>
      <View style={{ maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        <View className="mb-4 flex-row items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Ionicons name="flag-outline" size={18} color="#1D4ED8" />
          <Text className="flex-1 text-xs leading-[17px] text-blue-900">
            Set how long a job in each category should normally take. Each technician's own dashboard
            compares their actual time against it - nothing here blocks or limits a job.
          </Text>
        </View>

        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {(categories ?? []).map((c) => (
            <TargetRow key={c.id} label={c.label} minutes={targetByCategory.get(c.id)?.target_minutes ?? null} onSave={(m) => save(c.id, m)} />
          ))}
          {categories && categories.length === 0 && (
            <Text className="p-4 text-sm text-gray-500">No job categories yet.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
