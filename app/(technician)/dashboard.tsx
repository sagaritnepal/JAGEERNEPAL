// app/(technician)/dashboard.tsx
import { useMemo } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../lib/hooks/useAuth';
import { useSupabaseQuery } from '../../lib/hooks/useSupabase';
import { useMyEmployment } from '../../lib/hooks/useTechnicianEmployment';
import { useCategoryTargets } from '../../lib/hooks/useCategoryTargets';
import { categoryOf } from '../../lib/constants/categoryIcons';
import { useTick } from '../../lib/components/TeamActivity';
import { TechnicianDashboardView } from '../../lib/components/technician/TechnicianDashboardView';
import { WorkingNowCard } from '../../lib/components/technician/WorkingNowCard';
import { MyDayTimeline } from '../../lib/components/technician/MyDayTimeline';
import { useJobTimes, minutesOf, monthWorkTotals } from '../../lib/components/requests/WorkHubPanel';
import { isoOfLocalDate, type Completion } from '../../lib/utils/dashboardStats';
import type { JobCardWithRequest } from '../../lib/utils/technicianKpis';
import { jobCardAmount } from './earnings';

/** The technician's Home tab: what they have finished and earned, by
 * category, over a date range they choose, plus the KPI cards (time to
 * finish vs each category's target, customer reviews, needs attention).
 * Offers to answer and open team work live on the Inbox screen (header
 * button). */
export default function TechnicianDashboard() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const profile = useAuthStore((state) => state.profile);
  const { current: employment } = useMyEmployment(userId);
  const resellerId = employment?.reseller_id;
  const now = useTick(30_000);

  // Same query as the Earnings screen, so both share one cached request - extended with the fields
  // the KPI cards need (status/hold for "on hold past target", repeat_of_request_id for repeat
  // visits) that Earnings itself has no use for.
  const { data: jobCards, isLoading } = useSupabaseQuery('job_cards', {
    filters: userId ? { technician_id: userId } : {},
    orderBy: { column: 'created_at', ascending: false },
    columns: '*, service_requests(quoted_price, issue_type, status, hold_status, repeat_of_request_id, ticket_no, customer_name)',
    enabled: !!userId,
  }) as { data: (JobCardWithRequest & { service_requests: (JobCardWithRequest['service_requests'] & { hold_status?: string }) | null })[] | undefined; isLoading: boolean };

  const { data: reviews } = useSupabaseQuery('reviews', {
    filters: userId ? { technician_id: userId } : {},
    enabled: !!userId,
  });

  // For the month idle/worked total the "needs attention" card reads (see monthWorkTotals) - the
  // same data MyDayTimeline fetches for its own calendar, sharing its cache since the query is
  // identical.
  const { data: myRequests } = useSupabaseQuery('service_requests', {
    filters: userId ? { technician_id: userId } : {},
    enabled: !!userId,
  });
  const requestIds = useMemo(() => (myRequests ?? []).map((r) => r.id).sort(), [myRequests]);
  const jobTimes = useJobTimes(requestIds);

  const targets = useCategoryTargets(resellerId);

  const completions = useMemo<Completion[]>(
    () =>
      (jobCards ?? [])
        .filter((c) => !!c.completed_at)
        .map((c) => ({
          id: c.id,
          date: isoOfLocalDate(new Date(c.completed_at as string)),
          category: categoryOf(c.service_requests?.issue_type),
          amount: jobCardAmount(c),
        })),
    [jobCards]
  );

  const kpis = useMemo(() => {
    const dutyFrom = minutesOf(employment?.work_start_time, 9 * 60);
    const dutyTo = minutesOf(employment?.work_end_time, 17 * 60);
    const { worked, idle } = userId ? monthWorkTotals(myRequests ?? [], jobTimes, userId, dutyFrom, dutyTo, now) : { worked: 0, idle: 0 };
    const onHoldCard = (jobCards ?? []).find(
      (c) => c.service_requests?.status === 'in_progress' && c.service_requests?.hold_status === 'on_hold' && !!c.started_at && !c.completed_at
    );
    return {
      jobCards: jobCards ?? [],
      targets,
      reviews: reviews ?? [],
      monthWorked: worked,
      monthIdle: idle,
      onHold: onHoldCard
        ? { issueType: onHoldCard.service_requests?.issue_type ?? 'Job', elapsedMinutes: (now - new Date(onHoldCard.started_at as string).getTime()) / 60_000 }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCards, myRequests, jobTimes, targets, reviews, employment, userId, now]);

  return (
    <TechnicianDashboardView
      completions={completions}
      loading={!!userId && (isLoading || jobCards === undefined)}
      technicianName={profile?.full_name}
      kpiInputs={kpis}
      onOpenCompleted={() =>
        // `t` changes every time so the Jobs tab reacts even if it is already on Completed.
        router.push({ pathname: '/(technician)/jobs', params: { tab: 'completed', t: String(Date.now()) } })
      }
      onOpenEarnings={() => router.push('/(technician)/earnings')}
      // What they are working on right now leads the page - everything else is a report, this is live.
      workingNow={userId ? <WorkingNowCard technicianId={userId} /> : null}
      // Its own labelled section further down - a month's pattern, not something to check every glance.
      monthlyHours={userId ? <MyDayTimeline technicianId={userId} /> : null}
    />
  );
}
