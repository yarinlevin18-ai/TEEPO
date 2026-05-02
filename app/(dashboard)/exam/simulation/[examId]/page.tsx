import { SimulationTimer } from "@/components/exam/SimulationTimer";

export default function SimulationPage({ params }: { params: { examId: string } }) {
  return (
    <main dir="rtl" className="min-h-screen bg-zinc-950 text-zinc-50 p-6 lg:p-10">
      {/* Spec §3.4.2: minimal chrome — no mascot, no nav, no notifications */}
      <SimulationTimer examId={params.examId} />
    </main>
  );
}
