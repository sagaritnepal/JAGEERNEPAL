// lib/components/finance/NewPartyConfirm.tsx
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { TextInput } from 'react-native';
import { Text } from './CapsText';
import { Field, FieldRow, FormActions, INPUT, PopupCard } from './FormKit';
import { PartyTypeField } from './PartyTypeField';
import { useAuthStore } from '../../hooks/useAuth';
import { usePartyTypes } from '../../hooks/usePartyTypes';
import { readKey } from '../../utils/webKeys';

export type NewPartyKind = 'customer' | 'vendor' | 'payee';

/** What the popup answers with: the name to save, the Ledger type to file the person under (null: none),
 * and, when the popup asked for one, the phone number and address (null: none / not asked). */
export interface NewPartyAnswer {
  name: string;
  partyTypeId: string | null;
  phone: string | null;
  address: string | null;
}

export interface AskNewPartyOptions {
  name: string;
  kind: NewPartyKind;
  typeId?: string | null;
  /** Show a Phone box (optional for the person to fill). */
  askPhone?: boolean;
  /** The phone the box starts with. */
  phone?: string | null;
  /** Show an Address box (optional for the person to fill). */
  askAddress?: boolean;
  /** The address the box starts with. */
  address?: string | null;
}

/** The type to save on the new customer row: `{ ...withType(answer) }`. */
export const withType = (answer: NewPartyAnswer): { party_type_id?: string } => (answer.partyTypeId ? { party_type_id: answer.partyTypeId } : {});

function NewPartyDialog({
  kind,
  initial,
  typeId,
  askPhone,
  initialPhone,
  askAddress,
  initialAddress,
  onAdd,
  onCancel,
}: {
  kind: NewPartyKind;
  initial: string;
  typeId?: string | null;
  askPhone?: boolean;
  initialPhone: string | null;
  askAddress?: boolean;
  initialAddress: string | null;
  onAdd: (answer: NewPartyAnswer) => void;
  onCancel: () => void;
}) {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { types, remove: removeType } = usePartyTypes(userId);
  const [name, setName] = useState(initial);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [address, setAddress] = useState(initialAddress ?? '');
  // A Ledger type made in this popup is kept only if the person is added: on Cancel it is taken back out.
  const madeTypes = useRef<string[]>([]);
  const cancel = () => {
    for (const id of madeTypes.current) void removeType(id).catch(() => undefined);
    madeTypes.current = [];
    onCancel();
  };
  // The Ledger type starts on the one that fits what is being added (a customer under Customer, a vendor or payee
  // under Vendor) - or the one the caller asked for - until another is picked or typed.
  const fitting = useMemo(() => {
    if (typeId) return typeId;
    const word = kind === 'customer' ? /^customers?$/i : /^vendors?$/i;
    return types.find((t) => word.test(t.name.trim()))?.id ?? null;
  }, [typeId, kind, types]);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const partyTypeId = picked === undefined ? fitting : picked;
  const add = () => {
    if (name.trim()) onAdd({ name: name.trim(), partyTypeId, phone: phone.trim() || null, address: address.trim() || null });
  };
  return (
    // No cross, but a click outside, Esc and Cancel all go back: the name is dropped and nothing is saved. Only Add saves.
    <PopupCard
      title={`Add new ${kind}`}
      onClose={cancel}
      maxWidth={460}
      hideClose
      closeOnOutside
      footer={<FormActions onCancel={cancel} onSave={add} saveLabel={`Add ${kind}`} />}
    >
      <Text className="text-[13px] text-gray-500">
        This {kind} is not saved yet. Check the name - fix it if it needs it - and the Ledger type it belongs to, then add.
      </Text>
      {/* In a row: a Field's width setting is a height in a column. */}
      <FieldRow>
        <Field label="Name" basis={240}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            placeholder="Name"
            placeholderTextColor="#9CA3AF"
            onKeyPress={(e) => {
              const k = readKey(e);
              if (k.key === 'Enter') {
                k.prevent();
                add();
              } else if (k.key === 'Escape') {
                k.prevent();
                cancel();
              }
            }}
            className={INPUT}
          />
        </Field>
        {askPhone && (
          <Field label="Phone (optional)" basis={150}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="98XXXXXXXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              onKeyPress={(e) => {
                const k = readKey(e);
                if (k.key === 'Enter') {
                  k.prevent();
                  add();
                } else if (k.key === 'Escape') {
                  k.prevent();
                  cancel();
                }
              }}
              className={INPUT}
            />
          </Field>
        )}
      </FieldRow>
      {askAddress && (
        <Field label="Address (optional)">
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="House/street, city, area"
            placeholderTextColor="#9CA3AF"
            onKeyPress={(e) => {
              const k = readKey(e);
              if (k.key === 'Enter') {
                k.prevent();
                add();
              } else if (k.key === 'Escape') {
                k.prevent();
                cancel();
              }
            }}
            className={INPUT}
          />
        </Field>
      )}
      <PartyTypeField ownerId={userId} value={partyTypeId} onChange={setPicked} onCreated={(id) => madeTypes.current.push(id)} />
    </PopupCard>
  );
}

/** `const { askNewParty, dialog } = useConfirmNewParty()` - `await askNewParty({ name, kind })` right before a
 * new customer / vendor is saved from a typed name. It opens a popup with the name in an editable box and the
 * Ledger type it will be filed under: resolves to the name and type to save ("Add"), or null on Cancel / Esc -
 * then nothing is saved. `typeId` starts the Ledger type on a given one (an employee). `askPhone` adds an
 * optional Phone box (starting at `phone`). Render `{dialog}` anywhere in the screen. */
export function useConfirmNewParty(): {
  askNewParty: (options: AskNewPartyOptions) => Promise<NewPartyAnswer | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<(AskNewPartyOptions & { resolve: (answer: NewPartyAnswer | null) => void }) | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const askNewParty = useCallback(
    (options: AskNewPartyOptions) => {
      // A second ask while one is already up must not stack another.
      if (pendingRef.current) return Promise.resolve<NewPartyAnswer | null>(null);
      return new Promise<NewPartyAnswer | null>((resolve) => setPending({ ...options, resolve }));
    },
    []
  );

  const finish = (value: NewPartyAnswer | null) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = pending ? (
    <NewPartyDialog
      kind={pending.kind}
      initial={pending.name}
      typeId={pending.typeId}
      askPhone={pending.askPhone}
      initialPhone={pending.phone ?? null}
      askAddress={pending.askAddress}
      initialAddress={pending.address ?? null}
      onAdd={(answer) => finish(answer)}
      onCancel={() => finish(null)}
    />
  ) : null;
  return { askNewParty, dialog };
}
