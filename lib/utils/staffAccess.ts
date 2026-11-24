// lib/utils/staffAccess.ts
import type { StaffAccess } from '../../types/database.types';

export type AccessLevel = 'none' | 'view' | 'edit';
export type WorkRole = StaffAccess['work_role'];

/** The portal's sections, as the side menu runs, each a row of the Staff & Access grid. `sub` rows sit under
 * a group (Finance, Report) and are drawn indented. Staff & Access itself is the owner's alone. */
export const SECTIONS: { key: string; label: string; sub?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'requests', label: 'Requests (jobs)' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'daybook', label: 'Finance · Day Book', sub: true },
  { key: 'statement', label: 'Finance · Statement', sub: true },
  { key: 'ledger', label: 'Finance · Ledger', sub: true },
  { key: 'bank', label: 'Finance · Bank Accounts', sub: true },
  { key: 'quotation', label: 'Finance · Quotation', sub: true },
  { key: 'reports', label: 'Report · Sales, Purchase, Expense, Receivable, Payable, Ageing', sub: true },
  { key: 'statements', label: 'Report · Balance Sheet, Profit/Loss', sub: true },
];

/** The work roles, each with the access it starts with (the grid can then be changed for one person). */
export const ROLES: { key: WorkRole; label: string; color: string; bg: string; preset: Record<string, AccessLevel> }[] = [
  {
    key: 'manager',
    label: 'Manager',
    color: '#3730A3',
    bg: '#E0E7FF',
    preset: { dashboard: 'view', requests: 'edit', inventory: 'edit', marketing: 'view', daybook: 'edit', statement: 'view', ledger: 'edit', bank: 'view', quotation: 'edit', reports: 'view' },
  },
  {
    key: 'accountant',
    label: 'Accountant',
    color: '#047857',
    bg: '#ECFDF5',
    preset: { dashboard: 'view', requests: 'view', inventory: 'view', daybook: 'edit', statement: 'edit', ledger: 'edit', bank: 'edit', quotation: 'view', reports: 'view', statements: 'view' },
  },
  {
    key: 'sales',
    label: 'Sales staff',
    color: '#9A3412',
    bg: '#FFF7ED',
    preset: { requests: 'edit', inventory: 'view', daybook: 'edit', ledger: 'view', quotation: 'edit' },
  },
  {
    key: 'technician',
    label: 'Technician',
    color: '#374151',
    bg: '#F3F4F6',
    preset: { requests: 'view', inventory: 'view' },
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    color: '#1D4ED8',
    bg: '#EFF6FF',
    preset: { dashboard: 'view', requests: 'edit', inventory: 'view', quotation: 'view' },
  },
];

export const roleOf = (key: string | null | undefined) => ROLES.find((r) => r.key === key) ?? ROLES[2];

/** Every section's level, filled in from `access` ('none' where it says nothing). */
export function fullAccess(access: Record<string, AccessLevel> | null | undefined): Record<string, AccessLevel> {
  const out: Record<string, AccessLevel> = {};
  for (const s of SECTIONS) out[s.key] = access?.[s.key] ?? 'none';
  return out;
}

/** Only the sections given some access, as it is saved. */
export function compactAccess(access: Record<string, AccessLevel>): Record<string, AccessLevel> {
  const out: Record<string, AccessLevel> = {};
  for (const s of SECTIONS) if (access[s.key] && access[s.key] !== 'none') out[s.key] = access[s.key];
  return out;
}

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
