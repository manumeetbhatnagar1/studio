import DashboardHeader from "@/components/dashboard-header";
import { Card } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function SubscriptionPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Subscription & Billing" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
            <CreditCard className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="font-headline text-3xl font-semibold">Subscription Plans Coming Soon</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            We are working hard to bring you flexible subscription options. Manage your billing and access premium features right here.
          </p>
        </Card>
      </main>
    </div>
  );
}

    