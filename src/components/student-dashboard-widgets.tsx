'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CreditCard, PlayCircle, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// TYPES
type LiveClass = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  recordingUrl?: string;
  teacherName: string;
};

type UserProfile = {
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
};

// COMPONENTS

// 1. Fee Payment Reminder
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


// 2. Class Activity Chart
function ClassActivityChart({ classes, isLoading }: { classes: LiveClass[], isLoading: boolean }) {
    const chartData = useMemo(() => {
        if (!classes) return [];
        const now = new Date();
        const start = startOfWeek(now, { weekStartsOn: 1 });
        const end = endOfWeek(now, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start, end });

        const classesByDay: { [key: string]: number } = {};
        classes
            .filter(c => c.startTime.toDate() < now) // only completed classes
            .forEach(c => {
                const day = format(c.startTime.toDate(), 'yyyy-MM-dd');
                classesByDay[day] = (classesByDay[day] || 0) + 1;
            });
        
        return days.map(day => ({
            date: format(day, 'MMM d'),
            day: format(day, 'EEE'),
            completed: classesByDay[format(day, 'yyyy-MM-dd')] || 0,
        }));

    }, [classes]);

    const chartConfig = {
        completed: {
          label: 'Classes Completed',
          color: 'hsl(var(--primary))',
        },
    } satisfies ChartConfig;

    if (isLoading) {
        return <Skeleton className="h-64 w-full" />;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>This Week's Activity</CardTitle>
                <CardDescription>Number of classes you have completed this week.</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                    <BarChart accessibilityLayer data={chartData}>
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tickFormatter={(value) => value.slice(0, 3)}
                        />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="completed" fill="var(--color-completed)" radius={4} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}

// 3. Upcoming Classes
function UpcomingClasses({ classes, isLoading }: { classes: LiveClass[], isLoading: boolean }) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Upcoming Classes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }
    
    if (classes.length === 0) {
        return (
            <Card>
                <CardHeader><CardTitle>Upcoming Classes</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground">No upcoming classes scheduled.</p></CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader><CardTitle>Upcoming Classes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {classes.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                        <div>
                            <p className="font-semibold">{c.title}</p>
                            <p className="text-sm text-muted-foreground">{format(c.startTime.toDate(), "EEE, MMM d 'at' h:mm a")}</p>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/live-classes"><CalendarClock className="h-4 w-4" /></Link>
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// 4. Recent Recordings
function RecentRecordings({ classes, isLoading }: { classes: LiveClass[], isLoading: boolean }) {
    const recordings = useMemo(() => {
        return classes.filter(c => c.recordingUrl).slice(0, 5);
    }, [classes]);

     if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Recordings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }
    
    if (recordings.length === 0) {
        return (
            <Card>
                <CardHeader><CardTitle>Recent Recordings</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground">No recordings available yet.</p></CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader><CardTitle>Recent Recordings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {recordings.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                        <div>
                            <p className="font-semibold">{c.title}</p>
                            <p className="text-sm text-muted-foreground">{format(c.startTime.toDate(), "MMM d, yyyy")} &middot; by {c.teacherName}</p>
                        </div>
                        {c.recordingUrl && (
                            <Button asChild variant="ghost" size="sm">
                                <Link href={c.recordingUrl} target="_blank"><PlayCircle className="h-4 w-4" /></Link>
                            </Button>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

// Main Dashboard Widget component
export default function StudentDashboardWidgets() {
    const firestore = useFirestore();

    const liveClassesQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'live_classes'), orderBy('startTime', 'desc')) : null,
        [firestore]
    );
    const { data: liveClasses, isLoading } = useCollection<LiveClass>(liveClassesQuery);

    const { upcomingClasses, pastClasses } = useMemo(() => {
        if (!liveClasses) return { upcomingClasses: [], pastClasses: [] };
        const now = new Date();
        const upcoming = liveClasses.filter(c => c.startTime.toDate() >= now).reverse().slice(0, 3);
        const past = liveClasses.filter(c => c.startTime.toDate() < now);
        return { upcomingClasses: upcoming, pastClasses: past };
    }, [liveClasses]);

    const totalCompleted = pastClasses.length;
    const totalRemaining = liveClasses ? liveClasses.length - totalCompleted : 0;

    return (
        <div className="space-y-6">
            <FeePaymentReminder />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Classes Completed</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : totalCompleted}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Classes Remaining</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : totalRemaining}</div></CardContent>
                </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ClassActivityChart classes={pastClasses} isLoading={isLoading} />
                <UpcomingClasses classes={upcomingClasses} isLoading={isLoading} />
            </div>

            <RecentRecordings classes={pastClasses} isLoading={isLoading} />
        </div>
    );
}
