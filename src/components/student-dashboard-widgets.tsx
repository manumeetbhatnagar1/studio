'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Video, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

type LiveClass = {
  startTime: { toDate: () => Date };
};

type UserProfile = {
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
};

function LiveClassStats() {
    const firestore = useFirestore();

    const liveClassesQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'live_classes')) : null,
        [firestore]
    );
    const { data: liveClasses, isLoading } = useCollection<LiveClass>(liveClassesQuery);

    const completedClasses = useMemo(() => {
        if (!liveClasses) return 0;
        const now = new Date();
        return liveClasses.filter(c => c.startTime.toDate() < now).length;
    }, [liveClasses]);
    
    if (isLoading) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Live Classes Attended</CardTitle>
                    <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-32 mt-1" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Live Classes Attended</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{completedClasses}</div>
                <p className="text-xs text-muted-foreground">Total classes from the schedule</p>
            </CardContent>
        </Card>
    );
}

function FeePaymentReminder() {
    const { user } = useUser();
    const firestore = useFirestore();

    const userDocRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'users', user.uid);
    }, [user, firestore]);

    const { data: userProfile, isLoading } = useDoc<UserProfile>(userDocRef);

    if (isLoading) {
        return <Skeleton className="h-24 w-full" />;
    }

    if (userProfile?.subscriptionStatus === 'past_due') {
        return (
            <Card className="bg-destructive/10 border-destructive">
                 <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                    <div>
                        <CardTitle className="text-destructive">Payment Due</CardTitle>
                        <CardDescription className="text-destructive/80">
                            Your subscription payment is past due. Please update your payment method to restore access.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <Button asChild variant="destructive">
                        <Link href="/subscription">
                            <CreditCard className="mr-2" /> Pay Now
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return null;
}

export default function StudentDashboardWidgets() {
    return (
        <div className="space-y-4">
            <FeePaymentReminder />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <LiveClassStats />
                {/* Other stats can go here */}
            </div>
        </div>
    );
}
