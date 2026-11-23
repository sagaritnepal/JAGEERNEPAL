// app/(reseller)/request-details.tsx
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/hooks/useAuth';
import { useSupabaseInsert, useSupabaseQuery, useSupabaseRow, useSupabaseUpdate } from '../../lib/hooks/useSupabase';
import { supabase } from '../../lib/supabase';
import { CategoryBadge } from '../../lib/components/CategoryBadge';
import { RequestPhotos } from '../../lib/components/RequestDetailsExtras';
import { ticketLabel } from '../../lib/utils/ticket';
import { DateField, TimeField } from '../../lib/components/DateTimeFields';
import { WEB_SIDEBAR_MIN_WIDTH } from '../../lib/components/web/WebSidebarShell';
import { LocationPickerModal, type Coords } from '../../lib/components/LocationPickerModal';
import { MapPreview } from '../../lib/components/MapPreview';
import { showAlert, getErrorMessage } from '../../lib/utils/alert';
import { resizeImageForUpload } from '../../lib/utils/resizeImage';
import { returnPathOr } from '../../lib/utils/returnPath';
import { ServiceDropdown } from '../../lib/components/ServiceDropdown';
import { usePhoneContacts } from '../../lib/hooks/usePhoneContacts';
import { SuggestInput, type SuggestOption } from '../../lib/components/finance/SuggestInput';
import { useConfirmNewParty, withType } from '../../lib/components/finance/NewPartyConfirm';
import { buildCustomerSuggestions } from '../../lib/utils/customerSuggestions';
import { isValidPhone10 } from '../../lib/utils/phone';
import { parseAmount, digitsInput } from '../../lib/utils/number';
import type { Customer } from '../../types/database.types';

const PHOTO_SLOTS = 3;

export default function ResellerRequestDetailsScreen() {
  const { n, category, action } = useLocalSearchParams<{ n?: string; category?: string; action?: string }>();
  // A hidden tab screen stays mounted between visits: every "new request"
  // link passes a fresh `n`, and keying on it gives each request a clean
  // form while a tab switch keeps what's already filled in. It used to reset
  // on every focus, which wiped a half-filled form on a tab switch.
  return <ResellerRequestDetails key={n ?? `${category}|${action}`} />;
}

function ResellerRequestDetails() {
  const { category: presetCategory, action: presetAction, from, edit: editId } = useLocalSearchParams<{
    category?: string;
    action?: string;
    from?: string;
    edit?: string;
  }>();
  // With `edit` set this is the same form opened on an existing job: filled in with what the job has, and
  // saving writes back to that one job. It never touches the saved customer (Ledger) the job is linked to -
  // that record can be shared with other jobs, and renaming it here would rename them all.
  const { data: editRequest, isLoading: loadingEdit } = useSupabaseRow('service_requests', editId);
  const updateRequest = useSupabaseUpdate('service_requests');
  const [hydrated, setHydrated] = useState(!editId);
  // The service the job had when it opened - issue_type is only rewritten if it is changed.
  const initialService = useRef<{ category: string; action: string } | null>(null);
  // Photos already on the job: kept as they are, new ones are added after them.
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  // A "new job" button opens this form with nothing chosen; the service is picked here (see ServiceDropdown).
  // A service tile on the Services page opens it with the service already set.
  const [service, setService] = useState<{ category: string; action: string } | null>(
    presetCategory ? { category: presetCategory, action: presetAction || 'Repair' } : null
  );
  const category = service?.category;
  const action = service?.action;
  // Back to whichever tab opened this form, not always Requests.
  const returnPath = returnPathOr('/(reseller)', from, 'requests');
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= WEB_SIDEBAR_MIN_WIDTH;
  const userId = useAuthStore((state) => state.session?.user.id);
  const createRequest = useSupabaseInsert('service_requests');
  const createCustomer = useSupabaseInsert('customers');
  const updateCustomer = useSupabaseUpdate('customers');
  // A typed name that isn't a saved customer is checked here before it's saved - same confirm-first
  // flow a Sale bill uses for a new customer/vendor (see NewPartyConfirm.tsx).
  const { askNewParty, dialog: newPartyDialog } = useConfirmNewParty();
  const { data: myCustomers } = useSupabaseQuery('customers', {
    filters: userId ? { owner_id: userId } : {},
    orderBy: { column: 'name' },
    enabled: !!userId,
  });
  const phoneContacts = usePhoneContacts();

  const [customerId, setCustomerId] = useState<string | null>(null);
  // Raises the sheet's z-index while the Customer name dropdown is open, so its suggestion list
  // draws over the Location section below it instead of the two overlapping (see ServiceDropdown,
  // which raises its own card's z-index the same way for the same reason).
  const [customerListOpen, setCustomerListOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySameAsCustomer, setCompanySameAsCustomer] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [photos, setPhotos] = useState<(string | null)[]>(Array(PHOTO_SLOTS).fill(null));
  const [notes, setNotes] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [repeatOfId, setRepeatOfId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set the instant Submit is pressed - the state above only updates on the next render, so a quick
  // double tap could otherwise create the same job twice.
  const submittingRef = useRef(false);

  // Fills the form once the job loads - only once, so a refetch never clobbers what is being typed.
  useEffect(() => {
    if (!editRequest || hydrated) return;
    // issue_type is "Category - Action"; the action is the last part.
    const issue = editRequest.issue_type ?? '';
    const cut = issue.lastIndexOf(' - ');
    const jobService = cut > 0 ? { category: issue.slice(0, cut), action: issue.slice(cut + 3) } : { category: issue, action: 'Repair' };
    initialService.current = jobService;
    setService(jobService);
    setCustomerId(editRequest.customer_id);
    setCustomerName(editRequest.customer_name ?? '');
    setCustomerPhone(editRequest.customer_phone ?? '');
    const company = editRequest.company_name ?? '';
    setCompanySameAsCustomer(!!company && company === editRequest.customer_name);
    setCompanyName(company);
    setDate(editRequest.scheduled_date ?? '');
    setTime(editRequest.scheduled_time?.slice(0, 5) ?? '');
    setAddress(editRequest.location_data?.address ?? '');
    const lat = editRequest.location_data?.latitude;
    const lng = editRequest.location_data?.longitude;
    setCoords(lat != null && lng != null ? { latitude: lat, longitude: lng } : null);
    setNotes(editRequest.description ?? '');
    setQuotedPrice(editRequest.quoted_price != null ? String(Number(editRequest.quoted_price)) : '');
    setExistingPhotos(editRequest.photo_urls ?? []);
    setRepeatOfId(editRequest.repeat_of_request_id ?? null);
    setHydrated(true);
  }, [editRequest, hydrated]);

  // This customer's own finished jobs, so a genuine return trip can be linked by hand instead of
  // guessed from timing (see migration 0113). Only fetched once there's a customer identity to match.
  const { data: customerHistory } = useSupabaseQuery('service_requests', {
    filters: userId ? { reseller_id: userId, status: 'resolved' } : {},
    enabled: !!userId && (!!customerId || customerPhone.trim().length === 10),
  });
  const repeatCandidates = (customerHistory ?? []).filter(
    (r) =>
      r.id !== editId &&
      ((customerId && r.customer_id === customerId) || (customerPhone.trim() && r.customer_phone === customerPhone.trim()))
  );
  const validRepeatOfId = repeatCandidates.some((r) => r.id === repeatOfId) ? repeatOfId : null;

  function handleSelectCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    // Always take the picked customer's own location, even when it's empty -
    // keeping the previous pick's address would book (and save back to this
    // customer's record) someone else's location.
    setAddress(customer.address ?? '');
    setCoords(
      customer.latitude != null && customer.longitude != null
        ? { latitude: customer.latitude, longitude: customer.longitude }
        : null
    );
  }

  async function handlePickPhoto(index: number) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Photo access needed', 'Allow photo library access to attach pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const resizedUri = await resizeImageForUpload(asset.uri, asset.width, 1024);
      setPhotos((prev) => prev.map((p, i) => (i === index ? resizedUri : p)));
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.map((p, i) => (i === index ? null : p)));
  }

  async function uploadPhoto(uri: string, index: number): Promise<string> {
    const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
    const path = `${userId}/${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage
      .from('request-photos')
      .upload(path, arraybuffer, { contentType: 'image/jpeg' });
    if (error) throw error;
    return path;
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    if (!userId) {
      showAlert('Please sign in', 'Your session may have expired — sign in again and retry.');
      return;
    }
    if (!customerName.trim()) {
      showAlert('Add the customer name', 'Enter who this request is for.');
      return;
    }
    if (customerPhone.trim() && !isValidPhone10(customerPhone)) {
      showAlert('Check the phone number', "Enter the customer's 10-digit phone number, or leave it blank.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    let saved = false;
    try {
      // Who this is for is resolved first - a name that isn't a saved customer is confirmed (name,
      // phone and optionally a location, in one popup) here, same as a Sale bill's new customer/
      // vendor (see NewPartyConfirm.tsx), before the job's own date/location are checked below - so a
      // location typed into that popup already covers the location check that follows.
      let linkedCustomerId: string | null = customerId;
      let finalCustomerName = customerName.trim();
      let finalCustomerPhone = customerPhone.trim();
      let finalAddress = address.trim();
      let finalCoords = coords;

      if (!editRequest) {
        if (linkedCustomerId) {
          try {
            await updateCustomer.mutateAsync({
              id: linkedCustomerId,
              values: {
                name: finalCustomerName,
                phone: finalCustomerPhone || null,
                address: finalAddress || null,
                latitude: finalCoords?.latitude ?? null,
                longitude: finalCoords?.longitude ?? null,
              },
            });
          } catch {
            // The booking still goes ahead linked to the existing record even if this edit didn't save.
          }
        } else {
          const checked = await askNewParty({
            name: finalCustomerName,
            kind: 'customer',
            askPhone: true,
            phone: finalCustomerPhone || null,
            askAddress: true,
            address: finalAddress || null,
          });
          if (!checked) return; // Cancelled: back to the form, nothing saved.
          finalCustomerName = checked.name;
          finalCustomerPhone = checked.phone ?? finalCustomerPhone;
          setCustomerName(finalCustomerName);
          if (checked.phone) setCustomerPhone(checked.phone);
          if (checked.address && !finalAddress) {
            finalAddress = checked.address;
            setAddress(checked.address);
          }
          try {
            const created = await createCustomer.mutateAsync({
              owner_id: userId,
              name: finalCustomerName,
              phone: finalCustomerPhone || null,
              address: finalAddress || null,
              latitude: finalCoords?.latitude ?? null,
              longitude: finalCoords?.longitude ?? null,
              ...withType(checked),
            });
            linkedCustomerId = created.id;
          } catch {
            // Most likely a duplicate-phone conflict (customers_owner_phone_idx)
            // against a record that isn't in myCustomers' current cache yet -
            // link to it by phone instead of leaving the booking unlinked from
            // the contact book.
            const existing = finalCustomerPhone
              ? (myCustomers ?? []).find((c) => c.phone === finalCustomerPhone)
              : undefined;
            linkedCustomerId = existing?.id ?? null;
          }
        }
      }

      if (!date.trim()) {
        showAlert('Add a date', 'Let us know when you need this service.');
        return;
      }
      if (!finalAddress && !finalCoords) {
        showAlert('Add a location', 'Use your current location or type an address.');
        return;
      }
      const price = parseAmount(quotedPrice);
      if (quotedPrice.trim() && (price == null || price <= 0)) {
        showAlert('Invalid price', 'Enter a valid price in NPR, or leave it blank if you don\'t know it yet.');
        return;
      }
      // Service is optional now - fall back to a placeholder so issue_type (not-null in the
      // database) still gets a value, and still parses back into category/action on edit.
      const issueType = service ? `${category} - ${action}` : 'General - Not specified';

      const photoUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i];
        if (uri) photoUrls.push(await uploadPhoto(uri, i));
      }

      if (editRequest) {
        // Saves to this job only. The saved customer it is linked to is left as it is (see above).
        const addressChanged = finalAddress !== (editRequest.location_data?.address ?? '').trim();
        const pinMoved =
          (finalCoords?.latitude ?? null) !== (editRequest.location_data?.latitude ?? null) ||
          (finalCoords?.longitude ?? null) !== (editRequest.location_data?.longitude ?? null);
        // A changed address no longer matches the saved map pin - drop it rather than send the technician to the old place.
        const location_data =
          addressChanged && !pinMoved ? { address: finalAddress } : { ...finalCoords, address: finalAddress };
        const serviceChanged = !!service && (
          service.category !== initialService.current?.category || service.action !== initialService.current?.action
        );
        await updateRequest.mutateAsync({
          id: editRequest.id,
          values: {
            customer_id: customerId,
            customer_name: finalCustomerName,
            customer_phone: finalCustomerPhone || null,
            contact_person_name: finalCustomerName,
            contact_person_phone: finalCustomerPhone || null,
            company_name: (companySameAsCustomer ? finalCustomerName : companyName).trim() || null,
            issue_type: serviceChanged ? issueType : editRequest.issue_type,
            description: notes.trim() || null,
            quoted_price: price,
            scheduled_date: date.trim(),
            scheduled_time: time.trim() || null,
            location_data,
            photo_urls: [...existingPhotos, ...photoUrls],
            repeat_of_request_id: validRepeatOfId,
          } as any,
        });
        saved = true;
        showAlert('Job updated', 'Your changes have been saved.');
        router.replace(returnPath);
        return;
      }

      await createRequest.mutateAsync({
        client_id: userId,
        reseller_id: userId,
        customer_id: linkedCustomerId,
        origin: 'reseller',
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone || null,
        contact_person_name: finalCustomerName,
        contact_person_phone: finalCustomerPhone || null,
        company_name: (companySameAsCustomer ? finalCustomerName : companyName).trim() || null,
        issue_type: issueType,
        description: notes.trim() || null,
        status: 'pending',
        quoted_price: price,
        scheduled_date: date.trim(),
        scheduled_time: time.trim() || null,
        location_data: { ...finalCoords, address: finalAddress },
        photo_urls: photoUrls,
        repeat_of_request_id: validRepeatOfId,
      });

      saved = true;
      showAlert('Request submitted', 'Assign a technician from the Requests tab whenever you’re ready.');
      router.replace(returnPath);
    } catch (err) {
      showAlert('Something went wrong', getErrorMessage(err));
    } finally {
      // Only a failed save can be tried again; a saved one leaves the form locked while the page navigates away,
      // so a late second press cannot create the same job twice.
      if (!saved) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  // Only name, date and location are required; everything else (service, phone, time, photos,
  // notes, price) is optional. A phone that was typed but isn't valid still needs fixing though.
  const missing: string[] = [];
  if (!customerName.trim()) missing.push('customer name');
  if (!address.trim() && !coords) missing.push('location');
  if (!date.trim()) missing.push('date');
  if (customerPhone.trim() && !isValidPhone10(customerPhone)) missing.push('valid phone number');
  const missingText = missing.join(', ').replace(/^./, (ch) => ch.toUpperCase());

  // Tapping the Customer name box drops its matches right under it, instead of a separate popup -
  // picking one below fills name, phone and (for a saved customer) their location.
  const customerMatches = buildCustomerSuggestions(myCustomers ?? [], phoneContacts.contacts, customerName, undefined, true);
  const customerOptions: SuggestOption[] = customerMatches.map((s) => ({
    key: s.key,
    label: s.name,
    sub: s.phone,
    hint: s.customer ? undefined : 'Contact',
  }));
  function pickCustomerOption(option: SuggestOption) {
    const match = customerMatches.find((s) => s.key === option.key);
    if (match?.customer) {
      handleSelectCustomer(match.customer);
      return;
    }
    // A phone contact, not a saved customer yet - the amber banner below offers Register now.
    setCustomerName(match?.name ?? option.label);
    setCustomerPhone(match?.phone ?? '');
    setCustomerId(null);
  }

  function cancel() {
    router.replace(returnPath);
  }

  const locationButton = (
    <Pressable
      onPress={() => setShowLocationPicker(true)}
      className="flex-row items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-50 px-4"
      style={{ minHeight: 48 }}
    >
      <Ionicons name="locate" size={16} color="#1D4ED8" />
      <Text className="text-sm font-semibold text-blue-700">
        {coords ? 'Location set — tap to change' : 'Select location'}
      </Text>
    </Pressable>
  );

  // A job being edited keeps the photos it has; only the room left over is for new ones.
  const photoSlots = (
    <View className="flex-row gap-2.5">
      {photos.slice(0, Math.max(0, PHOTO_SLOTS - existingPhotos.length)).map((uri, index) => (
        <Pressable
          key={index}
          onPress={() => (uri ? removePhoto(index) : handlePickPhoto(index))}
          className="items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50"
          style={isWideWeb ? { width: 84, height: 84 } : { flex: 1, height: 88 }}
        >
          {uri ? (
            <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={22} color="#9CA3AF" />
              <Text className="mt-1 text-xs font-semibold text-gray-400">Add photo</Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );

  const notesInput = (
    <TextInput
      value={notes}
      onChangeText={setNotes}
      placeholder="Anything else the technician should know?"
      multiline
      numberOfLines={3}
      className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-base"
      style={[{ minHeight: 88, textAlignVertical: 'top' }, isWideWeb ? { flex: 1 } : null]}
    />
  );

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-gray-500">{loadingEdit ? 'Loading…' : 'This job could not be found.'}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: isWideWeb ? 32 : 16, paddingTop: isWideWeb ? 24 : 16, paddingBottom: 24 }}
      >
        {!!editRequest && (
          <View className="mb-3 flex-row items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
            <Ionicons name="create-outline" size={15} color="#1D4ED8" />
            <Text className="flex-1 text-[13px] font-semibold text-blue-700">
              Editing job {ticketLabel(editRequest.ticket_no) ?? ''} - changes save to this job only.
            </Text>
          </View>
        )}
        <ServiceDropdown value={service} onChange={setService} />

        <View
          className={`rounded-2xl border border-gray-200 bg-white ${isWideWeb ? 'p-5' : 'p-4'}`}
          style={{ zIndex: customerListOpen ? 50 : 0 }}
        >
          <FormSection
            title="Who is it for?"
            subtitle="Saved customer or phone contact"
            first
            style={{ zIndex: customerListOpen ? 50 : 0, position: 'relative' }}
          >
            <FieldLabel required>Customer name</FieldLabel>
            <SuggestInput
              value={customerName}
              onChangeText={(v) => {
                setCustomerName(v);
                setCustomerId(null);
              }}
              onFocus={() => {
                phoneContacts.request();
                setCustomerListOpen(true);
              }}
              onBlur={() => setTimeout(() => setCustomerListOpen(false), 150)}
              options={customerOptions}
              onSelectOption={pickCustomerOption}
              showWhenEmpty
              placeholder="Who is this request for?"
              inputClassName="rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900"
              accent="#2563EB"
              adornment={
                customerId ? (
                  <View className="rounded-full bg-emerald-50 px-2 py-0.5">
                    <Text className="text-[11px] font-semibold text-emerald-600">Saved customer</Text>
                  </View>
                ) : undefined
              }
              adornmentWidth={customerId ? 110 : 0}
            />

            <FieldLabel>Customer phone</FieldLabel>
            <TextInput
              value={customerPhone}
              onChangeText={(v) => setCustomerPhone(digitsInput(v))}
              placeholder="98XXXXXXXX"
              keyboardType="phone-pad"
              maxLength={10}
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-base"
            />

            {repeatCandidates.length > 0 && (
              <View className="mt-3.5 border-t border-gray-100 pt-3.5">
                <FieldLabel>Repeat visit?</FieldLabel>
                <Text className="mb-2 text-xs leading-[17px] text-gray-500">
                  {customerName.trim() || 'This customer'} has {repeatCandidates.length} earlier finished{' '}
                  {repeatCandidates.length === 1 ? 'job' : 'jobs'}. Link this one if it's a return trip for one of them.
                </Text>
                <View style={{ gap: 6 }}>
                  {repeatCandidates.slice(0, 5).map((r) => {
                    const on = validRepeatOfId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setRepeatOfId(on ? null : r.id)}
                        className="flex-row items-center gap-2.5 rounded-lg border px-3 py-2.5"
                        style={{ borderColor: on ? '#3b82f6' : '#E5E7EB', backgroundColor: on ? '#eff6ff' : '#fff' }}
                      >
                        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={17} color={on ? '#2563EB' : '#9CA3AF'} />
                        <View className="flex-1">
                          <Text className="text-[13px] font-semibold text-gray-900" numberOfLines={1}>
                            {r.issue_type}
                          </Text>
                          <Text className="text-[11.5px] text-gray-500">
                            {ticketLabel(r.ticket_no)} · {new Date(r.scheduled_date ?? r.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </FormSection>

          <FormSection title="Location" subtitle="Seen by the technician before accepting">
            <FieldLabel required>Location</FieldLabel>
            {isWideWeb ? (
              <View className="flex-row gap-2.5">
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House/street, city, area"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base"
                />
                {locationButton}
              </View>
            ) : (
              <>
                {locationButton}
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House/street, city, area"
                  multiline
                  className="mt-2.5 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base"
                  style={{ minHeight: 60, textAlignVertical: 'top' }}
                />
              </>
            )}
            {coords && <View className="mt-2.5"><MapPreview coords={coords} height={140} /></View>}
          </FormSection>

          <FormSection title="When?" subtitle="Seen by the technician before accepting">
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <FieldLabel required>Date</FieldLabel>
                <DateField value={date} onChange={setDate} />
              </View>
              <View className="flex-1">
                <FieldLabel>Time</FieldLabel>
                <TimeField value={time} onChange={setTime} />
              </View>
            </View>
          </FormSection>

          <FormSection title="Show the problem" subtitle={`Optional — up to ${PHOTO_SLOTS} photos and notes help quoting`}>
            {existingPhotos.length > 0 && (
              <View className="mb-3">
                <Text className="mb-1.5 text-xs font-medium text-gray-500">Already on this job</Text>
                <RequestPhotos photoUrls={existingPhotos} />
              </View>
            )}
            {isWideWeb ? (
              <View className="flex-row gap-4">
                {photoSlots}
                {notesInput}
              </View>
            ) : (
              <>
                {photoSlots}
                <View className="mt-3">{notesInput}</View>
              </>
            )}
            {photos.some(Boolean) && <Text className="mt-2 text-xs text-gray-400">Tap a photo to remove it.</Text>}
          </FormSection>

          <FormSection title="Price" subtitle="Optional — leave blank to price it later">
            <View className="flex-row items-center gap-2 rounded-lg border border-gray-300 bg-white px-4">
              <Text className="text-base font-semibold text-gray-500">NPR</Text>
              <TextInput
                value={quotedPrice}
                onChangeText={setQuotedPrice}
                placeholder="e.g. 2000"
                keyboardType="numeric"
                className="flex-1 py-3 text-base"
              />
            </View>
            <Text className="mt-2 text-xs leading-5 text-gray-400">
              This is your own customer, so the price is yours to agree with them - you can assign a technician
              straight away.
            </Text>
          </FormSection>
        </View>
      </ScrollView>

      <View
        className="flex-row items-center gap-3 border-t border-gray-200 bg-white py-2.5"
        style={{
          paddingHorizontal: isWideWeb ? 32 : 16,
          shadowColor: '#111827',
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        }}
      >
        {isWideWeb && !!service && (
          <View className="flex-row items-center gap-3">
            <CategoryBadge category={category} size={36} />
            <View>
              <Text className="text-sm font-bold text-gray-900">
                {category} · {action}
              </Text>
              {!!customerName && <Text className="text-xs text-gray-500">{customerName}</Text>}
            </View>
          </View>
        )}
        <View className="flex-1" style={isWideWeb ? { alignItems: 'flex-end' } : undefined}>
          <Text className={`text-[13px] font-bold ${missing.length ? 'text-amber-700' : 'text-emerald-600'}`}>
            {missing.length ? `${missing.length} required left` : editRequest ? 'Ready to save' : 'Ready to submit'}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {missing.length
              ? missingText
              : editRequest
                ? 'Changes save to this job only'
                : quotedPrice.trim()
                  ? 'Ready to assign a technician'
                  : 'You can add a price later'}
          </Text>
        </View>
        {isWideWeb && (
          <Pressable onPress={cancel} className="h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-5">
            <Text className="text-base font-semibold text-gray-600">Cancel</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="h-12 items-center justify-center rounded-lg bg-orange-500 px-6"
          style={{ opacity: submitting ? 0.5 : missing.length ? 0.6 : 1 }}
        >
          <Text className="text-base font-semibold text-white">
            {editRequest ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Submitting…' : 'Submit request'}
          </Text>
        </Pressable>
      </View>


      <LocationPickerModal
        visible={showLocationPicker}
        initialCoords={coords}
        onConfirm={(nextCoords, nextAddress) => {
          setCoords(nextCoords);
          if (nextAddress) setAddress(nextAddress);
          setShowLocationPicker(false);
        }}
        onClose={() => setShowLocationPicker(false)}
      />
      {newPartyDialog}
    </View>
  );
}

/** A field's label, with a red asterisk for the handful that are actually required
 * (customer name, location, date) - everything else in this form is optional. */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text className="mb-1.5 text-sm font-medium text-gray-700">
      {children}
      {required && <Text className="text-red-500"> *</Text>}
    </Text>
  );
}

/** One labeled part of the single request sheet - a hairline above it separates it from the part
 * before, except the first. */
function FormSection({
  title,
  subtitle,
  first,
  style,
  children,
}: {
  title: string;
  subtitle: string;
  first?: boolean;
  /** Raises this section's own stacking context above the ones after it - a FormSection has no
   * explicit zIndex by default, so a dropdown open inside one does not by itself outrank a later
   * section's content (see the Customer name/Location overlap this fixes). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View className={first ? '' : 'mt-5 border-t border-gray-100 pt-5'} style={style}>
      <View className="mb-3.5">
        <Text className="text-base font-bold text-gray-900">{title}</Text>
        <Text className="text-xs text-gray-400">{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}
