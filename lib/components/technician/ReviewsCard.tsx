// lib/components/technician/ReviewsCard.tsx
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReviewStats } from '../../utils/technicianKpis';

const CARD = 'rounded-2xl border border-gray-200 bg-white';

function Stars({ value }: { value: number }) {
  return (
    <View className="flex-row" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= Math.round(value) ? 'star' : 'star-outline'} size={10} color="#F59E0B" />
      ))}
    </View>
  );
}

function StarBar({ star, count, max }: { star: number; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <View className="flex-row items-center" style={{ gap: 6, height: 13 }}>
      <Text style={{ width: 20 }} className="text-[10px] font-semibold text-gray-700">
        {star} ★
      </Text>
      <View className="flex-1 overflow-hidden rounded-full bg-gray-100" style={{ height: 5 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#F59E0B' }} />
      </View>
      <Text style={{ width: 14 }} className="text-right text-[10px] font-semibold text-gray-700">
        {count}
      </Text>
    </View>
  );
}

/** Reputation, not a period's report: all-time reviews, since they build up far slower than jobs do -
 * the star distribution and the tags customers actually picked (see lib/constants/reviewTags.ts). */
export function ReviewsCard({ reviews }: { reviews: ReviewStats }) {
  if (reviews.count === 0) {
    return (
      <View className={CARD} style={{ padding: 12, gap: 3 }}>
        <Text className="text-[13px] font-bold text-gray-900">Customer reviews</Text>
        <Text className="text-xs text-gray-500">No reviews yet.</Text>
      </View>
    );
  }
  const max = Math.max(...reviews.starCounts);
  return (
    <View className={CARD} style={{ padding: 12 }}>
      <Text className="mb-2 text-[13px] font-bold text-gray-900">Customer reviews</Text>
      <View className="mb-2 flex-row items-center" style={{ gap: 10 }}>
        <View className="items-center" style={{ flexShrink: 0 }}>
          <Text className="text-[22px] font-extrabold leading-none text-gray-900">{reviews.average?.toFixed(1)}</Text>
          <View className="mt-0.5">
            <Stars value={reviews.average ?? 0} />
          </View>
          <Text className="mt-0.5 text-[9.5px] text-gray-500">
            {reviews.count} {reviews.count === 1 ? 'review' : 'reviews'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          {[5, 4, 3, 2, 1].map((star) => (
            <StarBar key={star} star={star} count={reviews.starCounts[star - 1]} max={max} />
          ))}
        </View>
      </View>
      {reviews.tagCounts.length > 0 && (
        <View className="flex-row flex-wrap" style={{ gap: 4 }}>
          {reviews.tagCounts.map((t) => (
            <View
              key={t.tag}
              className="flex-row items-center rounded-full px-2 py-0.5"
              style={{ gap: 4, backgroundColor: t.positive ? '#ECFDF3' : '#FEF2F2' }}
            >
              <Text className="text-[10px] font-semibold" style={{ color: t.positive ? '#15803D' : '#B91C1C' }}>
                {t.tag}
              </Text>
              <Text className="text-[10px] font-extrabold" style={{ color: t.positive ? '#15803D' : '#B91C1C' }}>
                {t.count}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
