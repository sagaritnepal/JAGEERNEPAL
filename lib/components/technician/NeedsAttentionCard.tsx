// lib/components/technician/NeedsAttentionCard.tsx
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AttentionItem } from '../../utils/technicianKpis';

const CARD = 'rounded-2xl border border-gray-200 bg-white';

const TONE_STYLE: Record<AttentionItem['tone'], { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  warning: { bg: '#FFFBEB', fg: '#B45309', icon: 'time-outline' },
  danger: { bg: '#FEF2F2', fg: '#B91C1C', icon: 'alert-circle-outline' },
};

/** The handful of things worth a second look this range - a job on hold past its target, a category
 * running long, high idle time this month. Quiet when there's nothing to flag, not an empty box. */
export function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <View className={CARD} style={{ padding: 20 }}>
      <Text className="mb-1 text-base font-bold text-gray-900">Needs attention</Text>
      {items.length === 0 ? (
        <View className="flex-row items-center gap-2 py-2">
          <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
          <Text className="text-sm text-gray-500">Nothing stands out right now.</Text>
        </View>
      ) : (
        items.map((item, i) => {
          const style = TONE_STYLE[item.tone];
          return (
            <View key={i} className={`flex-row items-start gap-2.5 py-2.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <View className="h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: style.bg }}>
                <Ionicons name={style.icon} size={14} color={style.fg} />
              </View>
              <View className="flex-1">
                <Text className="text-[12.5px] font-bold leading-[17px] text-gray-900">{item.title}</Text>
                <Text className="mt-0.5 text-[11.5px] text-gray-500">{item.detail}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
