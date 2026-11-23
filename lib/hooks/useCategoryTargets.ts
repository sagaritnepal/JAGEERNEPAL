// lib/hooks/useCategoryTargets.ts
import { useMemo } from 'react';
import { useSupabaseQuery } from './useSupabase';

/** How long a job in each category should take, set by a reseller in Team > Targets (migration
 * 0112) - read here as a plain `category label -> minutes` map, the same label shape
 * `categoryOf()` resolves a job's issue_type to, so a caller can look a job straight up by its
 * category without juggling category ids. */
export function useCategoryTargets(resellerId: string | null | undefined): Map<string, number> {
  const { data: categories } = useSupabaseQuery('service_categories', {
    enabled: !!resellerId,
  });
  const { data: targets } = useSupabaseQuery('reseller_category_targets', {
    filters: resellerId ? { owner_id: resellerId } : {},
    enabled: !!resellerId,
  });

  return useMemo(() => {
    const labelById = new Map((categories ?? []).map((c) => [c.id, c.label]));
    const map = new Map<string, number>();
    for (const t of targets ?? []) {
      const label = labelById.get(t.category_id);
      if (label) map.set(label, t.target_minutes);
    }
    return map;
  }, [categories, targets]);
}
