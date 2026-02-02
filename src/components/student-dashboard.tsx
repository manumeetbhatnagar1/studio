'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, where, limit, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, PlayCircle, CalendarClock, Video, ClipboardCheck, MessageSquare, ClipboardList } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';


// Types
type UserProfile = {
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
};

type LiveClass = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  recordingUrl?: string;
  teacherName: string;
};

type Doubt = {
    studentId: string;
}

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

// 2. Progress Overview Component
function ProgressOverview() {
    const { user } = useUser();
    const firestore = useFirestore();

    // Live Classes Attended
    const liveClassesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'live_classes'), where('startTime', '<', new Date()));
    }, [firestore]);
    const { data: pastLiveClasses, isLoading: areLiveClassesLoading } = useCollection<LiveClass>(liveClassesQuery);

    // Mock Tests Completed
    const testsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'test_results'));
    }, [user, firestore]);
    const { data: testResults, isLoading: areTestsLoading } = useCollection(testsQuery);

    // Doubts Asked
    const doubtsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'doubts'), where('studentId', '==', user.uid));
    }, [user, firestore]);
    const { data: doubts, isLoading: areDoubtsLoading } = useCollection<Doubt>(doubtsQuery);
    
    // Practice Questions Completed
    const practiceResultsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'practice_results'));
    }, [user, firestore]);
    const { data: practiceResults, isLoading: arePracticeResultsLoading } = useCollection<{totalQuestions: number}>(practiceResultsQuery);

    const practiceQuestionsCompleted = useMemo(() => {
        if (!practiceResults) return 0;
        return practiceResults.reduce((sum, result) => sum + (result.totalQuestions || 0), 0);
    }, [practiceResults]);

    const isLoading = areLiveClassesLoading || areTestsLoading || areDoubtsLoading || arePracticeResultsLoading;
    
    const overviewItems = [
        {
            title: "Live Classes Attended",
            value: pastLiveClasses?.length || 0,
            icon: Video,
            href: "/live-classes"
        },
        {
            title: "Mock Tests Completed",
            value: testResults?.length || 0,
            icon: ClipboardCheck,
            href: "/mock-tests"
        },
        {
            title: "Practice Questions",
            value: practiceQuestionsCompleted,
            icon: ClipboardList,
            href: "/practice"
        },
        {
            title: "Doubts Asked",
            value: doubts?.length || 0,
            icon: MessageSquare,
            href: "/doubts"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {overviewItems.map(item => (
                <Link href={item.href} key={item.title} className="group">
                    <Card className="h-full transition-all duration-200 hover:border-primary hover:shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                            <item.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{item.value}</div>}
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}


// 3. Class Activity Chart
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

// 4. Upcoming Classes
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

// 5. Recent Recordings
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

// Main Student Dashboard Component
export default function StudentDashboard() {
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

  return (
    <div className="space-y-6">
        <FeePaymentReminder />
        <ProgressOverview />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ClassActivityChart classes={pastClasses} isLoading={isLoading} />
            <UpcomingClasses classes={upcomingClasses} isLoading={isLoading} />
        </div>
        <RecentRecordings classes={pastClasses} isLoading={isLoading} />
    </div>
  );
}
