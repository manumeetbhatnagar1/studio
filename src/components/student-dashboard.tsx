'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, limit, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle } from 'lucide-react';
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
    testId: string; // This would need to be joined with a test title
    score: number;
    submittedAt: { toDate: () => Date };
};

type MockTest = {
    title: string;
};


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

function CourseProgress() {
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

    if (isLoading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Course Progress</CardTitle>
                <CardDescription>Your most recent test results.</CardDescription>
            </CardHeader>
            <CardContent>
                {results && results.length > 0 ? (
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

export default function StudentDashboard() {
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <SubscriptionStatus />
      <CourseProgress />
    </div>
  );
}
