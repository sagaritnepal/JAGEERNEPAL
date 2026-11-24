// lib/components/staff/StaffAccessScreen.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useSupabaseDelete, useSupabaseInsert, useSupabaseQuery, useSupabaseUpdate } from '../../hooks/useSupabase';
import { useMyEmployees } from '../../hooks/useTechnicianEmployment';
import { showAlert, getErrorMessage } from '../../utils/alert';
import { isValidPhone10 } from '../../utils/phone';
import { PopupCard } from '../finance/FormKit';
import { ROLES, SECTIONS, compactAccess, fullAccess, initialsOf, roleOf, type AccessLevel, type WorkRole } from '../../utils/staffAccess';
import type { StaffAccess } from '../../../types/database.types';

const BLUE = '#2563EB';
const LEVELS: { key: AccessLevel; label: string; color: string }[] = [
  { key: 'none', label: 'No access', color: '#6B7280' },
  { key: 'view', label: 'View', color: BLUE },
  { key: 'edit', label: 'View & edit', color: '#047857' },
];

/** "10:00:00" -> "10:00"; '' when unset. */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');
const validTime = (t: string) => !t.trim() || /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim());

interface Draft {
  role: WorkRole;
  title: string;
  start: string;
  end: string;
  access: Record<string, AccessLevel>;
}

const draftOf = (s: StaffAccess): Draft => ({
  role: s.work_role,
  title: s.job_title ?? '',
  start: hhmm(s.work_start_time),
  end: hhmm(s.work_end_time),
  access: fullAccess(s.access),
});

/**
 * Staff & Access (the owner's page): the people who work in the shop, each with a work role, job title, work
 * hours and - per section of the portal - No access, View or View & edit. Picking a role fills the grid from
 * that role; any row can then be changed for that one person. Stage 1 records it; the access it grants is
 * applied in later stages (0122_staff_access.sql).
 */
export function StaffAccessScreen() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const { width } = useWindowDimensions();
  const wide = width >= 1000;

  const { data: staff, isLoading } = useSupabaseQuery('staff_access', {
    filters: userId ? { owner_id: userId } : {},
    orderBy: { column: 'member_name' },
    enabled: !!userId,
  });
  const update = useSupabaseUpdate('staff_access');
  const remove = useSupabaseDelete('staff_access');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff ?? []).filter((s) => !q || s.member_name.toLowerCase().includes(q) || (s.member_phone ?? '').includes(q));
  }, [staff, search]);
  const selected = (staff ?? []).find((s) => s.id === selectedId) ?? null;

  // The first person opens on a wide screen; the draft starts from whoever is picked.
  useEffect(() => {
    if (!selectedId && wide && list.length > 0) setSelectedId(list[0].id);
  }, [selectedId, wide, list]);
  useEffect(() => {
    setDraft(selected ? draftOf(selected) : null);
    // Only when another person is picked (or theirs is saved), not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updated_at]);

  const changed = !!selected && !!draft && JSON.stringify(draftOf(selected)) !== JSON.stringify(draft);

  async function save() {
    if (!selected || !draft) return;
    if (!validTime(draft.start) || !validTime(draft.end)) {
      showAlert('Check the work hours', 'Write them as HH:MM, for example 10:00 and 18:00.');
      return;
    }
    setSaving(true);
    try {
      await update.mutateAsync({
        id: selected.id,
        values: {
          work_role: draft.role,
          job_title: draft.title.trim() || null,
          work_start_time: draft.start.trim() || null,
          work_end_time: draft.end.trim() || null,
          access: compactAccess(draft.access),
          updated_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      showAlert('Could not save', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function togglePause() {
    if (!selected) return;
    try {
      await update.mutateAsync({ id: selected.id, values: { status: selected.status === 'active' ? 'paused' : 'active', updated_at: new Date().toISOString() } });
    } catch (err) {
      showAlert('Could not change it', getErrorMessage(err));
    }
  }

  function askRemove() {
    if (!selected) return;
    showAlert(`Remove ${selected.member_name}?`, 'They lose all access to your portal. Their account itself stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(selected.id);
            setSelectedId(null);
          } catch (err) {
            showAlert('Could not remove', getErrorMessage(err));
          }
        },
      },
    ]);
  }

  const listPanel = (
    <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white" style={wide ? { width: 360, flexShrink: 0 } : undefined}>
      <View className="border-b border-gray-100 p-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search staff"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Search staff"
          className="rounded-lg border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900"
        />
      </View>
      {list.length === 0 ? (
        <View className="items-center px-4 py-10">
          <Ionicons name="people-outline" size={28} color="#D1D5DB" />
          <Text className="mt-2 text-center text-[13px] text-gray-500">
            {isLoading ? 'Loading…' : search.trim() ? `No one matches "${search.trim()}".` : 'No staff yet. Add the people who work with you.'}
          </Text>
        </View>
      ) : (
        list.map((s) => {
          const role = roleOf(s.work_role);
          const on = s.id === selectedId;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSelectedId(on && !wide ? null : s.id)}
              accessibilityLabel={`${s.member_name}, ${role.label}`}
              className="flex-row items-center border-b border-gray-100 px-3.5 py-2.5"
              style={{ gap: 12, minHeight: 60, backgroundColor: on ? '#EFF6FF' : '#FFFFFF' }}
            >
              <View className="items-center justify-center rounded-full" style={{ width: 38, height: 38, backgroundColor: '#E0E7FF' }}>
                <Text className="text-[13px] font-extrabold" style={{ color: '#3730A3' }}>
                  {initialsOf(s.member_name)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-[14px] font-bold text-gray-900" numberOfLines={1}>
                  {s.member_name}
                </Text>
                <Text className="text-[12px] text-gray-500" numberOfLines={1}>
                  {[s.member_phone, s.status === 'paused' ? 'Paused' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: role.bg }}>
                <Text className="text-[11px] font-bold" style={{ color: role.color }}>
                  {role.label}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );

  const editPanel =
    selected && draft ? (
      <View className="rounded-2xl border border-gray-200 bg-white p-5" style={{ flex: 1, minWidth: 0, gap: 18 }}>
        <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 12, flexShrink: 1 }}>
            <View className="items-center justify-center rounded-full" style={{ width: 48, height: 48, backgroundColor: '#E0E7FF' }}>
              <Text className="font-extrabold" style={{ color: '#3730A3' }}>
                {initialsOf(selected.member_name)}
              </Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text className="text-[18px] font-extrabold text-gray-900">{selected.member_name}</Text>
              <Text className="text-[13px] text-gray-500">
                {selected.member_phone ? `${selected.member_phone} · signs in with this number` : 'Signs in with their own account'}
                {selected.status === 'paused' ? ' · access paused' : ''}
              </Text>
            </View>
          </View>
          <View className="flex-row" style={{ gap: 8 }}>
            <Pressable onPress={togglePause} className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5">
              <Text className="text-[13px] font-semibold text-gray-800">{selected.status === 'active' ? 'Pause access' : 'Resume access'}</Text>
            </Pressable>
            <Pressable onPress={askRemove} className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
              <Text className="text-[13px] font-semibold" style={{ color: '#B91C1C' }}>
                Remove
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Work role: picking one fills the access grid from it. */}
        <View style={{ gap: 6 }}>
          <Text className="text-[12px] font-semibold text-gray-600">Work role</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {ROLES.map((r) => {
              const on = draft.role === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setDraft({ ...draft, role: r.key, access: fullAccess(r.preset) })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  className="rounded-lg border px-3.5 py-2.5"
                  style={{ borderColor: on ? r.color : '#E5E7EB', backgroundColor: on ? r.bg : '#FFFFFF' }}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: on ? r.color : '#374151' }}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="flex-row flex-wrap" style={{ gap: 14 }}>
          <View style={{ flexGrow: 1, flexBasis: 220, gap: 6 }}>
            <Text className="text-[12px] font-semibold text-gray-600">Job title</Text>
            <TextInput
              value={draft.title}
              onChangeText={(v) => setDraft({ ...draft, title: v })}
              placeholder="e.g. Shop manager"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="Job title"
              className="rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
            />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 220, gap: 6 }}>
            <Text className="text-[12px] font-semibold text-gray-600">Work hours</Text>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <TextInput
                value={draft.start}
                onChangeText={(v) => setDraft({ ...draft, start: v })}
                placeholder="10:00"
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Work starts"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
              />
              <Text className="text-gray-400">–</Text>
              <TextInput
                value={draft.end}
                onChangeText={(v) => setDraft({ ...draft, end: v })}
                placeholder="18:00"
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Work ends"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
              />
            </View>
          </View>
        </View>

        {/* The access grid: one row per section of the portal. */}
        <View>
          <View className="mb-2 flex-row flex-wrap items-baseline justify-between" style={{ gap: 6 }}>
            <Text className="text-[15px] font-extrabold text-gray-900">Portal access</Text>
            <Text className="text-[12px] text-gray-500">The role fills these in; change any one for this person.</Text>
          </View>
          <View className="overflow-hidden rounded-xl border border-gray-200">
            <View className="flex-row border-b border-gray-200 bg-gray-50">
              <Text className="flex-1 px-3.5 py-2.5 text-[11px] font-bold uppercase text-gray-500">Section</Text>
              {LEVELS.map((l) => (
                <Text key={l.key} className="py-2.5 text-center text-[11px] font-bold uppercase text-gray-500" style={{ width: wide ? 96 : 64 }}>
                  {wide ? l.label : l.key === 'none' ? 'None' : l.key === 'view' ? 'View' : 'Edit'}
                </Text>
              ))}
            </View>
            {SECTIONS.map((s) => (
              <View key={s.key} className="flex-row items-center border-b border-gray-100" style={{ minHeight: 44 }}>
                <Text
                  className={`flex-1 py-2.5 text-[13px] ${s.sub ? 'text-gray-700' : 'font-semibold text-gray-900'}`}
                  style={{ paddingLeft: s.sub ? 28 : 14, paddingRight: 8 }}
                >
                  {s.label}
                </Text>
                {LEVELS.map((l) => {
                  const on = draft.access[s.key] === l.key;
                  return (
                    <Pressable
                      key={l.key}
                      onPress={() => setDraft({ ...draft, access: { ...draft.access, [s.key]: l.key } })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${s.label}: ${l.label}`}
                      className="items-center justify-center"
                      style={{ width: wide ? 96 : 64, minHeight: 44 }}
                    >
                      <View
                        className="items-center justify-center rounded-full"
                        style={{ width: 20, height: 20, borderWidth: 2, borderColor: on ? l.color : '#D1D5DB' }}
                      >
                        {on && <View className="rounded-full" style={{ width: 10, height: 10, backgroundColor: l.color }} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View className="flex-row items-center bg-gray-50" style={{ minHeight: 44 }}>
              <Text className="flex-1 px-3.5 py-2.5 text-[13px] font-semibold text-gray-500">Staff & Access</Text>
              <Text className="px-3.5 text-[12px] text-gray-500">Owner only</Text>
            </View>
          </View>
        </View>

        <View className="flex-row justify-end" style={{ gap: 10 }}>
          <Pressable
            onPress={() => setDraft(draftOf(selected))}
            disabled={!changed}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            style={{ opacity: changed ? 1 : 0.5 }}
          >
            <Text className="text-[14px] font-semibold text-gray-800">Cancel</Text>
          </Pressable>
          <Pressable onPress={save} disabled={!changed || saving} className="rounded-lg px-5 py-3" style={{ backgroundColor: BLUE, opacity: changed && !saving ? 1 : 0.5 }}>
            <Text className="text-[14px] font-bold text-white">{saving ? 'Saving…' : 'Save access'}</Text>
          </Pressable>
        </View>
      </View>
    ) : wide ? (
      <View className="items-center justify-center rounded-2xl border border-gray-200 bg-white" style={{ flex: 1, minHeight: 300 }}>
        <Text className="text-[13px] text-gray-500">Pick a person to set their role and access.</Text>
      </View>
    ) : null;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: wide ? 24 : 12, paddingBottom: 48, gap: 16 }}>
      <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <Text className="text-[22px] font-extrabold text-gray-900">Staff & Access</Text>
          <Text className="mt-1 text-[13px] text-gray-500">Who works in your shop, what they do, and which parts of the portal they can open.</Text>
        </View>
        <Pressable onPress={() => setAdding(true)} className="flex-row items-center rounded-lg px-4 py-3" style={{ backgroundColor: BLUE, gap: 6 }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text className="text-[14px] font-bold text-white">Add staff</Text>
        </Pressable>
      </View>

      <View className="rounded-xl border px-4 py-3" style={{ borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}>
        <Text className="text-[12.5px]" style={{ color: '#1E40AF' }}>
          Roles and access are saved here now. Staff will be able to sign in and open the sections you allow in the next update.
        </Text>
      </View>

      {wide ? (
        <View className="flex-row items-start" style={{ gap: 18 }}>
          {listPanel}
          {editPanel}
        </View>
      ) : (
        <>
          {listPanel}
          {editPanel}
        </>
      )}

      {adding && userId && (
        <AddStaffPopup
          ownerId={userId}
          existing={new Set((staff ?? []).map((s) => s.member_id))}
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setSelectedId(id);
          }}
        />
      )}
    </ScrollView>
  );
}

/** Add someone as staff: one of your team (technicians who already work for you), or any account found by
 * its phone number. They start as the role picked here, with that role's access. */
function AddStaffPopup({
  ownerId,
  existing,
  onClose,
  onAdded,
}: {
  ownerId: string;
  existing: Set<string>;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { data: employees } = useMyEmployees(ownerId);
  const insert = useSupabaseInsert('staff_access');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<WorkRole>('sales');
  const [busy, setBusy] = useState(false);

  async function add(person: { id: string; name: string; phone: string | null }, asRole: WorkRole) {
    if (existing.has(person.id)) {
      showAlert('Already on your staff', `${person.name} is already in the list.`);
      return;
    }
    setBusy(true);
    try {
      const created = await insert.mutateAsync({
        owner_id: ownerId,
        member_id: person.id,
        member_name: person.name,
        member_phone: person.phone,
        work_role: asRole,
        access: roleOf(asRole).preset,
        status: 'active',
      });
      onAdded((created as StaffAccess).id);
    } catch (err) {
      showAlert('Could not add', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function findByPhone() {
    const p = phone.replace(/\D/g, '');
    if (!isValidPhone10(p)) {
      showAlert('Check the number', 'Enter their 10-digit mobile number.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('find_account_by_phone', { p_phone: p });
      if (error) throw error;
      const found = (data ?? [])[0] as { id: string; full_name: string | null; phone: string | null } | undefined;
      if (!found) {
        showAlert('No account with this number', 'Ask them to sign up in the Jageer app with this number first, then add them here.');
        return;
      }
      setBusy(false);
      await add({ id: found.id, name: found.full_name?.trim() || p, phone: found.phone }, role);
    } catch (err) {
      showAlert('Could not look it up', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const team = (employees ?? [])
    .map((e) => ({ id: e.profile.id, name: (e.profile.full_name ?? '').trim(), phone: e.profile.phone ?? null }))
    .filter((p) => p.id && p.name && !existing.has(p.id));

  return (
    <PopupCard title="Add staff" onClose={onClose} maxWidth={520}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text className="text-[12px] font-semibold text-gray-600">Role to start with</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {ROLES.map((r) => {
              const on = role === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setRole(r.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  className="rounded-lg border px-3 py-2"
                  style={{ borderColor: on ? r.color : '#E5E7EB', backgroundColor: on ? r.bg : '#FFFFFF' }}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: on ? r.color : '#374151' }}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text className="text-[12px] font-semibold text-gray-600">Their mobile number (the one they sign in with)</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="98XXXXXXXX"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="Mobile number"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
            />
            <Pressable onPress={findByPhone} disabled={busy} className="justify-center rounded-lg px-4" style={{ backgroundColor: BLUE, opacity: busy ? 0.6 : 1 }}>
              <Text className="text-[14px] font-bold text-white">{busy ? '…' : 'Add'}</Text>
            </Pressable>
          </View>
        </View>

        {team.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text className="text-[12px] font-semibold text-gray-600">Or pick from your team</Text>
            <View className="overflow-hidden rounded-lg border border-gray-200">
              {team.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => add(p, role)}
                  disabled={busy}
                  className="flex-row items-center border-b border-gray-100 px-3 py-2.5"
                  style={{ gap: 10 }}
                >
                  <Text className="flex-1 text-[14px] font-semibold text-gray-900" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-[12px] text-gray-500">{p.phone ?? ''}</Text>
                  <Ionicons name="add-circle" size={18} color={BLUE} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </PopupCard>
  );
}
