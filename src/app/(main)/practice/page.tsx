import DashboardHeader from "@/components/dashboard-header";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function PracticePage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Practice Questions" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
            <ClipboardList className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="font-headline text-3xl font-semibold">Practice Questions Coming Soon</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Our extensive bank of practice questions with detailed solutions is under preparation.
          </p>
        </Card>
      </main>
    </div>
  );
}
