// lib/utils/ledgerName.ts
//
// One ledger per name: two ledgers of a shop may not share a name (capitals and extra spaces do not
// make a name different - "local  purchase" is "Local Purchase"). The database refuses a second one
// (migration 0116); these helpers let a form notice first and offer the one that exists, or merge two
// that already do.
import { supabase } from '../supabase';

/** A name as it is compared: trimmed, spaces collapsed, lower case. */
export function ledgerNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface SameNameLedger {
  id: string;
  name: string;
  created_at: string;
}

/** The shop's other ledgers that already carry `name`, oldest first. Asks the database (a few rows at
 * most), so it is right even when a list on screen is out of date. */
export async function findSameNameLedgers(ownerId: string, name: string, excludeId?: string): Promise<SameNameLedger[]> {
  const key = ledgerNameKey(name);
  if (!key) return [];
  // ilike with the words joined by % finds it whatever the spacing or capitals; the exact comparison is below.
  const pattern = key
    .split(' ')
    .map((word) => word.replace(/[\\%_]/g, '\\$&'))
    .join('%');
  let query = (supabase.from('customers') as any).select('id, name, created_at').eq('owner_id', ownerId).ilike('name', pattern);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.order('created_at', { ascending: true }).limit(20);
  if (error) throw error;
  return ((data ?? []) as SameNameLedger[]).filter((c) => ledgerNameKey(c.name) === key);
}

/** Merges `dropId` into `keepId`: every entry, bill and job on it moves to `keepId`, whose blanks (phone, address,
 * type...) are filled from it, and `dropId` is removed. `newName` is the name `keepId` ends up with.
 * See merge_customers (migration 0116). */
export async function mergeLedgers(keepId: string, dropId: string, newName?: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc('merge_customers', {
    p_keep: keepId,
    p_drop: dropId,
    p_name: newName ?? null,
  });
  if (error) throw error;
}
