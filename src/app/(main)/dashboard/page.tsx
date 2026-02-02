'use client';

import DashboardHeader from "@/components/dashboard-header";
import QuickLinks from "@/components/quick-links";
import { useIsTeacher } from "@/hooks/useIsTeacher";
import { Skeleton } from "@/components/ui/skeleton";
import StudentDashboard from "@/components/student-dashboard";
import TeacherDashboardWidgets from "@/components/teacher-dashboard-widgets";

function RoleBasedDashboard() {
  const { isTeacher, isLoading } = useIsTeacher();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return isTeacher ? <TeacherDashboardWidgets /> : <StudentDashboard />;
}


export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-8">
          <RoleBasedDashboard />
          <QuickLinks />
        </div>
      </main>
    </div>
  );
}
