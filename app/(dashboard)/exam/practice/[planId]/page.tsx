import { QuestionRunner } from "@/components/exam/QuestionRunner";

export default function PracticePage({ params }: { params: { planId: string } }) {
  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">תרגול</h1>
        <p className="text-zinc-400 text-sm">תכנית #{params.planId}</p>
      </header>
      <QuestionRunner planId={params.planId} />
    </main>
  );
}
