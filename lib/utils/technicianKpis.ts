// lib/utils/technicianKpis.ts
// The numbers behind the technician dashboard's KPI row and its "time to finish by category",
// "customer reviews" and "needs attention" cards - kept free of screen code, same spirit as
// dashboardStats.ts (which still owns the Jobs-completed/Earnings tiles and the date-range math).
import { categoryOf } from '../constants/categoryIcons';
import { isPositiveReviewTag } from '../constants/reviewTags';
import { isoOfLocalDate, type DateRange } from './dashboardStats';
import type { JobCard, Review, ServiceRequest } from '../../types/database.types';

export type JobCardWithRequest = JobCard & {
  service_requests: Pick<ServiceRequest, 'quoted_price' | 'issue_type' | 'status' | 'repeat_of_request_id' | 'ticket_no' | 'customer_name'> | null;
};

export interface CategoryTimeStat {
  category: string;
  jobs: number;
  avgMinutes: number;
  earn: number;
  targetMinutes: number | null;
  status: 'within' | 'over' | 'no_target';
}

export interface ReviewStats {
  count: number;
  average: number | null;
  /** index 0 = how many 1-star reviews ... index 4 = how many 5-star. */
  starCounts: [number, number, number, number, number];
  tagCounts: { tag: string; count: number; positive: boolean }[];
}

export interface AttentionItem {
  title: string;
  detail: string;
  tone: 'warning' | 'danger';
}

export interface TechnicianKpis {
  categories: CategoryTimeStat[];
  avgMinutesOverall: number | null;
  /** Share of completed jobs with a target that finished within it, 0-100 - null when none of this
   * period's jobs have a category target set yet. */
  onTimeRate: number | null;
  repeatVisits: number;
  jobsWithTime: number;
  reviews: ReviewStats;
  needsAttention: AttentionItem[];
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

function inRange(dateIso: string, range: DateRange): boolean {
  return dateIso >= range.start && dateIso <= range.end;
}

/** Every finished job in range, by category: how long it actually took against that category's
 * target (set in Team > Targets), and whether it ran within or over. A category with no target set
 * still shows its average time, just with nothing to compare it against. */
function categoryStats(jobCards: JobCardWithRequest[], range: DateRange, targets: Map<string, number>): CategoryTimeStat[] {
  const byCategory = new Map<string, { minutes: number[]; earn: number }>();
  for (const c of jobCards) {
    if (!c.completed_at || !c.started_at) continue;
    if (!inRange(isoOfLocalDate(new Date(c.completed_at)), range)) continue;
    const category = categoryOf(c.service_requests?.issue_type);
    const entry = byCategory.get(category) ?? { minutes: [], earn: 0 };
    entry.minutes.push(minutesBetween(c.started_at, c.completed_at));
    entry.earn += Number(c.labor_cost) + Number(c.parts_cost);
    byCategory.set(category, entry);
  }
  return [...byCategory.entries()]
    .map(([category, { minutes, earn }]) => {
      const avgMinutes = minutes.reduce((s, m) => s + m, 0) / minutes.length;
      const targetMinutes = targets.get(category) ?? null;
      const status: CategoryTimeStat['status'] = targetMinutes == null ? 'no_target' : avgMinutes <= targetMinutes ? 'within' : 'over';
      return { category, jobs: minutes.length, avgMinutes, earn, targetMinutes, status };
    })
    .sort((a, b) => b.jobs - a.jobs);
}

/** All-time reputation, not scoped to the selected date range - reviews build up slowly, so "this
 * week's reviews" would almost always read empty. A technician's star rating is who they are, not a
 * figure for one week. */
function reviewStats(reviews: Review[]): ReviewStats {
  const starCounts: ReviewStats['starCounts'] = [0, 0, 0, 0, 0];
  const tagTally = new Map<string, number>();
  let sum = 0;
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating)));
    starCounts[star - 1] += 1;
    sum += r.rating;
    for (const tag of r.tags ?? []) tagTally.set(tag, (tagTally.get(tag) ?? 0) + 1);
  }
  const tagCounts = [...tagTally.entries()]
    .map(([tag, count]) => ({ tag, count, positive: isPositiveReviewTag(tag) }))
    .sort((a, b) => b.count - a.count);
  return { count: reviews.length, average: reviews.length ? sum / reviews.length : null, starCounts, tagCounts };
}

export function computeTechnicianKpis({
  jobCards,
  range,
  targets,
  reviews,
  monthWorked,
  monthIdle,
  onHold,
}: {
  jobCards: JobCardWithRequest[];
  range: DateRange;
  targets: Map<string, number>;
  reviews: Review[];
  /** This calendar month's totals (not the selected range) - same figures the Work hours card shows,
   * passed in rather than recomputed here (see lib/components/requests/WorkHubPanel.tsx). */
  monthWorked: number;
  monthIdle: number;
  /** The job currently on hold, if any, with how long it's been going - for the "on hold past its
   * target" attention line. */
  onHold: { issueType: string; elapsedMinutes: number } | null;
}): TechnicianKpis {
  const inRangeCards = jobCards.filter((c) => c.completed_at && inRange(isoOfLocalDate(new Date(c.completed_at)), range));
  const categories = categoryStats(jobCards, range, targets);

  const allMinutes = categories.flatMap((c) => Array(c.jobs).fill(c.avgMinutes));
  const avgMinutesOverall = allMinutes.length ? allMinutes.reduce((s, m) => s + m, 0) / allMinutes.length : null;

  const withTarget = categories.filter((c) => c.status !== 'no_target');
  const onTimeRate = withTarget.length
    ? (withTarget.filter((c) => c.status === 'within').reduce((s, c) => s + c.jobs, 0) / withTarget.reduce((s, c) => s + c.jobs, 0)) * 100
    : null;

  const repeatVisits = inRangeCards.filter((c) => !!c.service_requests?.repeat_of_request_id).length;

  const needsAttention: AttentionItem[] = [];
  if (onHold) {
    const target = targets.get(categoryOf(onHold.issueType)) ?? null;
    if (target != null && onHold.elapsedMinutes > target) {
      needsAttention.push({
        title: `${onHold.issueType} is on hold`,
        detail: `${Math.round(onHold.elapsedMinutes / 60)}h elapsed against a ${Math.round(target / 60)}h target`,
        tone: 'warning',
      });
    }
  }
  const overTarget = categories.filter((c) => c.status === 'over');
  for (const c of overTarget) {
    needsAttention.push({
      title: `${c.category} jobs run above target`,
      detail: `Avg ${Math.round(c.avgMinutes)}m vs ${c.targetMinutes}m target across ${c.jobs} ${c.jobs === 1 ? 'job' : 'jobs'}`,
      tone: 'warning',
    });
  }
  if (monthWorked + monthIdle > 0 && monthIdle > monthWorked) {
    needsAttention.push({
      title: 'High idle time this month',
      detail: `Idle ${Math.round(monthIdle / 60)}h vs ${Math.round(monthWorked / 60)}h worked`,
      tone: 'danger',
    });
  }

  return {
    categories,
    avgMinutesOverall,
    onTimeRate,
    repeatVisits,
    jobsWithTime: inRangeCards.length,
    reviews: reviewStats(reviews),
    needsAttention,
  };
}
