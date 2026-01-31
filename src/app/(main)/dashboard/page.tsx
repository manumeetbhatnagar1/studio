import DashboardHeader from "@/components/dashboard-header";
import PersonalizedLearning from "@/components/personalized-learning";
import QuickLinks from "@/components/quick-links";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-8">
          <PersonalizedLearning />
          <QuickLinks />
        </div>
      </main>
    </div>
  );
}
