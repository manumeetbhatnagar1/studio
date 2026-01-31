import DashboardHeader from "@/components/dashboard-header";
import { Card } from "@/components/ui/card";
import { Target } from "lucide-react";

export default function MockTestsPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Mock Tests" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
            <Target className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="font-headline text-3xl font-semibold">Mock Tests Coming Soon</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Get ready to simulate the real IIT JEE exam environment. Our mock test series will be launching soon.
          </p>
        </Card>
      </main>
    </div>
  );
}
