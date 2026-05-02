import type { StudyPlan, StudyPlanDay, Topic, PlannedActivity } from "@/types";

const RATING_TO_WEIGHT: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
};

export function priorityWeight(rating: Topic["self_rating"]): number {
  return RATING_TO_WEIGHT[rating];
}

// Days between two YYYY-MM-DD dates (inclusive of start, exclusive of end).
export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Filter to dates within [start, examDate) that fall on available_days.
export function planningDates(
  start: string,
  examDate: string,
  available_days: number[],
): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const end = new Date(examDate + "T00:00:00Z");
  while (cur < end) {
    if (available_days.includes(cur.getUTCDay())) {
      out.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Allocate per-topic minute budgets across available days based on weights.
// Last 7 days are reserved for review + 2 simulations (per spec §A.2).
export function allocate(
  topics: Topic[],
  dates: string[],
  dailyMinutes: number,
): Map<string, number> {
  const totalWeight = topics.reduce((s, t) => s + priorityWeight(t.self_rating), 0);
  if (totalWeight === 0) return new Map();
  const teachingDates = dates.slice(0, Math.max(0, dates.length - 7));
  const totalMinutes = teachingDates.length * dailyMinutes;
  const out = new Map<string, number>();
  for (const t of topics) {
    out.set(t.id, Math.round((priorityWeight(t.self_rating) / totalWeight) * totalMinutes));
  }
  return out;
}

// Stub — Claude builds the actual day-by-day breakdown server-side.
// This local builder exists for offline previews and tests.
export function previewDays(
  plan: Pick<StudyPlan, "id" | "topics" | "daily_minutes" | "available_days" | "exam_date">,
  startDate: string,
): StudyPlanDay[] {
  const dates = planningDates(startDate, plan.exam_date, plan.available_days);
  const budget = allocate(plan.topics, dates, plan.daily_minutes);
  const reviewStart = dates.length - 7;

  return dates.map((date, idx) => {
    const isReview = idx >= reviewStart;
    const activities: PlannedActivity[] = isReview
      ? [{ type: "review", topic_id: "all", minutes: plan.daily_minutes, instruction: "סבב חזרה כללי", done: false }]
      : pickDailyActivities(plan.topics, budget, plan.daily_minutes);
    return {
      id: `${plan.id}_${date}`,
      plan_id: plan.id,
      date,
      planned_topics: activities.map((a) => a.topic_id),
      planned_activities: activities,
      status: "upcoming",
    };
  });
}

function pickDailyActivities(
  topics: Topic[],
  budget: Map<string, number>,
  daily: number,
): PlannedActivity[] {
  // Pick the highest-remaining-budget topic for this day.
  const sorted = [...topics].sort((a, b) => (budget.get(b.id) ?? 0) - (budget.get(a.id) ?? 0));
  const top = sorted[0];
  if (!top || (budget.get(top.id) ?? 0) <= 0) return [];
  const minutes = Math.min(daily, budget.get(top.id) ?? 0);
  budget.set(top.id, (budget.get(top.id) ?? 0) - minutes);
  return [
    { type: "read", topic_id: top.id, minutes: Math.round(minutes * 0.4), instruction: `קריאת חומר: ${top.title}`, done: false },
    { type: "practice", topic_id: top.id, minutes: Math.round(minutes * 0.4), instruction: "תרגול אמריקאיות", done: false },
    { type: "flashcards", topic_id: top.id, minutes: Math.round(minutes * 0.2), instruction: "כרטיסיות זיכרון", done: false },
  ];
}
