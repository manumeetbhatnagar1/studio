import DashboardHeader from "@/components/dashboard-header";
import { userData } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Video } from "lucide-react";

export default function LiveClassesPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Live Classes" user={userData} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
            <Video className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="font-headline text-3xl font-semibold">Live Classes Coming Soon</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Our live class schedule will be available here soon. Get ready for interactive learning with top instructors!
          </p>
        </Card>
      </main>
    </div>
  );
}
