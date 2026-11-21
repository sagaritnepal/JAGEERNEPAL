// lib/hooks/useMarkJobDone.tsx
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { getErrorMessage, showAlert } from '../utils/alert';
import { ticketLabel } from '../utils/ticket';
import type { ServiceRequest } from '../../types/database.types';

export type DoneableRequest = Pick<ServiceRequest, 'id' | 'issue_type' | 'status' | 'technician_id' | 'reseller_id' | 'origin'> & {
  ticket_no?: number | string | null;
};

/** True for a job the reseller can mark as done: one that is under way (approved, assigned or in
 * progress), or a walk-in job of their own that was never started. An app request still waiting for
 * the customer's answer is not finished work; a finished or cancelled job has nothing left to mark.
 * The server checks the same - see mark_job_done (migration 0103). */
export function canMarkJobDone(request: Pick<ServiceRequest, 'status' | 'reseller_id' | 'origin'>): boolean {
  if (!request.reseller_id) return false;
  if (request.status === 'pending') return request.origin === 'reseller';
  return request.status === 'approved' || request.status === 'assigned' || request.status === 'in_progress';
}

/** "Mark as done" for a reseller, on any screen: for work that was finished but never completed in the
 * app because the technician does not use it. A job with nobody assigned in the app has nothing on
 * record for who did it, so it first asks for that name (mark_job_done refuses without one - migration
 * 0111); a job already assigned to an app technician just gets the usual "Are you sure?". Either way it
 * completes the job on the server - it moves to Completed, ready to bill. The chalan is not asked for;
 * it can be added on the completed job. `doingId` is the job being marked, to disable its button.
 * Render `{dialog}` once on the screen, next to wherever `confirmMarkDone` is called from. */
export function useMarkJobDone(): { confirmMarkDone: (request: DoneableRequest) => void; doingId: string | null; dialog: ReactNode } {
  const queryClient = useQueryClient();
  const [doingId, setDoingId] = useState<string | null>(null);
  const [pending, setPending] = useState<DoneableRequest | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = useCallback(
    async (request: DoneableRequest, technicianName: string | null) => {
      setDoingId(request.id);
      try {
        const { error } = await (supabase as any).rpc('mark_job_done', {
          p_request_id: request.id,
          p_technician_name: technicianName,
        });
        if (error) throw error;
        for (const key of ['service_requests', 'job_cards', 'customer_ledger_entries', 'reward_point_events', 'profiles']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        setPending(null);
      } catch (err) {
        showAlert('Could not mark the job as done', getErrorMessage(err));
      } finally {
        setDoingId(null);
        setSaving(false);
      }
    },
    [queryClient]
  );

  const confirmMarkDone = useCallback(
    (request: DoneableRequest) => {
      // Nobody's on record for this one in the app - get a name before it can complete.
      if (!request.technician_id) {
        setName('');
        setPending(request);
        return;
      }
      const heading = `${ticketLabel(request.ticket_no) ?? ''} ${request.issue_type}`.trim();
      showAlert(
        'Mark this job as done?',
        `${heading} moves to Completed, ready to bill. The technician will not be asked to complete it. The chalan number and photo can be added there afterwards.`,
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark as done', onPress: () => void finish(request, null) },
        ]
      );
    },
    [finish]
  );

  const submitName = () => {
    if (!pending || !name.trim() || saving) return;
    setSaving(true);
    void finish(pending, name.trim());
  };

  const dialog = pending ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setPending(null)}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={() => setPending(null)}>
        <Pressable onPress={() => {}} className="w-full max-w-sm rounded-xl bg-white p-4">
          <Text className="text-base font-bold text-gray-900">Who did this job?</Text>
          <Text className="mt-1 text-xs text-gray-500">
            {`${ticketLabel(pending.ticket_no) ?? ''} ${pending.issue_type}`.trim()} has nobody assigned in the app. Enter who
            did the work before it can be marked as done.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={submitName}
            autoFocus
            placeholder="Technician's name"
            placeholderTextColor="#9CA3AF"
            editable={!saving}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
          />
          <View className="mt-4 flex-row justify-end" style={{ gap: 10 }}>
            <Pressable
              onPress={() => setPending(null)}
              disabled={saving}
              className="h-10 items-center justify-center rounded-lg border border-gray-300 px-4 disabled:opacity-50"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submitName}
              disabled={!name.trim() || saving}
              className="h-10 items-center justify-center rounded-lg px-5 disabled:opacity-50"
              style={{ backgroundColor: '#0F766E' }}
            >
              <Text className="text-sm font-semibold text-white">{saving ? 'Marking done…' : 'Mark as done'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return { confirmMarkDone, doingId, dialog };
}
