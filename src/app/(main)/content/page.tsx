import DashboardHeader from "@/components/dashboard-header";
import { userData } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function ContentPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Content" user={userData} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
            <BookOpen className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="font-headline text-3xl font-semibold">Content Coming Soon</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            We are busy curating the best video lectures and study materials for you. Please check back later!
          </p>
        </Card>
      </main>
    </div>
  );
}
