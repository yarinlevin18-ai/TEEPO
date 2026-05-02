import { Timeline } from "@/components/exam/Timeline";
import { TodayCard } from "@/components/exam/TodayCard";
import type { Exam } from "@/types";

export const metadata = { title: "TEEPO Exam — דשבורד" };

// Sample exams used during the local-build phase. Replaced by Drive DB
// reads once db-context exposes exam mutators.
const SAMPLE_EXAMS: Exam[] = [
  {
    id: "sample-algorithms",
    course_id: "cs101",
    title: "אלגוריתמים — אמצע סמסטר",
    date: addDays(14),
    type: "midterm",
    source: "manual",
  },
  {
    id: "sample-sociology",
    course_id: "soc201",
    title: "מבוא לסוציולוגיה — סוף",
    date: addDays(28),
    type: "final",
    source: "manual",
  },
];

function addDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function ExamDashboard() {
  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-8">
      <header>
        <h1 className="text-3xl font-bold bg-gradient-to-l from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
          תקופת מבחנים
        </h1>
        <p className="text-zinc-400 text-sm mt-1">המסכים שלך, התכנית שלך, היום שלך.</p>
      </header>

      <section aria-label="ציר זמן מבחנים">
        <Timeline exams={SAMPLE_EXAMS} />
      </section>

      <section aria-label="היום שלי" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TodayCard />
        </div>
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold mb-3">קבוצות פעילות</h3>
          <p className="text-sm text-zinc-400">— אין קבוצות פעילות —</p>
        </aside>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "ימי הכנה השבוע", value: "0" },
          { label: "ממוצע סימולציות", value: "—" },
          { label: "נושאים חזקים", value: "0" },
          { label: "נושאים חלשים", value: "0" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">{s.label}</div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
