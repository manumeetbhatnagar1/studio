'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, limit, getDoc, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle, ClipboardCheck, MessageSquare, Video, ClipboardList } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Types
type UserProfile = {
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
  subscriptionPlanId?: string;
}

type SubscriptionPlan = {
  name: string;
}

type TestResult = {
    id: string;
    testId: string;
    score: number;
    submittedAt: { toDate: () => Date };
};

type LiveClass = {
  startTime: { toDate: () => Date };
};

type Doubt = {
    studentId: string;
}

type MockTest = {
    title: string;
};

// 1. Subscription Status Component
function SubscriptionStatus() {
    const { user } = useUser();
    const firestore = useFirestore();

    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [user, firestore]);

    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

    const planDocRef = useMemoFirebase(() => {
        if (!userProfile?.subscriptionPlanId || !firestore) return null;
        return doc(firestore, 'subscription_plans', userProfile.subscriptionPlanId);
    }, [userProfile, firestore]);

    const { data: plan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);
    
    const isLoading = isProfileLoading || isPlanLoading;

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-1/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-1/3" />
                </CardContent>
            </Card>
        )
    }
    
    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'active':
            case 'trialing':
                return <Badge variant="default"><CheckCircle className="mr-2" />Active</Badge>;
            case 'past_due':
                return <Badge variant="destructive">Past Due</Badge>;
            case 'canceled':
                 return <Badge variant="secondary">Canceled</Badge>;
            default:
                return <Badge variant="outline">No Subscription</Badge>;
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>Subscription Status</span>
                    {getStatusBadge(userProfile?.subscriptionStatus)}
                </CardTitle>
                <CardDescription>{plan ? plan.name : 'You are not subscribed to any plan.'}</CardDescription>
            </CardHeader>
            <CardContent>
                 <Button asChild>
                    <Link href="/subscription">
                        {userProfile?.subscriptionStatus === 'active' || userProfile?.subscriptionStatus === 'trialing' ? 'Manage Subscription' : 'View Plans'}
                        <ArrowRight className="ml-2" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Live Classes Attended</CardTitle>
                    <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{pastLiveClasses?.length || 0}</div>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Mock Tests Completed</CardTitle>
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{testResults?.length || 0}</div>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Practice Questions</CardTitle>
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{practiceQuestionsCompleted}</div>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Doubts Asked</CardTitle>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{doubts?.length || 0}</div>}
                </CardContent>
            </Card>
        </div>
    );
}

// 3. Recent Activity Component
function RecentActivity() {
    const { user } = useUser();
    const firestore = useFirestore();

    const resultsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'test_results'), orderBy('submittedAt', 'desc'), limit(3));
    }, [user, firestore]);

    const { data: results, isLoading: areResultsLoading } = useCollection<TestResult>(resultsQuery);
    
    const [testTitles, setTestTitles] = useState<Record<string, string>>({});
    const [areTitlesLoading, setAreTitlesLoading] = useState(true);

    useEffect(() => {
        if (!results || !firestore || !user) {
            if(!results) setAreTitlesLoading(false);
            return;
        }
        
        const fetchTitles = async () => {
            const newTitles: Record<string, string> = {};
            const testIds = results.map(r => r.testId).filter(id => !testTitles[id]);

            if (testIds.length === 0) {
                setAreTitlesLoading(false);
                return;
            };

            setAreTitlesLoading(true);
            for (const testId of testIds) {
                const testDocRef = doc(firestore, 'mock_tests', testId);
                const testDocSnap = await getDoc(testDocRef);
                if (testDocSnap.exists()) {
                    newTitles[testId] = (testDocSnap.data() as MockTest).title;
                } else {
                     const customTestDocRef = doc(firestore, `users/${user.uid}/custom_tests`, testId);
                     const customTestDocSnap = await getDoc(customTestDocRef);
                     if (customTestDocSnap.exists()) {
                         newTitles[testId] = (customTestDocSnap.data() as any).title;
                     }
                }
            }
            setTestTitles(prev => ({...prev, ...newTitles}));
            setAreTitlesLoading(false);
        }
        fetchTitles();

    }, [results, firestore, testTitles, user]);
    
    const isLoading = areResultsLoading || areTitlesLoading;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Test Results</CardTitle>
                <CardDescription>Your performance in the last few tests you've taken.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : results && results.length > 0 ? (
                    <div className="space-y-4">
                        {results.map(result => (
                            <div key={result.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                <div>
                                    <p className="font-semibold">{testTitles[result.testId] || 'Test'}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Submitted {formatDistanceToNow(result.submittedAt.toDate(), { addSuffix: true })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-primary">{result.score}</p>
                                    <p className="text-xs text-muted-foreground">Score</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-4">
                        <p>No test results yet.</p>
                        <p className="text-sm">Complete a mock test to see your progress.</p>
                    </div>
                )}
                 <Button asChild variant="outline" className="w-full mt-4">
                    <Link href="/mock-tests">
                       View All Tests <ArrowRight className="ml-2" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

// Main Student Dashboard Component
export default function StudentDashboard() {
  return (
    <div className="space-y-6">
        <ProgressOverview />
        <div className="grid md:grid-cols-2 gap-6">
          <SubscriptionStatus />
          <RecentActivity />
        </div>
    </div>
  );
}
