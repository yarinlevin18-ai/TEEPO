import { TodayCard } from "@/components/exam/TodayCard";

export default function PlanPage({ params }: { params: { examId: string } }) {
  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">תכנית חזרה</h1>
          <p className="text-zinc-400 text-sm mt-1">מבחן #{params.examId}</p>
        </div>
        <div className="text-left">
          <div className="text-xs text-zinc-400">ימים נותרים</div>
          <div className="text-3xl font-bold tabular-nums">—</div>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-white/10">
        <button className="px-4 py-2 border-b-2 border-fuchsia-400 font-medium">היום</button>
        <button className="px-4 py-2 text-zinc-400">תצוגת מקרו</button>
      </nav>

      <TodayCard />
    </main>
  );
}
