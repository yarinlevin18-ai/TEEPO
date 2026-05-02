import { GroupChat } from "@/components/exam/GroupChat";

export default function GroupsPage() {
  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">קבוצות מבחן</h1>
        <button className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-medium">
          + קבוצה חדשה
        </button>
      </header>
      <GroupChat groupId={null} />
    </main>
  );
}
