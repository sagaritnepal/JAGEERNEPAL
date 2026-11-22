// lib/components/RequestDetailsExtras.tsx
import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { PersonAvatar } from './PersonAvatar';
import { formatScheduledWhen } from '../utils/scheduledTime';
import type { RequestLocation } from '../../types/database.types';

export function RequestPhotos({ photoUrls }: { photoUrls: string[] }) {
  const [signedUrls, setSignedUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadSignedUrls() {
      const urls = await Promise.all(
        photoUrls.map(async (path) => {
          const { data } = await supabase.storage.from('request-photos').createSignedUrl(path, 3600);
          return data?.signedUrl ?? null;
        })
      );
      if (!cancelled) setSignedUrls(urls.filter((u): u is string => !!u));
    }
    if (photoUrls.length > 0) loadSignedUrls();
    return () => {
      cancelled = true;
    };
  }, [photoUrls]);

  if (photoUrls.length === 0) return null;

  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm capitalize tracking-wide text-gray-400">Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {signedUrls.map((url, i) => (
            <Image key={i} source={{ uri: url }} className="h-24 w-24 rounded-lg" resizeMode="cover" />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function RequestDetailsExtras({
  scheduledDate,
  scheduledTime,
  location,
  photoUrls,
  customerName,
  customerPhone,
  customerPhotoUrl,
  contactPersonName,
  contactPersonPhone,
  companyName,
  hideCustomer,
}: {
  scheduledDate: string | null;
  scheduledTime: string | null;
  location: RequestLocation | null;
  photoUrls: string[];
  customerName?: string | null;
  customerPhone?: string | null;
  customerPhotoUrl?: string | null;
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  companyName?: string | null;
  /** Leaves the Customer block out - for a caller that shows it elsewhere on the page instead (see
   * the technician's Job Card, which puts it beside the Reseller card). */
  hideCustomer?: boolean;
}) {
  const hasSchedule = !!(scheduledDate || scheduledTime);
  const hasLocation = !!(location?.address || (location?.latitude != null && location?.longitude != null));
  const showCustomer = !hideCustomer && !!(customerName || customerPhone);
  const showContactPerson = !!contactPersonName && contactPersonName.trim() !== (customerName ?? '').trim();
  const showAppointment = hasSchedule || hasLocation;
  const showPhotos = photoUrls.length > 0;

  if (!showAppointment && !showCustomer && !showPhotos) return null;

  return (
    <View className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {showCustomer && (
        <View className={`p-5 ${showAppointment || showPhotos ? 'border-b border-gray-100' : ''}`}>
          <Text className="mb-2 text-sm capitalize tracking-wide text-gray-400">Customer</Text>
          <View className="flex-row items-center gap-2.5">
            <PersonAvatar name={customerName} photoUrl={customerPhotoUrl} size={36} bg="bg-orange-500" />
            {customerName && <Text className="text-sm font-semibold text-gray-900">{customerName}</Text>}
          </View>
          {!!companyName && (
            <View className="mt-1 flex-row items-center gap-1">
              <Ionicons name="business-outline" size={12} color="#6B7280" />
              <Text className="text-xs text-gray-500">{companyName}</Text>
            </View>
          )}
          {showContactPerson && (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Text className="text-xs text-gray-500">
                Contact: {contactPersonName}
                {contactPersonPhone ? ` · ${contactPersonPhone}` : ''}
              </Text>
              {contactPersonPhone && (
                <Pressable onPress={() => Linking.openURL(`tel:${contactPersonPhone}`)} hitSlop={6}>
                  <Ionicons name="call-outline" size={13} color="#1d4ed8" />
                </Pressable>
              )}
            </View>
          )}
          {customerPhone && (
            <>
              <Text className="mt-2 text-sm text-gray-500">{customerPhone}</Text>
              <View className="mt-2.5 flex-row gap-2">
                <Pressable
                  onPress={() => Linking.openURL(`sms:${customerPhone}`)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-teal-50 py-2.5"
                >
                  <Ionicons name="chatbubble-outline" size={15} color="#0F766E" />
                  <Text className="text-sm font-semibold text-teal-700">Message</Text>
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5"
                >
                  <Ionicons name="call-outline" size={15} color="#1d4ed8" />
                  <Text className="text-sm font-semibold text-orange-700">Call Customer</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {showAppointment && (
        <View className={`p-5 ${showPhotos ? 'border-b border-gray-100' : ''}`}>
          <View className="mb-3 flex-row items-center gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
              <Ionicons name="calendar-outline" size={16} color="#2563EB" />
            </View>
            <Text className="text-base font-bold text-gray-900">Appointment</Text>
          </View>

          {hasSchedule && (
            <View className="flex-row items-center gap-2.5 py-1">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                <Ionicons name="time-outline" size={14} color="#6B7280" />
              </View>
              <Text className="flex-1 text-sm font-semibold text-gray-900">
                {formatScheduledWhen(scheduledDate, scheduledTime)}
              </Text>
            </View>
          )}

          {hasLocation && (
            <View className={`flex-row items-start gap-2.5 py-1 ${hasSchedule ? 'mt-1 border-t border-gray-100 pt-3' : ''}`}>
              <View className="h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                <Ionicons name="location-outline" size={14} color="#6B7280" />
              </View>
              <View className="flex-1">
                {location?.address ? <Text className="text-sm text-gray-700">{location.address}</Text> : null}
                {location?.latitude != null && location?.longitude != null && (
                  <Pressable
                    onPress={() => Linking.openURL(`https://www.google.com/maps?q=${location.latitude},${location.longitude}`)}
                    className="mt-1.5 flex-row items-center self-start"
                    style={{ gap: 4 }}
                  >
                    <Text className="text-xs font-bold text-blue-600">View on Google Maps</Text>
                    <Ionicons name="arrow-forward" size={11} color="#2563EB" />
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {showPhotos && (
        <View className="px-5 pb-5">
          <RequestPhotos photoUrls={photoUrls} />
        </View>
      )}
    </View>
  );
}
