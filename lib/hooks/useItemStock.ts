// lib/hooks/useItemStock.ts
import { useMemo } from 'react';
import { useSupabaseQuery } from './useSupabase';
import type { Product } from '../../types/database.types';

/** How many units of each item are on hand, by item name (trimmed, any case), worked out as the
 * Inventory page does: a catalog product by its stock level, anything else by the units bought on
 * Purchase bills less the units sold on Sale bills. It can go below 0 - an item sold before its
 * Purchase bill was entered. `names` is every item name the bills know, as it was last written. */
export interface ItemStock {
  qty: Map<string, number>;
  names: string[];
}

export const itemKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export function useItemStock(ownerId: string | undefined, products: Product[]): ItemStock {
  // `all`: every unit on every bill counts, and a plain read stops at the API's first 1000 rows.
  const { data: bills } = useSupabaseQuery('business_transactions', {
    filters: ownerId ? { owner_id: ownerId } : {},
    columns: 'id,type,items',
    all: true,
    enabled: !!ownerId,
  });
  return useMemo(() => {
    const fromBills = new Map<string, number>();
    const names = new Map<string, string>();
    for (const b of bills ?? []) {
      if (b.type !== 'sale' && b.type !== 'purchase') continue;
      for (const item of b.items ?? []) {
        const name = item.description?.trim();
        if (!name) continue;
        const k = itemKey(name);
        const q = Number(item.qty) || 0;
        fromBills.set(k, (fromBills.get(k) ?? 0) + (b.type === 'purchase' ? q : -q));
        names.set(k, name);
      }
    }
    const qty = new Map(fromBills);
    for (const p of products) qty.set(itemKey(p.name), Number(p.stock_level) || 0);
    return { qty, names: [...names.values()] };
  }, [bills, products]);
}
