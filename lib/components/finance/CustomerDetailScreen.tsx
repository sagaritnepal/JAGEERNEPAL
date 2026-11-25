// lib/components/finance/CustomerDetailScreen.tsx
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, Linking, Platform, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../hooks/useAuth';
import { useRentalWageSync } from '../../hooks/useRentalWageSync';
import {
  useSupabaseRow,
  useSupabaseQuery,
  useSupabaseUpdate,
  useSupabaseInsert,
  useSupabaseDelete,
} from '../../hooks/useSupabase';
import { useBankAccounts } from '../../hooks/useBankAccounts';
import { usePartyTypes } from '../../hooks/usePartyTypes';
import { useFreshLedgerArea } from '../../hooks/useFreshLedgerArea';
import { journalOf } from '../../utils/journalVoucher';
import { itemNamesOf, sellsVehicles } from '../../utils/accountFeatures';
import { formatMoney, round2 } from '../../utils/money';
import { BankAccountPickerModal } from './BankAccountPickerModal';
import { EntryWhenFields, PartyMoveField, PaymentMethodButton, stampOf, timeOf, useEntryParty, useEntryWhen } from './EntryEditParts';
import { PartyTypeField } from './PartyTypeField';
import { SuggestInput, type SuggestOption } from './SuggestInput';
import { TransactionDetailModal } from './TransactionsScreen';
import { PartyBalance } from './PartyBalance';
import { partyPosition } from '../../utils/partyBalance';
import { BackButton, BookTable, Pill, ToolbarButton, useBookLayout, useBookToolbar, type BookColumn } from './BookKit';
import { Field, FieldRow, FormActions, FormCard, INPUT, PopupCard, Segmented } from './FormKit';
import { MONEY } from './moneyColors';
import { supabase } from '../../supabase';
import { showAlert, getErrorMessage } from '../../utils/alert';
import { nameCaps, capWords } from '../../utils/nameCaps';
import { deleteErrorMessage } from '../../utils/dbErrors';
import { nextEntryNo } from '../../utils/nextEntryNo';
import { useEntryNo } from '../../hooks/useEntryNo';
import { usePhoneContacts } from '../../hooks/usePhoneContacts';
import { isValidPhone10 } from '../../utils/phone';
import { findSameNameLedgers, ledgerNameKey, mergeLedgers, type SameNameLedger } from '../../utils/ledgerName';
import { toBsHistoryLabel } from '../../utils/nepaliDate';
import { useCalendarMode } from '../../hooks/useCalendarMode';
import { localTodayIso } from '../../utils/localDate';
import {
  compareItems,
  drCr,
  entryDay,
  sideTotals,
  summarize,
  withRunningBalance,
  type LedgerItem,
} from '../../utils/ledgerStatement';
import { drCrText, exportStatementXlsx, statementHtml, type StatementData } from '../../utils/exportLedger';
import { printReportDocument } from './PrintButton';
import type {
  BusinessTransaction,
  BusinessTransactionType,
  CustomerLedgerEntry,
  LedgerEntryType,
  VendorLedgerEntry,
} from '../../../types/database.types';

const TX_TYPE_LABEL: Record<BusinessTransactionType, string> = {
  sale: 'Sale bill',
  purchase: 'Purchase bill',
  expense: 'Expenses',
};

// The two colours a choice or tag takes: green for money in, red for money out.
const IN_TONE = { color: MONEY.in.text, bg: MONEY.in.bg, border: MONEY.in.base };
const OUT_TONE = { color: MONEY.out.text, bg: MONEY.out.bg, border: MONEY.out.base };

/** Whether `phone` is already used by a different customer of this owner. */
async function phoneAlreadyUsed(ownerId: string, phone: string, excludeCustomerId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('phone', phone)
    .neq('id', excludeCustomerId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** What a journal voucher's entry says: its code and narration; null for any other entry. */
function journalText(note: string | null | undefined): string | null {
  const voucher = journalOf(note);
  return voucher ? [voucher.code, voucher.narration].filter(Boolean).join(' · ') : null;
}

/** The balance in the name card: "To receive" or "To pay" over the coloured amount. */
export function BalanceFigure({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View>
      <Text className="text-[10.5px] font-bold capitalize tracking-wide text-gray-400" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[17px] font-extrabold" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

/** A small outlined button for the header: an icon and a word. */
function HeaderButton({ icon, label, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-8 flex-row items-center rounded-lg border px-2.5"
      style={{ gap: 5, borderColor: danger ? '#FECACA' : '#D1D5DB', backgroundColor: danger ? '#FEF2F2' : '#FFFFFF' }}
    >
      <Ionicons name={icon} size={13} color={danger ? '#DC2626' : '#2563EB'} />
      <Text className="text-[12.5px] font-semibold" style={{ color: danger ? '#DC2626' : '#374151' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The fields whose typed value differs from what is saved ('' = none), each as its trimmed value or null. */
function changedOnly(fields: Record<string, [string, string | null | undefined]>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, [typed, saved]] of Object.entries(fields)) {
    const next = typed.trim() || null;
    if (next !== ((saved ?? '').trim() || null)) out[key] = next;
  }
  return out;
}

/** The person's name card: name, phone, address, a summary figure, and Edit / Delete.
 * Also shown on top of a person's own Sales / Purchase / Expense report. */
export function EditableDetails({ customerId, basePath, summary }: { customerId: string; basePath: string; summary?: ReactNode }) {
  const { data: customer } = useSupabaseRow('customers', customerId);
  const updateCustomer = useSupabaseUpdate('customers');
  const deleteCustomer = useSupabaseDelete('customers', { requireRow: true });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const nameInput = useRef<TextInput | null>(null);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  // The rest of their profile: VAT / PAN no., contact person, landline, email, notes.
  const [vatPan, setVatPan] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [landline, setLandline] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [partyTypeId, setPartyTypeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const queryClient = useQueryClient();
  // The shop's other ledgers with this same name - there should be none (one ledger per name); when there are
  // (made before that rule), the card offers to merge them. Its key starts with 'customers', so every save
  // of a ledger reads it again.
  const { data: sameName } = useQuery({
    queryKey: ['customers', 'same-name', customerId, ledgerNameKey(customer?.name)],
    queryFn: () => findSameNameLedgers(customer!.owner_id, customer!.name, customerId),
    enabled: !!customer,
  });
  // The phone's own contacts (on a phone; a browser cannot read them), for the Contact person dropdown.
  const phoneContacts = usePhoneContacts();
  // The registered customers, for the Name box's dropdown - read only while the edit popup is open.
  const { data: registered } = useSupabaseQuery('customers', {
    filters: customer?.owner_id ? { owner_id: customer.owner_id } : {},
    orderBy: { column: 'name' },
    enabled: editing && !!customer?.owner_id,
  });

  if (!customer) return null;

  // What is typed in Name picks from the registered customers (not this one): every name that contains it, or
  // whose phone does - the ones that start with it first - so a name is chosen as it is registered, not retyped.
  const typedName = name.trim().toLowerCase();
  const nameOptions: SuggestOption[] = (registered ?? [])
    .filter((c) => c.id !== customerId && (!typedName || c.name.toLowerCase().includes(typedName) || (c.phone ?? '').includes(typedName)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(typedName)) - Number(a.name.toLowerCase().startsWith(typedName)))
    .slice(0, 40)
    .map((c) => ({ key: c.id, label: nameCaps(c.name), sub: [c.phone, c.address].filter(Boolean).join(' · ') || null }));

  // Contact person: picked from the contacts - every saved ledger with its phone, and the phone's own contacts -
  // searched by name or number; picking one fills in their phone. A name typed that is in neither stays as typed.
  const typedContact = contactName.trim().toLowerCase();
  const contactOptions: SuggestOption[] = (() => {
    const seen = new Set<string>();
    const out: (SuggestOption & { phone: string })[] = [];
    const push = (key: string, name: string, phone: string | null | undefined, sub: string) => {
      const n = name.trim();
      if (!n) return;
      const dedupe = `${n.toLowerCase()}|${(phone ?? '').replace(/\D/g, '').slice(-10)}`;
      if (seen.has(dedupe)) return;
      if (typedContact && !n.toLowerCase().includes(typedContact) && !(phone ?? '').includes(typedContact)) return;
      seen.add(dedupe);
      out.push({ key, label: nameCaps(n), sub: [phone, sub].filter(Boolean).join(' · '), phone: phone ?? '' });
    };
    for (const c of registered ?? []) if (c.id !== customerId) push(`c:${c.id}`, c.name, c.phone, 'Saved contact');
    for (const p of phoneContacts.contacts) push(`p:${p.phone}`, p.name, p.phone, 'Phone contact');
    return out
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(typedContact)) - Number(a.label.toLowerCase().startsWith(typedContact)))
      .slice(0, 40);
  })();
  const contactPhoneOf = (key: string) => {
    if (key.startsWith('c:')) return (registered ?? []).find((c) => `c:${c.id}` === key)?.phone ?? '';
    if (key.startsWith('p:')) return key.slice(2);
    return '';
  };

  function startEditing() {
    phoneContacts.request();
    setName(nameCaps(customer!.name));
    setPhone(customer!.phone ?? '');
    setAddress(customer!.address ?? '');
    setVatPan(customer!.vat_pan_no ?? '');
    setContactName(customer!.contact_person_name ?? '');
    setContactPhone(customer!.contact_person_phone ?? '');
    setLandline(customer!.landline ?? '');
    setEmail(customer!.email ?? '');
    setNotes(customer!.notes ?? '');
    setPartyTypeId(customer!.party_type_id ?? null);
    setEditing(true);
  }

  /** Writes the edit form to this person (after any merge, so a phone that was the other ledger's is free). */
  async function persistEdit(trimmedPhone: string) {
    if (trimmedPhone && (await phoneAlreadyUsed(customer!.owner_id, trimmedPhone, customerId))) {
      showAlert('Already saved', 'A customer with this phone number already exists.');
      return;
    }
    await updateCustomer.mutateAsync({
      id: customerId,
      values: {
        name: nameCaps(name.trim()),
        phone: trimmedPhone || null,
        address: address.trim() || null,
        // The profile's own fields (0124) only when changed - all optional; only the name is required.
        ...changedOnly({
          vat_pan_no: [vatPan, customer!.vat_pan_no],
          contact_person_name: [contactName, customer!.contact_person_name],
          contact_person_phone: [contactPhone, customer!.contact_person_phone],
          landline: [landline, customer!.landline],
          email: [email, customer!.email],
          notes: [notes, customer!.notes],
        }),
        // Only when changed, so saving a party never depends on the type column.
        ...(partyTypeId !== (customer!.party_type_id ?? null) ? { party_type_id: partyTypeId } : {}),
      },
    });
    setEditing(false);
  }

  /** Folds the ledgers `others` into this one: every entry, bill and job comes here, and they are removed. It
   * only happens once the person has said so - it cannot be undone. `renameTo` is the name this one ends up
   * with (the edit form's, when merging was the way out of a name that is taken). */
  function askMerge(others: SameNameLedger[], renameTo: string | null, then?: () => Promise<void>) {
    const many = others.length > 1;
    const shown = nameCaps(others[0]?.name ?? customer!.name);
    showAlert(
      many ? `Merge ${others.length + 1} ledgers into one?` : 'Merge into one ledger?',
      `${many ? `${others.length + 1} ledgers are` : 'Two ledgers are'} named "${shown}". Everything on the other${many ? 's' : ''} - entries, bills and jobs - moves into this one ledger, and the other${many ? 's are' : ' is'} removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge into one',
          style: 'destructive',
          onPress: async () => {
            setMerging(true);
            try {
              for (let i = 0; i < others.length; i++) {
                // The rename goes with the last merge: until then another ledger still has the name.
                await mergeLedgers(customerId, others[i].id, i === others.length - 1 ? renameTo : null);
              }
              await queryClient.invalidateQueries();
              if (then) await then();
            } catch (err) {
              showAlert('Could not merge', getErrorMessage(err));
            } finally {
              setMerging(false);
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  async function handleSave() {
    // Only the name is required here - a party with no ledger type yet can still be corrected.
    if (!name.trim()) {
      showAlert('Fill in the required details', 'Still needed: Name.');
      return;
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !isValidPhone10(trimmedPhone)) {
      showAlert('Check the phone number', 'Enter a valid 10-digit phone number.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showAlert('Check the email', 'Enter an email like name@company.com, or leave it empty.');
      return;
    }
    setSaving(true);
    try {
      // One ledger per name: a name another ledger already has is not saved - the two are merged instead, if
      // that is what is wanted.
      const taken = await findSameNameLedgers(customer!.owner_id, name, customerId);
      if (taken.length > 0) {
        setSaving(false);
        askMerge(taken, nameCaps(name.trim()), () => persistEdit(trimmedPhone));
        return;
      }
      await persistEdit(trimmedPhone);
    } catch (err) {
      showAlert('Could not save', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    showAlert('Delete this customer?', 'Their saved contact info and ledger history will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer.mutateAsync(customerId);
            router.replace(`${basePath}/customers` as any);
          } catch (err) {
            showAlert('Could not delete', deleteErrorMessage(err, 'this person'));
          }
        },
      },
    ]);
  }

  // Editing opens in a popup over the page; the name card stays as it is behind it.
  const editPopup = editing ? (
    // Not scrollable: the Name box's dropdown and the Ledger type's own list would otherwise each sit in a
    // ScrollView inside the popup's (see PopupCard); the form is short enough to never need to scroll.
    <PopupCard
      title="Edit profile"
      onClose={() => setEditing(false)}
      scrollable={false}
      maxWidth={760}
      footer={<FormActions onCancel={() => setEditing(false)} onSave={handleSave} saving={saving} />}
    >
      {/* Raised, so the Name dropdown draws over the Ledger type below the row. */}
      <View style={{ zIndex: 30 }}>
        <FieldRow>
          <Field label="Company / name *" basis={240} style={{ zIndex: 30 }}>
            <SuggestInput
              value={name}
              inputRef={(el) => {
                nameInput.current = el;
              }}
              onChangeText={(v) => {
                // typing keeps the caret where it is: capitalising a letter must not send it to the end
                const el = nameInput.current as unknown as HTMLInputElement | null;
                const at = el?.selectionStart;
                setName(capWords(v));
                if (Platform.OS === 'web' && el && at != null) requestAnimationFrame(() => el.setSelectionRange?.(at, at));
              }}
              options={nameOptions}
              onSelectOption={(option) => setName(option.label)}
              showWhenEmpty
              autoFocus
              placeholder="Name"
              accent="#2563EB"
              inputClassName={INPUT}
            />
          </Field>
          <Field label="Mobile (10 digits)" basis={180}>
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, ''))}
              placeholder="98XXXXXXXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              maxLength={10}
              className={INPUT}
            />
          </Field>
          <Field label="Landline" basis={160}>
            <TextInput
              value={landline}
              onChangeText={(v) => setLandline(v.replace(/[^0-9+\- ]/g, ''))}
              placeholder="01-XXXXXXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              className={INPUT}
            />
          </Field>
        </FieldRow>
      </View>
      <FieldRow>
        <Field label="VAT / PAN no." basis={180}>
          <TextInput value={vatPan} onChangeText={setVatPan} placeholder="e.g. 601234567" placeholderTextColor="#9CA3AF" className={INPUT} />
        </Field>
        <Field label="Address" basis={320}>
          <TextInput value={address} onChangeText={setAddress} placeholder="Address" placeholderTextColor="#9CA3AF" className={INPUT} />
        </Field>
      </FieldRow>
      {/* Raised, so the Contact person dropdown draws over Notes and the Ledger type below. */}
      <View style={{ zIndex: 20 }}>
      <FieldRow>
        <Field label="Contact person" basis={220} style={{ zIndex: 20 }}>
          <SuggestInput
            value={contactName}
            onChangeText={setContactName}
            options={contactOptions}
            onSelectOption={(option) => {
              setContactName(option.label);
              const ph = contactPhoneOf(option.key);
              if (ph) setContactPhone(ph);
            }}
            showWhenEmpty
            placeholder="Search your contacts"
            accent="#2563EB"
            inputClassName={INPUT}
          />
        </Field>
        <Field label="Contact person's phone" basis={180}>
          <TextInput
            value={contactPhone}
            onChangeText={(v) => setContactPhone(v.replace(/[^0-9+\- ]/g, ''))}
            placeholder="98XXXXXXXX"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            className={INPUT}
          />
        </Field>
        <Field label="Email" basis={220}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            className={INPUT}
          />
        </Field>
      </FieldRow>
      </View>
      <Field label="Notes" basis={600}>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Anything to remember about them" placeholderTextColor="#9CA3AF" className={INPUT} />
      </Field>
      <PartyTypeField ownerId={customer.owner_id} value={partyTypeId} onChange={setPartyTypeId} />
      <Text className="text-[11px] text-gray-400">* Required</Text>
    </PopupCard>
  ) : null;

  return (
    <>
    <View
      className="flex-row flex-wrap items-center rounded-2xl border border-gray-200 bg-white px-4 py-2.5"
      style={{ columnGap: 22, rowGap: 8 }}
    >
      <View style={{ flex: 1, minWidth: 200 }}>
        <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
          <Text className="text-[17px] font-extrabold text-gray-900">{nameCaps(customer.name)}</Text>
        </View>
        {(!!customer.phone || !!customer.address || !!customer.landline || !!customer.vat_pan_no || !!customer.contact_person_name || !!customer.email) && (
          <View className="mt-0.5 flex-row flex-wrap" style={{ columnGap: 16, rowGap: 2 }}>
            {!!customer.vat_pan_no && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="document-text-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-gray-600">VAT/PAN {customer.vat_pan_no}</Text>
              </View>
            )}
            {!!customer.landline && (
              <Pressable onPress={() => Linking.openURL(`tel:${customer.landline}`)} className="flex-row items-center gap-1">
                <Ionicons name="call-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-blue-700">{customer.landline}</Text>
              </Pressable>
            )}
            {!!customer.contact_person_name && (
              <Pressable
                onPress={() => (customer.contact_person_phone ? Linking.openURL(`tel:${customer.contact_person_phone}`) : undefined)}
                className="flex-row items-center gap-1"
              >
                <Ionicons name="person-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-gray-600">
                  {customer.contact_person_name}
                  {customer.contact_person_phone ? <Text className="text-blue-700">{` · ${customer.contact_person_phone}`}</Text> : null}
                </Text>
              </Pressable>
            )}
            {!!customer.email && (
              <Pressable onPress={() => Linking.openURL(`mailto:${customer.email}`)} className="flex-row items-center gap-1">
                <Ionicons name="mail-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-blue-700">{customer.email}</Text>
              </Pressable>
            )}
            {!!customer.phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${customer.phone}`)} className="flex-row items-center gap-1">
                <Ionicons name="call-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-blue-700">{customer.phone}</Text>
              </Pressable>
            )}
            {!!customer.address && (
              <Pressable
                onPress={() =>
                  customer.latitude != null && customer.longitude != null
                    ? Linking.openURL(`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`)
                    : undefined
                }
                className="flex-row items-center gap-1"
              >
                <Ionicons name="location-outline" size={12} color="#6B7280" />
                <Text className="text-[12.5px] text-gray-600">{customer.address}</Text>
              </Pressable>
            )}
          </View>
        )}
        {!!customer.notes && (
          <Text className="mt-1 text-[12px] italic text-gray-500" numberOfLines={2}>
            {customer.notes}
          </Text>
        )}
      </View>
      {!!summary && (
        <View className="flex-row flex-wrap" style={{ columnGap: 22, rowGap: 6 }}>
          {summary}
        </View>
      )}
      <View className="flex-row" style={{ gap: 6 }}>
        <HeaderButton icon="pencil-outline" label="Edit" onPress={startEditing} />
        <HeaderButton icon="trash-outline" label="Delete" danger onPress={handleDelete} />
      </View>
    </View>
    {!!sameName && sameName.length > 0 && (
      // Made before one-ledger-per-name: the same name twice, each with its own entries and balance.
      <View className="flex-row flex-wrap items-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-3" style={{ columnGap: 12, rowGap: 8 }}>
        <Ionicons name="git-merge-outline" size={18} color="#B45309" />
        <Text className="flex-1 text-[13px] leading-[18px] text-amber-900" style={{ minWidth: 200 }}>
          {sameName.length === 1 ? 'Another ledger is' : `${sameName.length} other ledgers are`} also named "{nameCaps(customer.name)}". A name should
          have one ledger - merge them so there is one balance.
        </Text>
        <Pressable
          onPress={() => askMerge(sameName, null)}
          disabled={merging}
          accessibilityRole="button"
          className="h-9 flex-row items-center rounded-lg px-4 disabled:opacity-50"
          style={{ backgroundColor: '#B45309', gap: 6 }}
        >
          <Ionicons name="git-merge-outline" size={15} color="#FFFFFF" />
          <Text className="text-[13px] font-bold text-white">{merging ? 'Merging…' : 'Merge them'}</Text>
        </Pressable>
      </View>
    )}
    {editPopup}
    </>
  );
}

/** An entry form: a card in the page when adding, a popup over the page when
 * editing (`onClose` is only passed for the popup). */
function EntryShell({
  icon,
  title,
  onClose,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  if (onClose) {
    return (
      <PopupCard title={title} onClose={onClose}>
        {children}
      </PopupCard>
    );
  }
  return (
    <FormCard icon={icon} title={title}>
      {children}
    </FormCard>
  );
}

function AddEntryForm({
  customerId,
  ownerId,
  initial,
  onDone,
}: {
  customerId: string;
  ownerId: string;
  initial?: CustomerLedgerEntry | null;
  onDone: () => void;
}) {
  const insertEntry = useSupabaseInsert('customer_ledger_entries');
  const updateEntry = useSupabaseUpdate('customer_ledger_entries');
  const bankAccounts = useBankAccounts(ownerId);
  const [entryType, setEntryType] = useState<LedgerEntryType>(initial?.entry_type ?? 'credit');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [bankAccountId, setBankAccountId] = useState<string | null>(initial?.bank_account_id ?? null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const { partyId, movedTo, setParty } = useEntryParty(customerId);
  const when = useEntryWhen(initial);
  // A new entry opens with the next receipt number already in the box (see useEntryNo).
  const entryNo = useEntryNo({ table: 'customer_ledger_entries', ownerId, entryType, auto: !initial, existing: initial?.receipt_no });

  const selectedAccountName = bankAccountId
    ? bankAccounts.accounts.find((a) => a.id === bankAccountId)?.name ?? 'Cash'
    : 'Cash';

  async function handleSave() {
    const value = round2(Number(amount));
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      showAlert('Enter an amount', 'Add a valid amount in NPR.');
      return;
    }
    if (initial && !when.date) {
      showAlert('Pick a date', 'Choose the date of this entry.');
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateEntry.mutateAsync({
          id: initial.id,
          values: {
            entry_type: entryType,
            amount: value,
            note: note.trim() || null,
            bank_account_id: bankAccountId,
            receipt_no: entryNo.receiptNo.trim() || null,
            // Only when another person was picked, so a plain edit never touches the link.
            ...(movedTo ? { customer_id: movedTo.id } : {}),
            // Likewise the date and time: only written once one of them was changed.
            ...(when.changed ? { entry_date: when.date, created_at: stampOf(when.date, when.time) } : {}),
          },
        });
        if (movedTo) showAlert('Entry moved', `This entry is now on ${nameCaps(movedTo.name)}'s ledger.`);
      } else {
        await insertEntry.mutateAsync({
          customer_id: customerId,
          owner_id: ownerId,
          entry_type: entryType,
          amount: value,
          note: note.trim() || null,
          source: 'manual',
          bank_account_id: bankAccountId,
          receipt_no: entryNo.receiptNo.trim() || null,
        });
      }
      onDone();
    } catch (err) {
      showAlert('Could not save entry', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const accountPicker = (
    <BankAccountPickerModal
      visible={showAccountPicker}
      accounts={bankAccounts.accounts}
      selectedId={bankAccountId}
      onSelect={setBankAccountId}
      onClose={() => setShowAccountPicker(false)}
      onRename={bankAccounts.rename}
      onDelete={bankAccounts.remove}
    />
  );
  // A new entry is always a payment received: what is receivable from a customer comes from
  // their bills (New Sale), so there is no other choice. An older Payment Out / Receivable entry
  // opens with Received unselected - tap it to turn that entry into a received one, or just fix
  // its amount or remarks.
  const typeOptions = [{ key: 'credit' as const, label: 'Received', ...IN_TONE }];

  return (
    <EntryShell
      icon="document-text-outline"
      title={initial ? 'Edit entry' : 'Add ledger entry'}
      onClose={initial ? onDone : undefined}
    >
      <Segmented value={entryType} onChange={setEntryType} options={typeOptions} />
      {initial && <PartyMoveField ownerId={ownerId} partyId={partyId} pickedName={movedTo?.name} onPick={setParty} />}
      {initial && <EntryWhenFields date={when.date} time={when.time} onDate={when.setDate} onTime={when.setTime} />}
      <FieldRow>
        <Field label={entryType === 'credit' ? 'Receipt no.' : 'Payment no.'} basis={110}>
          <TextInput
            value={entryNo.receiptNo}
            onChangeText={entryNo.onChange}
            placeholder="001"
            placeholderTextColor="#9CA3AF"
            className={INPUT}
          />
        </Field>
        <Field label="Amount (NPR)" basis={160}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 1000"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className={INPUT}
          />
        </Field>
        {entryType === 'credit' && (
          <Field label="Payment method" basis={200}>
            <PaymentMethodButton name={selectedAccountName} isBank={!!bankAccountId} onPress={() => setShowAccountPicker(true)} />
          </Field>
        )}
        <Field label="Remarks" basis={260}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor="#9CA3AF"
            className={INPUT}
          />
        </Field>
      </FieldRow>
      <FormActions onCancel={onDone} onSave={handleSave} saving={saving} saveLabel={initial ? 'Save' : 'Add entry'} />
      {accountPicker}
    </EntryShell>
  );
}

/** The vendor-payable side: "You paid" (credit - settles part of what you owe
 * this vendor). Credit purchases are logged automatically from the Purchase
 * form, so there is no "Bought on credit" choice here any more - it only
 * shows for an existing entry that already is one, so that stays editable.
 *
 * "Received" fixes an entry logged on the wrong ledger (e.g. a customer's
 * payment recorded as Payment Out): the two ledgers are separate tables, so
 * saving it as Received moves the entry onto the customer ledger. */
function AddVendorEntryForm({
  vendorId,
  ownerId,
  initial,
  onDone,
}: {
  vendorId: string;
  ownerId: string;
  initial?: VendorLedgerEntry | null;
  onDone: () => void;
}) {
  const insertEntry = useSupabaseInsert('vendor_ledger_entries');
  const updateEntry = useSupabaseUpdate('vendor_ledger_entries');
  const deleteVendorEntry = useSupabaseDelete('vendor_ledger_entries');
  const insertCustomerEntry = useSupabaseInsert('customer_ledger_entries');
  const deleteCustomerEntry = useSupabaseDelete('customer_ledger_entries');
  const bankAccounts = useBankAccounts(ownerId);
  // paid = vendor-ledger credit, received = customer-ledger credit, onCredit =
  // vendor-ledger debit (only ever an existing entry being edited).
  const [kind, setKind] = useState<'paid' | 'received' | 'onCredit'>(initial?.entry_type === 'debit' ? 'onCredit' : 'paid');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [bankAccountId, setBankAccountId] = useState<string | null>(initial?.bank_account_id ?? null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const { partyId, movedTo, setParty } = useEntryParty(vendorId);
  const when = useEntryWhen(initial);
  // The payment / receipt number: a new entry, or one being moved to Received, opens with the next
  // number of its own ledger already in the box; an existing Payment Out keeps its number.
  const entryNo = useEntryNo({
    table: kind === 'received' ? 'customer_ledger_entries' : 'vendor_ledger_entries',
    ownerId,
    entryType: 'credit',
    auto: !initial || kind === 'received',
    existing: initial?.receipt_no,
  });

  const selectedAccountName = bankAccountId
    ? bankAccounts.accounts.find((a) => a.id === bankAccountId)?.name ?? 'Cash'
    : 'Cash';

  /** Records a payment received from this party on the customer ledger. When
   * it came from an existing vendor entry, that entry is removed afterwards; if
   * the removal fails the new one is taken back out, so the money is never
   * counted on both ledgers at once. */
  async function recordReceived(entry: VendorLedgerEntry | null, value: number) {
    const created = await insertCustomerEntry.mutateAsync({
      customer_id: partyId,
      owner_id: ownerId,
      entry_type: 'credit',
      amount: value,
      note: note.trim() || null,
      source: 'manual',
      bank_account_id: bankAccountId,
      // The new row keeps the old one's date; a date or time changed in the form wins (the
      // timestamp too, so it takes its place in that day's order).
      ...(entry
        ? when.changed
          ? { entry_date: when.date, created_at: stampOf(when.date, when.time) }
          : { entry_date: entry.entry_date ?? entry.created_at.slice(0, 10) }
        : {}),
      receipt_no: entryNo.receiptNo.trim() || (await nextEntryNo('customer_ledger_entries', ownerId, 'credit')),
    });
    if (!entry) return;
    try {
      await deleteVendorEntry.mutateAsync(entry.id);
    } catch (err) {
      await deleteCustomerEntry.mutateAsync(created.id).catch(() => {});
      throw err;
    }
  }

  async function handleSave() {
    const value = round2(Number(amount));
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      showAlert('Enter an amount', 'Add a valid amount in NPR.');
      return;
    }
    if (initial && !when.date) {
      showAlert('Pick a date', 'Choose the date of this entry.');
      return;
    }
    setSaving(true);
    try {
      if (kind === 'received') {
        await recordReceived(initial ?? null, value);
        if (initial) {
          showAlert(
            'Moved to Received',
            movedTo
              ? `NPR ${formatMoney(value)} is now a Received entry on ${nameCaps(movedTo.name)}'s ledger.`
              : `NPR ${formatMoney(value)} is now a Received entry on the customer ledger.`
          );
        }
      } else if (initial) {
        await updateEntry.mutateAsync({
          id: initial.id,
          values: {
            entry_type: kind === 'paid' ? 'credit' : 'debit',
            amount: value,
            note: note.trim() || null,
            bank_account_id: bankAccountId,
            ...(kind === 'paid' ? { receipt_no: entryNo.receiptNo.trim() || null } : {}),
            // Only when another person was picked, so a plain edit never touches the link.
            ...(movedTo ? { vendor_id: movedTo.id } : {}),
            // Likewise the date and time: only written once one of them was changed.
            ...(when.changed ? { entry_date: when.date, created_at: stampOf(when.date, when.time) } : {}),
          },
        });
        if (movedTo) showAlert('Entry moved', `This entry is now on ${nameCaps(movedTo.name)}'s ledger.`);
      } else {
        await insertEntry.mutateAsync({
          vendor_id: vendorId,
          owner_id: ownerId,
          entry_type: 'credit',
          amount: value,
          note: note.trim() || null,
          source: 'manual',
          bank_account_id: bankAccountId,
          receipt_no: entryNo.receiptNo.trim() || null,
        });
      }
      onDone();
    } catch (err) {
      showAlert('Could not save entry', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const accountPicker = (
    <BankAccountPickerModal
      visible={showAccountPicker}
      accounts={bankAccounts.accounts}
      selectedId={bankAccountId}
      onSelect={setBankAccountId}
      onClose={() => setShowAccountPicker(false)}
      onRename={bankAccounts.rename}
      onDelete={bankAccounts.remove}
    />
  );
  const kindOptions = [
    { key: 'paid' as const, label: 'Paid', ...OUT_TONE },
    { key: 'received' as const, label: 'Received', ...IN_TONE },
    ...(initial?.entry_type === 'debit' ? [{ key: 'onCredit' as const, label: 'Bought on credit', ...OUT_TONE }] : []),
  ];

  return (
    <EntryShell icon="cart-outline" title={initial ? 'Edit entry' : 'Add vendor entry'} onClose={initial ? onDone : undefined}>
      <Segmented value={kind} onChange={setKind} options={kindOptions} />
      {initial && <PartyMoveField ownerId={ownerId} partyId={partyId} pickedName={movedTo?.name} onPick={setParty} />}
      {initial && <EntryWhenFields date={when.date} time={when.time} onDate={when.setDate} onTime={when.setTime} />}
      <FieldRow>
        {kind !== 'onCredit' && (
          <Field label={kind === 'received' ? 'Receipt no.' : 'Payment no.'} basis={110}>
            <TextInput
              value={entryNo.receiptNo}
              onChangeText={entryNo.onChange}
              placeholder="001"
              placeholderTextColor="#9CA3AF"
              className={INPUT}
            />
          </Field>
        )}
        <Field label="Amount (NPR)" basis={160}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 1000"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className={INPUT}
          />
        </Field>
        {kind !== 'onCredit' && (
          <Field label="Payment method" basis={200}>
            <PaymentMethodButton name={selectedAccountName} isBank={!!bankAccountId} onPress={() => setShowAccountPicker(true)} />
          </Field>
        )}
        <Field label="Remarks" basis={260}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor="#9CA3AF"
            className={INPUT}
          />
        </Field>
      </FieldRow>
      <FormActions onCancel={onDone} onSave={handleSave} saving={saving} saveLabel={initial ? 'Save' : 'Add entry'} />
      {accountPicker}
    </EntryShell>
  );
}

/** One line of the history, whichever list it came from - a customer ledger
 * entry, a vendor ledger entry or a bill - so the table and the phone cards
 * draw from the same thing. */
type HistoryRow = {
  key: string;
  /** What the line is: Received, Payment Out, Sale bill ... */
  label: string;
  tone: { color: string; bg: string };
  /** The note. */
  detail: string;
  /** Its receipt / bill number. */
  reference: string;
  dateLabel: string;
  /** 'YYYY-MM-DD', and when it was entered - what the statement is ordered by. */
  day: string;
  createdAt: string;
  /** The party's Debit / Credit for this line, and the balance after it. */
  debit: number;
  credit: number;
  balance: number;
  /** Listed for the record but not part of the balance (an Expense). */
  info?: boolean;
  amount: number;
  amountColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  /** A manual entry can be edited (or moved to another person) and removed here; the rest are read-only. */
  manual: boolean;
  ledger?: CustomerLedgerEntry;
  vendor?: VendorLedgerEntry;
  tx?: BusinessTransaction;
};

export function CustomerDetailScreen({ basePath }: { basePath: string }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Hidden tab screens stay mounted between visits, so opening another
  // record reused this one's component state (typed quote/remark/price, a
  // "thanks for rating" flag, an open edit form...). Keying on the id gives
  // every record its own fresh state - and on the visit, so a page left open (a form, a popup)
  // is gone once the Ledger has been left for another page.
  const visit = useFreshLedgerArea();
  return <CustomerDetail key={`${id}-${visit}`} id={id} basePath={basePath} />;
}

function CustomerDetail({ id, basePath }: { id: string; basePath: string }) {
  const [calendarMode] = useCalendarMode(); // the history's dates are drawn again when AD / BS changes
  const userId = useAuthStore((state) => state.session?.user.id);
  // Employees' daily rental wages up to today (see useRentalWageSync).
  useRentalWageSync(userId);
  // How money moved on each line: the bank / wallet account it went through, else Cash.
  const ledgerAccounts = useBankAccounts(userId);
  const accountName = (accountId: string | null | undefined) =>
    accountId ? ledgerAccounts.accounts.find((a) => a.id === accountId)?.name ?? 'Bank' : 'Cash';
  // `all` on both ledger reads: the balance is a sum over every entry.
  const { data: entries } = useSupabaseQuery('customer_ledger_entries', {
    filters: { customer_id: id },
    orderBy: { column: 'created_at', ascending: false },
    all: true,
    enabled: !!id,
  });
  // Sales/purchases billed directly to this saved customer/vendor. Each one
  // automatically books a matching debt on the ledger below (see
  // 0061_sale_purchase_always_ledger.sql) - the bill itself is shown here
  // instead of that auto-synced ledger entry (history filters those out),
  // since the bill carries the real detail (items, bill no.) the ledger
  // entry doesn't.
  const { data: linkedTransactions } = useSupabaseQuery('business_transactions', {
    filters: { customer_id: id },
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!id,
  });
  // The payable side of this same party - only ever non-empty for someone
  // who's also been picked as a Vendor on a credit Purchase, or who's had a
  // payment logged against them below. Kept separate from `entries` above
  // (opposite polarity: a vendor's debit is a debt owed BY the business).
  const { data: vendorEntries } = useSupabaseQuery('vendor_ledger_entries', {
    filters: { vendor_id: id },
    orderBy: { column: 'created_at', ascending: false },
    all: true,
    enabled: !!id,
  });
  const deleteEntry = useSupabaseDelete('customer_ledger_entries');
  const deleteVendorEntry = useSupabaseDelete('vendor_ledger_entries');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddVendorEntry, setShowAddVendorEntry] = useState(false);
  // Tapping a manual entry in History opens it in a popup to fix it (amount, note...)
  // or move it to the right person - a wrong amount or person previously meant
  // delete-and-redo. The popup is the form itself (see EntryShell), so these are
  // separate from the Add forms above.
  const [editingEntry, setEditingEntry] = useState<CustomerLedgerEntry | null>(null);
  const [editingVendorEntry, setEditingVendorEntry] = useState<VendorLedgerEntry | null>(null);
  // Tapping a linked bill in History opens the same organized detail view
  // Transactions uses, instead of duplicating that layout here.
  const [viewingTx, setViewingTx] = useState<BusinessTransaction | null>(null);

  const layout = useBookLayout();
  // The statement table needs the room (the sidebar takes 240px of it): below
  // 1000px it is a card list, like on a phone.
  const { width: windowWidth } = useWindowDimensions();
  const tableMode = layout.wide && windowWidth >= 1000;

  const balance = useMemo(() => {
    return (entries ?? []).reduce((sum, e) => sum + (e.entry_type === 'debit' ? e.amount : -e.amount), 0);
  }, [entries]);

  // A party that already has vendor history but has never been used as a
  // customer is being treated purely as a vendor here (e.g. opened from the
  // To pay tile) - the customer-side balance and "Add entry" are just noise
  // on that page. A brand-new party with neither yet still sees both, so
  // there's always a way to log its first entry. Same logic in reverse for a
  // party that's only ever been a customer - the vendor tile and "Payment
  // Out" button are just as much noise there.
  const isPureVendor = (vendorEntries?.length ?? 0) > 0 && (entries?.length ?? 0) === 0;
  const isPureCustomer = (entries?.length ?? 0) > 0 && (vendorEntries?.length ?? 0) === 0;

  const vendorBalance = useMemo(() => {
    return (vendorEntries ?? []).reduce((sum, e) => sum + (e.entry_type === 'debit' ? e.amount : -e.amount), 0);
  }, [vendorEntries]);

  const { data: partyRow } = useSupabaseRow('customers', id);
  const profile = useAuthStore((state) => state.profile);
  const showItems = sellsVehicles(profile?.business_name?.trim() || profile?.full_name);
  const { nameById: partyTypeName } = usePartyTypes(partyRow?.owner_id);

  // ---- The statement: both ledgers as one account (see ledgerStatement.ts) ----
  const today = localTodayIso();

  const items = useMemo<LedgerItem[]>(
    () => [
      ...(entries ?? []).map(
        (e): LedgerItem => ({
          id: e.id,
          side: 'customer',
          entryType: e.entry_type,
          amount: round2(Number(e.amount)),
          day: entryDay(e.entry_date, e.created_at),
          createdAt: e.created_at,
        })
      ),
      ...(vendorEntries ?? []).map(
        (e): LedgerItem => ({
          id: e.id,
          side: 'vendor',
          entryType: e.entry_type,
          amount: round2(Number(e.amount)),
          day: entryDay(e.entry_date, e.created_at),
          createdAt: e.created_at,
        })
      ),
    ],
    [entries, vendorEntries]
  );
  const totals = useMemo(() => summarize(items), [items]);
  const sides = useMemo(() => sideTotals(items), [items]);

  // Every line of the account, oldest first. A bill's own ledger entry (the one
  // a Sale / Purchase logs automatically - see 0061_sale_purchase_always_ledger.sql)
  // is shown as the bill, since the bill carries the real detail (bill no., items)
  // the entry doesn't; the amounts still come from the entry, so the running
  // balance always adds up to the same figure as the name card. A bill with no
  // entry behind it (an Expense) is listed too, but is not part of the balance.
  const allLines = useMemo<HistoryRow[]>(() => {
    const txById = new Map((linkedTransactions ?? []).map((t) => [t.id, t]));
    const billedTx = new Set<string>();
    const lines: HistoryRow[] = [];

    const billLine = (t: BusinessTransaction, amount: number, debit: number, credit: number, day: string, createdAt: string, info: boolean): HistoryRow => {
      const isSale = t.type === 'sale';
      return {
        key: `tx-${t.id}`,
        label: TX_TYPE_LABEL[t.type],
        tone: isSale ? IN_TONE : OUT_TONE,
        // A vehicle account reads the item (car) on the bill here in place of its remark.
        detail: (showItems ? itemNamesOf(t.items) : '') || (t.note ?? ''),
        reference: t.bill_no ?? '',
        dateLabel: toBsHistoryLabel(day),
        day,
        createdAt,
        debit,
        credit,
        balance: 0,
        info,
        amount,
        // A bill's amount is plain black; only money paid (red) and received (green) is coloured.
        amountColor: t.type === 'expense' ? '#DC2626' : '#111827',
        icon: 'receipt-outline',
        iconColor: isSale ? '#059669' : '#DC2626',
        iconBg: isSale ? '#ECFDF5' : '#FEF2F2',
        manual: false,
        tx: t,
      };
    };

    for (const e of entries ?? []) {
      const { debit, credit } = drCr('customer', e.entry_type, e.amount);
      const day = entryDay(e.entry_date, e.created_at);
      const syncedFromBill = e.source === 'booking' && e.source_type === 'business_transaction';
      const tx = syncedFromBill && e.source_id ? txById.get(e.source_id) : undefined;
      if (tx) {
        billedTx.add(tx.id);
        lines.push(billLine(tx, e.amount, debit, credit, day, e.created_at, false));
        continue;
      }
      const owes = e.entry_type === 'debit';
      // Money going out to them (entered by hand) is a Payment Out; any other amount they
      // still have to pay you is Receivable. Only money they paid you is Received.
      const outgoing = owes && e.source === 'manual';
      lines.push({
        key: `ledger-${e.id}`,
        // Whoever a vehicle is rented to owes its rate for each day it is out (0020_rent_receivable_from_renter.sql).
        label: journalOf(e.note) ? 'Journal' : e.source_type === 'rental_wage' ? 'Daily rent' : syncedFromBill ? TX_TYPE_LABEL.sale : !owes ? 'Received' : outgoing ? 'Paid' : 'Receivable',
        tone: outgoing ? OUT_TONE : IN_TONE,
        // Money that moved by hand (received, or paid back) says how: Cash, eSewa, a bank - then its remark.
        detail:
          journalText(e.note) ??
          (e.source === 'manual' && (!owes || outgoing)
            ? [accountName(e.bank_account_id), e.note].filter(Boolean).join(' · ')
            : e.note ?? (syncedFromBill ? '' : e.source === 'booking' ? 'From a booked job' : 'Manual entry')),
        reference: e.receipt_no ?? '',
        dateLabel: toBsHistoryLabel(day),
        day,
        createdAt: e.created_at,
        debit,
        credit,
        balance: 0,
        amount: e.amount,
        amountColor: outgoing ? '#DC2626' : owes ? '#111827' : '#059669',
        icon: owes ? 'arrow-up' : 'arrow-down',
        iconColor: outgoing ? '#DC2626' : '#059669',
        iconBg: outgoing ? '#FEF2F2' : '#ECFDF5',
        manual: e.source === 'manual',
        ledger: e,
      });
    }

    for (const e of vendorEntries ?? []) {
      const { debit, credit } = drCr('vendor', e.entry_type, e.amount);
      const day = entryDay(e.entry_date, e.created_at);
      const syncedFromBill = e.source === 'booking' && e.source_type === 'business_transaction';
      const tx = syncedFromBill && e.source_id ? txById.get(e.source_id) : undefined;
      if (tx) {
        billedTx.add(tx.id);
        lines.push(billLine(tx, e.amount, debit, credit, day, e.created_at, false));
        continue;
      }
      const onCredit = e.entry_type === 'debit';
      lines.push({
        key: `vendor-${e.id}`,
        // A rented vehicle's employee is owed a wage for each day it is out (0015_rental_employee_wages.sql).
        label: journalOf(e.note)
          ? 'Journal'
          : e.source_type === 'rental_wage'
            ? 'Daily rent'
            : onCredit
              ? syncedFromBill
                ? TX_TYPE_LABEL.purchase
                : 'Bought on credit'
              : 'Paid',
        tone: OUT_TONE,
        detail:
          journalText(e.note) ??
          (e.source === 'manual' && !onCredit
            ? [accountName(e.bank_account_id), e.note].filter(Boolean).join(' · ')
            : e.note ?? (syncedFromBill ? '' : e.source === 'booking' ? 'From a credit purchase' : 'Manual entry')),
        reference: e.receipt_no ?? '',
        dateLabel: toBsHistoryLabel(day),
        day,
        createdAt: e.created_at,
        debit,
        credit,
        balance: 0,
        amount: e.amount,
        amountColor: onCredit ? '#111827' : '#DC2626',
        icon: onCredit ? 'cart-outline' : 'arrow-up',
        iconColor: '#DC2626',
        iconBg: '#FEF2F2',
        manual: e.source === 'manual',
        vendor: e,
      });
    }

    for (const t of linkedTransactions ?? []) {
      if (billedTx.has(t.id)) continue;
      lines.push(billLine(t, t.amount, 0, 0, entryDay(t.bill_date, t.created_at), t.created_at, true));
    }
    return lines.sort(compareItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, vendorEntries, linkedTransactions, calendarMode, showItems, ledgerAccounts.accounts]);

  // Every line with the running balance after it, oldest first - and shown newest first.
  const statementAsc = useMemo<HistoryRow[]>(() => withRunningBalance(allLines, 0), [allLines]);
  const rows = useMemo(() => [...statementAsc].reverse(), [statementAsc]);

  // Every ledger reads as one line per bill, in the Ledger table's own columns: Receivable, Payable and the
  // Balance left on it, last. A bill's line reads "Sale E-144" and counts the bill's full total (items, service
  // charges such as Installation, VAT, discount), so nothing billed goes missing; a tap drops down its items. A payment whose
  // remark names an item first (the Paid and Received pages write it so) goes on the bill that item is on;
  // anything else is a line of its own, so the totals still match the name card. A line opens its entries in
  // a popup; an entry there opens as it does everywhere (a bill's detail, a payment's edit form).
  const vehicleGroups = useMemo<VehicleGroup[] | null>(() => {
    const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
    const groups = new Map<string, VehicleGroup>();
    const list: VehicleGroup[] = [];
    const groupFor = (k: string, name: string) => {
      let g = groups.get(k);
      if (!g) {
        g = { key: k, name, billed: 0, paid: 0, received: 0, lastDay: '', refs: [], rows: [], parts: new Map() };
        groups.set(k, g);
        list.push(g);
      }
      return g;
    };
    // Adds a line to the vehicle, with what it put on this vehicle (a bill of several vehicles puts each its own line).
    const add = (g: VehicleGroup, r: HistoryRow, part: Partial<VehiclePart>) => {
      const was = g.parts.get(r.key) ?? { billed: 0, paid: 0, received: 0 };
      g.parts.set(r.key, { billed: was.billed + (part.billed ?? 0), paid: was.paid + (part.paid ?? 0), received: was.received + (part.received ?? 0) });
      if (!g.rows.includes(r)) g.rows.push(r);
      if (r.day > g.lastDay) g.lastDay = r.day;
      if (r.reference && !g.refs.includes(r.reference)) g.refs.push(r.reference);
    };
    const used = new Set<string>();
    // The bills first, one line each.
    for (const r of statementAsc) {
      const t = r.tx;
      if (!t || r.info || (t.type !== 'sale' && t.type !== 'purchase')) continue;
      // Every Sale / Purchase bill is a line - one with only a service on it (Installation) too.
      used.add(r.key);
      const side = t.type === 'purchase' ? 'v' : 'c';
      const g = groupFor(`${side}|bill|${r.key}`, [t.type === 'purchase' ? 'Purchase' : 'Sale', t.bill_no?.trim()].filter(Boolean).join(' '));
      g.bill = t;
      g.billed += r.amount;
      add(g, r, { billed: r.amount });
    }
    // Then the money: every payment is a line of its own ("Received · E-142"), next to the bill it pays.
    for (const r of statementAsc) {
      if (used.has(r.key) || r.info) continue;
      const e = r.vendor ?? r.ledger;
      if (!e) continue;
      const side = r.vendor ? 'v' : 'c';
      const g = groupFor(`${side}|row|${r.key}`, [r.label, r.detail].filter(Boolean).join(' · '));
      const amount = Number(e.amount);
      // Owed to a vendor without a bill (a daily wage ...); money paid back to a customer.
      const part: Partial<VehiclePart> = r.vendor
        ? e.entry_type === 'credit'
          ? { paid: amount }
          : { billed: amount }
        : e.entry_type === 'credit'
          ? { received: amount }
          : e.source === 'manual'
            ? { paid: amount }
            : { billed: amount };
      g.billed += part.billed ?? 0;
      g.paid += part.paid ?? 0;
      g.received += part.received ?? 0;
      add(g, r, part);
    }
    for (const g of list) {
      g.side = g.key.startsWith('v|') || (g.key.startsWith('row|') && !!g.rows[0]?.vendor) ? 'vendor' : 'customer';
    }
    // The line with the latest entry is on top.
    const latest = (g: VehicleGroup) => g.rows.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), '');
    return list.sort((a, b) => (a.lastDay === b.lastDay ? latest(b).localeCompare(latest(a)) : a.lastDay < b.lastDay ? 1 : -1));
  }, [statementAsc]);

  // Only one entry form is open at a time: a person with no entries yet is offered both
  // (Add Entry for the customer side, Payment Out for the vendor side), and opening one
  // closes the other rather than stacking two forms.
  function closeCustomerForm() {
    setShowAddEntry(false);
  }
  function closeVendorForm() {
    setShowAddVendorEntry(false);
  }

  // A linked bill opens its detail view; a manual entry opens in an edit popup.
  function openRow(row: HistoryRow) {
    // Money received from a customer, or paid to a vendor, opens in the Received / Paid form it was entered on.
    const formEntry = row.manual && !journalOf((row.ledger ?? row.vendor)?.note) ? (row.ledger ?? row.vendor) : undefined;
    if (formEntry && formEntry.entry_type === 'credit') {
      router.push(`${basePath}/quick-payment?type=${row.vendor ? 'out' : 'in'}&edit=${formEntry.id}` as never);
      return;
    }
    if (row.tx) {
      setViewingTx(row.tx);
    } else if (row.vendor && row.manual) {
      setEditingVendorEntry(row.vendor);
    } else if (row.ledger && row.manual) {
      setEditingEntry(row.ledger);
    }
  }

  // Every entry can be changed or taken out from its line's drop-down: a bill on its own form (deleting it takes its
  // amount off the ledger too), a typed payment in its edit form. A line the system writes from somewhere else - a
  // rental's daily wage, a job's payment - follows that record, so it says where to change it instead.
  const deleteBill = useSupabaseDelete('business_transactions');
  const lockedReason = (row: HistoryRow) =>
    (row.vendor ?? row.ledger)?.source_type === 'rental_wage'
      ? 'This daily rent comes from a rental. Change the rental (who it is rented to, its rate or Returned on) or remove it on the Rent & EMI page, and these lines follow.'
      : 'This entry was written by another record (a job or a booking). Change that record and this follows.';
  function editAnyRow(row: HistoryRow) {
    if (row.tx) router.push(`${basePath}/transactions?type=${row.tx.type}&add=1&edit=${row.tx.id}` as never);
    else if (row.manual) openRow(row);
    else showAlert('Changed elsewhere', lockedReason(row));
  }
  function deleteAnyRow(row: HistoryRow) {
    const tx = row.tx;
    if (tx) {
      showAlert(
        `Delete this ${tx.type === 'purchase' ? 'purchase' : tx.type === 'sale' ? 'sale' : 'expense'} bill?`,
        `NPR ${formatMoney(Number(tx.amount))}${tx.bill_no ? ` · Bill #${tx.bill_no}` : ''}. Its amount comes off the ledger too. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteBill.mutateAsync(tx.id);
              } catch (err) {
                showAlert('Could not delete', getErrorMessage(err));
              }
            },
          },
        ]
      );
    } else if (row.manual) removeRow(row);
    else showAlert('Changed elsewhere', lockedReason(row));
  }

  function removeRow(row: HistoryRow) {
    const failed = { onError: (err: unknown) => showAlert('Could not delete', getErrorMessage(err)) };
    showAlert(
      'Delete this entry?',
      `${row.label} · NPR ${formatMoney(row.amount)} · ${row.dateLabel}. It comes off the ledger. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (row.vendor) deleteVendorEntry.mutate(row.vendor.id, failed);
            else if (row.ledger) deleteEntry.mutate(row.ledger.id, failed);
          },
        },
      ]
    );
  }

  // Back to wherever this person was opened from - the Ledger, a To receive list,
  // the Day Book... - and to the Ledger when there is nothing to go back to (the
  // page was opened directly). The sidebar is no longer the only way out.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`${basePath}/customers` as any);
  };

  // What this party can have: a vendor-only party has no customer side and the
  // other way round (see isPureVendor above); a new one has both until its first entry.
  const showCustomer = !isPureVendor;
  const showVendor = !isPureCustomer;

  function openCustomerForm() {
    closeVendorForm();
    setShowAddEntry(true);
  }
  function openVendorForm() {
    closeCustomerForm();
    setShowAddVendorEntry(true);
  }

  // Payment Out, New Sale, Add Entry, Print, Excel - a row of their own under
  // the name card (there are too many for the top bar on most screens). Payment Out
  // is what the rest of the app calls paying someone; a payment received from a
  // customer is an Add Entry, which opens on Received.
  //
  // The page is titled for what this person is - their Ledger type (Customer, Vendor, Employee,
  // Expense ...) - rather than "Customer" for everyone. A person with no type is called what their
  // entries say they are, and just "Ledger" until they say anything.
  // Print and Excel reach the statement as it is now through a ref: the bar keeps the buttons it was given.
  const exportNow = useRef<(kind: 'print' | 'excel') => void>(() => {});
  exportNow.current = runExport;
  const typeName = partyRow?.party_type_id ? partyTypeName.get(partyRow.party_type_id) : undefined;
  const pageTitle = typeName || (isPureVendor ? 'Vendor' : isPureCustomer ? 'Customer' : 'Ledger');
  const toolbar = useBookToolbar(
    {
      title: pageTitle,
      resetTitle: 'Ledger',
      wide: layout.wide,
      inBarMinWidth: 1500,
      left: () => <BackButton onPress={goBack} />,
      right: () => (
        <>
          {showVendor && <ToolbarButton icon="arrow-up-circle-outline" label="Paid" onPress={openVendorForm} />}
          {showCustomer && (
            <HeaderButton
              icon="receipt-outline"
              label="New Sale"
              onPress={() => router.push(`${basePath}/transactions?type=sale&add=1&partyId=${id}` as any)}
            />
          )}
          {showCustomer && <HeaderButton icon="add" label="Add Entry" onPress={openCustomerForm} />}
          <HeaderButton icon="print-outline" label="Print" onPress={() => exportNow.current('print')} />
          <HeaderButton icon="download-outline" label="Excel" onPress={() => exportNow.current('excel')} />
        </>
      ),
    },
    [isPureVendor, isPureCustomer, basePath, id]
  );

  // The statement as the print / Excel export draws it: oldest first, without the
  // lines that are not in the balance.
  async function runExport(kind: 'print' | 'excel') {
    if (!partyRow) return;
    const closingWords = totals.closing > 0.5 ? 'To receive' : totals.closing < -0.5 ? 'To pay' : 'Settled';
    const data: StatementData = {
      businessName: profile?.business_name ?? profile?.full_name ?? '',
      partyName: nameCaps(partyRow.name),
      phone: partyRow.phone ?? '',
      address: partyRow.address ?? '',
      ledgerType: partyRow.party_type_id ? partyTypeName.get(partyRow.party_type_id) ?? '' : '',
      periodLabel: 'All dates',
      printedOn: toBsHistoryLabel(today),
      opening: totals.opening,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      closing: totals.closing,
      summary: [
        ...(totals.hasCustomer ? [{ label: 'Total sales', value: `NPR ${formatMoney(sides.billed)}` }, { label: 'Total payments', value: `NPR ${formatMoney(sides.received)}` }] : []),
        ...(totals.hasVendor ? [{ label: 'Total purchases', value: `NPR ${formatMoney(sides.purchased)}` }, { label: 'Paid out', value: `NPR ${formatMoney(sides.paid)}` }] : []),
        { label: 'Outstanding balance', value: `${drCrText(totals.closing)} · ${closingWords}` },
      ],
      lines: statementAsc
        .filter((l) => !l.info)
        .map((l) => ({
          dateLabel: l.dateLabel,
          adDate: l.day,
          description: [l.label, l.detail].filter(Boolean).join(' - '),
          reference: l.reference,
          debit: l.debit,
          credit: l.credit,
          balance: l.balance,
        })),
    };
    try {
      // Only this person's statement, in the system's print preview - Print is pressed there.
      if (kind === 'print') await printReportDocument(statementHtml(data));
      else await exportStatementXlsx(data);
    } catch (err) {
      showAlert('Could not export the statement', getErrorMessage(err));
    }
  }

  if (!id || !userId) return null;

  // Every line has a delete button: a bill (its amount comes off the ledger too) and a typed entry are
  // deleted after a confirm; a line another record wrote (a rental's daily rent, a booked job) says where to
  // change it instead (see deleteAnyRow).
  const deleteButton = (row: HistoryRow) => (
    <Pressable
      onPress={() => deleteAnyRow(row)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Delete entry"
      className="h-8 w-8 items-center justify-center rounded-lg"
    >
      <Ionicons name="trash-outline" size={17} color="#DC2626" />
    </Pressable>
  );

  // --- History: a bordered table on the web, flat cards on a phone ---
  // What a line says under "Details": its receipt / bill number, then the note.
  const detailText = (row: HistoryRow) => {
    const kind = row.tx ? 'Bill' : row.vendor || (row.ledger?.entry_type === 'debit' && row.manual) ? 'Payment' : 'Receipt';
    return [row.reference ? `${kind} No. ${row.reference}` : null, row.detail].filter(Boolean).join(' · ');
  };
  // `withNumber` false is the table, whose Bill no. column already has the number.
  const detailsCell = (row: HistoryRow, withDate: boolean, withNumber = true) => (
    <View style={{ minWidth: 0 }}>
      <Text className="text-[13px] font-medium text-gray-900" numberOfLines={1}>
        {(withNumber ? detailText(row) : row.detail) || row.label}
      </Text>
      {withDate && (
        <Text className="text-[11px] text-gray-400" numberOfLines={1}>
          {row.dateLabel}
        </Text>
      )}
    </View>
  );
  // What is still left on the account after this line (both ledgers netted, like the name
  // card): green = still to receive, red = still to pay, grey 0 = settled. A bill that is
  // not part of the balance (an Expense) has no figure of its own, so it gets none.
  const balanceNote = (row: HistoryRow) => {
    if (row.info) return null;
    const left = round2(row.balance);
    const note =
      left > 0
        ? { text: `To receive ${formatMoney(left)}`, color: MONEY.in.text }
        : left < 0
          ? { text: `To pay ${formatMoney(Math.abs(left))}`, color: MONEY.out.text }
          : { text: 'Settled 0', color: '#6B7280' };
    return (
      <Text className="mt-0.5 text-[11px] font-semibold" style={{ color: note.color }} numberOfLines={1}>
        {note.text}
      </Text>
    );
  };
  const typeColumn: BookColumn<HistoryRow> = {
    key: 'type',
    label: 'Type',
    width: 130,
    render: (row) => <Pill text={row.label} color={row.tone.color} bg={row.tone.bg} />,
  };
  // Every ledger reads the same way: what a line adds to Receivable (green) or to Payable (red), and the
  // balance after it, last (both ledgers netted, as the Ledger list shows it).
  const cashFig = (v: number, color: string) =>
    v ? (
      <Text className="text-[12.5px] font-bold" style={{ color }} numberOfLines={1}>
        {formatMoney(v)}
      </Text>
    ) : (
      <Text className="text-[12.5px] text-gray-300">—</Text>
    );
  const moneyColumns: BookColumn<HistoryRow>[] = [
    { key: 'receivable', label: 'Debit (In)', width: 110, align: 'right', render: (row) => cashFig(row.info ? 0 : row.debit, MONEY.in.text) },
    { key: 'payable', label: 'Credit (Out)', width: 110, align: 'right', render: (row) => cashFig(row.info ? 0 : row.credit, MONEY.out.text) },
    {
      key: 'balance',
      label: 'Balance',
      width: 120,
      align: 'right',
      render: (row) =>
        row.info ? <Text className="text-[12.5px] text-gray-300">—</Text> : <PartyBalance position={partyPosition({ receivable: row.balance, payable: 0 })} compact />,
    },
  ];
  const actionColumn: BookColumn<HistoryRow> = {
    key: 'action',
    label: '',
    width: 80,
    align: 'right',
    render: (row) => (
      <View className="flex-row items-center justify-end" style={{ gap: 4 }}>
        {deleteButton(row)}
        {row.tx ? <Ionicons name="chevron-forward" size={14} color="#D1D5DB" /> : <View style={{ width: 14 }} />}
      </View>
    ),
  };
  const snColumn = (width: number): BookColumn<HistoryRow> => ({
    key: 'sn',
    label: 'SN',
    width,
    render: (_row, index) => <Text className="text-[12.5px] text-gray-500">{index + 1}</Text>,
  });
  // The number of the bill / receipt / payment, straight after SN.
  const billNoColumn = (width: number): BookColumn<HistoryRow> => ({
    key: 'billno',
    label: 'Bill no.',
    width,
    render: (row) =>
      row.reference ? (
        <Text className="text-[12.5px] font-semibold text-gray-700" numberOfLines={1}>
          {row.reference}
        </Text>
      ) : (
        <Text className="text-[12.5px] text-gray-400">—</Text>
      ),
  });
  // SN, the bill no., the date with its time under it, then what it was.
  const columns: BookColumn<HistoryRow>[] =
    windowWidth >= 1280
      ? [
          snColumn(52),
          billNoColumn(150),
          {
            key: 'date',
            label: 'Date',
            width: 150,
            render: (row) => (
              <View style={{ minWidth: 0 }}>
                <Text className="text-[12.5px] text-gray-700" numberOfLines={1}>
                  {row.dateLabel}
                </Text>
                <Text className="text-[11px] text-gray-400">{timeOf(row.createdAt)}</Text>
              </View>
            ),
          },
          { key: 'details', label: 'Transaction details', render: (row) => detailsCell(row, false, false) },
          typeColumn,
          ...moneyColumns,
          actionColumn,
        ]
      : [
          snColumn(38),
          billNoColumn(104),
          { key: 'details', label: 'Details', render: (row) => detailsCell(row, true, false) },
          typeColumn,
          ...moneyColumns,
          actionColumn,
        ];

  const historyView =
    rows.length === 0 ? (
      <View className="items-center rounded-xl border border-gray-300 bg-white py-8">
        <Ionicons name="document-text-outline" size={26} color="#D1D5DB" />
        <Text className="mt-2 text-sm text-gray-500">No history yet.</Text>
      </View>
    ) : tableMode ? (
      <BookTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        onRowPress={openRow}
        rowPressable={(row) => !!row.tx || row.manual}
        stickyHeader
      />
    ) : (
      <View>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            disabled={!row.tx && !row.manual}
            onPress={() => openRow(row)}
            className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3.5"
          >
            <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: row.iconBg }}>
              <Ionicons name={row.icon} size={14} color={row.iconColor} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">{row.label}</Text>
              <Text className="text-xs text-gray-400" numberOfLines={1}>
                {detailText(row) ? `${detailText(row)} · ` : ''}
                {row.dateLabel}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-sm font-extrabold" style={{ color: row.amountColor }}>
                NPR {formatMoney(row.amount)}
              </Text>
              {balanceNote(row)}
            </View>
            <View className="flex-row items-center" style={{ marginLeft: 2, gap: 2 }}>
              {deleteButton(row)}
              {row.tx ? <Ionicons name="chevron-forward" size={14} color="#D1D5DB" /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    );

  // The balance, shown in the name card itself rather than a row of their own: one figure,
  // both of their ledgers netted (as the Ledger list does), worded the way the Ledger
  // words it - "To receive" is money coming to you, "To pay" is money you owe.
  const netBalance = round2(balance - vendorBalance);
  const words =
    netBalance > 0
      ? { label: 'To receive', color: MONEY.in.text }
      : netBalance < 0
        ? { label: 'To pay', color: MONEY.out.text }
        : { label: 'Balance', color: '#374151' };
  const summary = <BalanceFigure label={words.label} value={`NPR ${formatMoney(Math.abs(netBalance))}`} color={words.color} />;

  return (
    <>
      <KeyboardAwareScrollView
        className="flex-1 bg-gray-50"
        contentContainerStyle={{ padding: layout.wide ? 24 : 12, paddingBottom: 48, gap: 14 }}
        enableOnAndroid
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
      >
        {toolbar}

        <EditableDetails customerId={id} basePath={basePath} summary={summary} />

        {!isPureVendor && showAddEntry && (
          <AddEntryForm customerId={id} ownerId={userId} onDone={() => setShowAddEntry(false)} />
        )}
        {!isPureCustomer && showAddVendorEntry && (
          <AddVendorEntryForm vendorId={id} ownerId={userId} onDone={() => setShowAddVendorEntry(false)} />
        )}

        {vehicleGroups && vehicleGroups.length > 0 ? (
          <VehicleTable groups={vehicleGroups} full={tableMode} onEditRow={editAnyRow} onDeleteRow={deleteAnyRow} />
        ) : (
          historyView
        )}
      </KeyboardAwareScrollView>
      {/* Editing an entry: the form shows itself as a popup (see EntryShell). Keyed on the
          entry so reopening another one starts from its own values. */}
      {editingEntry && (
        <AddEntryForm
          key={editingEntry.id}
          customerId={id}
          ownerId={userId}
          initial={editingEntry}
          onDone={() => setEditingEntry(null)}
        />
      )}
      {editingVendorEntry && (
        <AddVendorEntryForm
          key={editingVendorEntry.id}
          vendorId={id}
          ownerId={userId}
          initial={editingVendorEntry}
          onDone={() => setEditingVendorEntry(null)}
        />
      )}
      <TransactionDetailModal
        tx={viewingTx}
        categoryName={null}
        bankAccountName={null}
        onClose={() => setViewingTx(null)}
        onEdit={() => {
          if (viewingTx) router.push(`${basePath}/transactions?type=${viewingTx.type}&add=1&edit=${viewingTx.id}` as any);
          setViewingTx(null);
        }}
        editOnPage
      />
    </>
  );
}

interface VehicleGroup {
  key: string;
  /** "Sale E-144" for a bill's line; or, for an entry on no bill, what the entry is. */
  name: string;
  /** The bill the line is, when it is one - its items drop down under the line. */
  bill?: BusinessTransaction;
  side?: 'vendor' | 'customer';
  /** What it was bought / sold for (the bills), and what was owed without a bill. */
  billed: number;
  /** Money paid out: to the vendor, or back to the customer. */
  paid: number;
  received: number;
  lastDay: string;
  refs: string[];
  /** Its entries, oldest first, and what each put on this vehicle. */
  rows: HistoryRow[];
  parts: Map<string, VehiclePart>;
}

interface VehiclePart {
  billed: number;
  paid: number;
  received: number;
}

/** A vehicle account's ledger page: one line per vehicle, in the Ledger table's columns. */
function VehicleTable({
  groups,
  full,
  onEditRow,
  onDeleteRow,
}: {
  groups: VehicleGroup[];
  full: boolean;
  onEditRow: (r: HistoryRow) => void;
  onDeleteRow: (r: HistoryRow) => void;
}) {
  // The lines dropped down (a tap opens one under itself; nothing pops up).
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const press = (g: VehicleGroup) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(g.key)) next.delete(g.key);
      else next.add(g.key);
      return next;
    });
  };
  const lineName = (g: VehicleGroup) => (
    <View className="flex-row items-center" style={{ gap: 6, minWidth: 0 }}>
      <Ionicons name={open.has(g.key) ? 'chevron-down' : 'chevron-forward'} size={14} color="#6B7280" />
      <Text className="text-[13px] font-semibold text-gray-900" numberOfLines={1} style={{ flexShrink: 1 }}>
        {g.name}
      </Text>
    </View>
  );
  // What is left on the line, as the Ledger reads it: to pay a vendor, to receive from a customer.
  const net = (g: VehicleGroup) => (g.side === 'vendor' ? round2(g.billed - g.paid + g.received) : round2(g.billed + g.paid - g.received));
  const payable = (g: VehicleGroup) => {
    const n = net(g);
    return g.side === 'vendor' ? Math.max(0, n) : Math.max(0, -n);
  };
  const receivable = (g: VehicleGroup) => {
    const n = net(g);
    return g.side === 'vendor' ? Math.max(0, -n) : Math.max(0, n);
  };
  // The balance after each line, as a statement runs: oldest first, each line adding what it is owed (a bill)
  // or taking off what was paid (a receipt) - the lines are shown newest first.
  const runningBalance = useMemo(() => {
    const latest = (g: VehicleGroup) => g.rows.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), '');
    const oldestFirst = [...groups].sort((a, b) => a.lastDay.localeCompare(b.lastDay) || latest(a).localeCompare(latest(b)));
    const map = new Map<string, number>();
    let total = 0;
    for (const g of oldestFirst) {
      total = round2(total + receivable(g) - payable(g));
      map.set(g.key, total);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  const fig = (v: number, color: string, bold = true) =>
    v ? (
      <Text className={`text-[12.5px] ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }} numberOfLines={1}>
        {formatMoney(v)}
      </Text>
    ) : (
      <Text className="text-[12.5px] text-gray-300">—</Text>
    );
  const sum = (f: (g: VehicleGroup) => number) => round2(groups.reduce((s, g) => s + f(g), 0));
  const columns: BookColumn<VehicleGroup>[] = full
    ? [
        { key: 'sn', label: 'SN', width: 52, render: (_g, i) => <Text className="text-[12.5px] text-gray-500">{i + 1}</Text> },
        { key: 'vehicle', label: 'Particulars', render: lineName },
        {
          // The last date, with the line's reference numbers under it.
          key: 'last',
          label: 'Last Transaction',
          width: 180,
          render: (g) => (
            <View style={{ minWidth: 0 }}>
              <Text className="text-[12.5px] text-gray-700">{g.lastDay ? toBsHistoryLabel(g.lastDay) : '—'}</Text>
              {g.refs.length > 0 && (
                <Text className="text-[11px] text-gray-400" numberOfLines={1}>
                  {`Ref ${g.refs.join(', ')}`}
                </Text>
              )}
            </View>
          ),
        },
        { key: 'receivable', label: 'Debit (In)', width: 110, align: 'right', render: (g) => fig(receivable(g), MONEY.in.text) },
        { key: 'payable', label: 'Credit (Out)', width: 110, align: 'right', render: (g) => fig(payable(g), MONEY.out.text) },
        {
          key: 'balance',
          label: 'Balance',
          width: 120,
          align: 'right',
          render: (g) => <PartyBalance position={partyPosition({ receivable: runningBalance.get(g.key) ?? 0, payable: 0 })} compact />,
        },
      ]
    : [
        {
          key: 'vehicle',
          label: 'Particulars',
          render: (g) => (
            <View style={{ minWidth: 0, gap: 2 }}>
              {lineName(g)}
              <Text className="text-[11px] text-gray-400" numberOfLines={1}>
                {g.billed ? `Balance ${formatMoney(g.billed)}` : ''}
              </Text>
            </View>
          ),
        },
        {
          key: 'left',
          label: 'Left',
          width: 120,
          align: 'right',
          render: (g) => (payable(g) ? fig(payable(g), MONEY.out.text) : fig(receivable(g), MONEY.in.text)),
        },
      ];
  return (
    <BookTable
      columns={columns}
      rows={groups}
      rowKey={(g) => g.key}
      onRowPress={press}
      expanded={(g) => (open.has(g.key) ? <LineDrop group={g} onEditRow={onEditRow} onDeleteRow={onDeleteRow} /> : null)}
      stickyHeader
      footer={{
        label: `${groups.length} ${groups.length === 1 ? 'line' : 'lines'} · Total`,
        cells: full
          ? {
              receivable: fig(sum(receivable), MONEY.in.text),
              payable: fig(sum(payable), MONEY.out.text),
              balance: <PartyBalance position={partyPosition({ receivable: sum(receivable), payable: sum(payable) })} compact />,
            }
          : (() => {
              const left = round2(sum(payable) - sum(receivable));
              return { left: fig(Math.abs(left), left >= 0 ? MONEY.out.text : MONEY.in.text) };
            })(),
      }}
    />
  );
}

/** What a line drops down: a bill's items with their quantity and amount, then its service charges
 * (Installation ...); and every entry on the line - the bill itself, payments made on it - with Edit and Delete. */
function LineDrop({
  group,
  onEditRow,
  onDeleteRow,
}: {
  group: VehicleGroup;
  onEditRow: (r: HistoryRow) => void;
  onDeleteRow: (r: HistoryRow) => void;
}) {
  const bill = group.bill;
  const charges = (bill?.service_charges ?? []).filter((c) => Number(c.amount) > 0);
  const items = bill
    ? [
        ...(bill.items ?? [])
          .filter((i) => i.description?.trim())
          .map((i) => ({ name: i.description.trim(), qty: Number(i.qty) || null, amount: Number(i.amount) || 0 })),
        ...(charges.length
          ? charges.map((c) => ({ name: c.name?.trim() || 'Service', qty: null as number | null, amount: Number(c.amount) }))
          : Number(bill.installation_charge) > 0
            ? [{ name: 'Installation', qty: null as number | null, amount: Number(bill.installation_charge) }]
            : []),
      ]
    : [];
  const head = 'text-[11px] font-semibold uppercase text-gray-500';
  const cell = 'text-[12.5px] text-gray-800';
  const entries = [...group.rows].reverse();
  return (
    <View className="border-t border-gray-100 bg-gray-50" style={{ paddingVertical: 8, paddingLeft: 52, paddingRight: 16, gap: 10 }}>
      {items.length > 0 && (
        <View>
          <View className="flex-row" style={{ paddingVertical: 4 }}>
            <Text className={`flex-1 ${head}`}>Item</Text>
            <Text className={`text-right ${head}`} style={{ width: 60 }}>Qty</Text>
            <Text className={`text-right ${head}`} style={{ width: 110 }}>Amount</Text>
          </View>
          {items.map((l, i) => (
            <View key={i} className="flex-row border-t border-gray-100" style={{ paddingVertical: 6 }}>
              <Text className={`flex-1 ${cell}`} numberOfLines={2}>{l.name}</Text>
              <Text className={`text-right ${cell}`} style={{ width: 60 }}>{l.qty ?? '—'}</Text>
              <Text className={`text-right font-semibold ${cell}`} style={{ width: 110 }}>{formatMoney(l.amount)}</Text>
            </View>
          ))}
        </View>
      )}
      <View>
        <View className="flex-row" style={{ paddingVertical: 4 }}>
          <Text className={`flex-1 ${head}`}>Entry</Text>
          <Text className={`text-right ${head}`} style={{ width: 110 }}>Amount</Text>
          <View style={{ width: 60 }} />
        </View>
        {entries.map((r) => (
          <View key={r.key} className="flex-row items-center border-t border-gray-100" style={{ paddingVertical: 6 }}>
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text className={cell} numberOfLines={1}>
                {[r.label, r.detail].filter(Boolean).join(' · ')}
              </Text>
              <Text className="text-[11px] text-gray-400" numberOfLines={1}>
                {[r.dateLabel, r.reference ? `Ref ${r.reference}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text className="text-right text-[12.5px] font-bold" style={{ width: 110, color: r.amountColor }}>
              {formatMoney(r.amount)}
            </Text>
            <View className="flex-row items-center justify-end" style={{ width: 60, gap: 12 }}>
              <Pressable onPress={() => onEditRow(r)} hitSlop={6} accessibilityLabel="Edit entry">
                <Ionicons name="create-outline" size={16} color="#2563EB" />
              </Pressable>
              <Pressable onPress={() => onDeleteRow(r)} hitSlop={6} accessibilityLabel="Delete entry">
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
