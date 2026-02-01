'use client';

import DashboardHeader from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, ArrowRight, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { useIsTeacher } from "@/hooks/useIsTeacher";
import { Badge } from "@/components/ui/badge";

type CustomTest = {
  id: string;
  title: string;
  config: {
    subjects: {
      subjectName: string;
      numQuestions: number;
      duration: number;
    }[];
  };
  createdAt: { toDate: () => Date };
}

type OfficialTest = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  examCategory: 'JEE Main' | 'JEE Advanced' | 'Both';
  config: {
    subjects: {
      subjectName: string;
      numQuestions: number;
      duration: number;
    }[];
  };
}

export default function MockTestsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  // Fetch custom tests for the current user
  const customTestsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.uid, 'custom_tests'), orderBy('createdAt', 'desc'));
  }, [firestore, user]);

  const { data: customTests, isLoading: areCustomTestsLoading } = useCollection<CustomTest>(customTestsQuery);
  
  // Fetch official tests
  const officialTestsQuery = useMemoFirebase(() => {
    if(!firestore) return null;
    return query(collection(firestore, 'mock_tests'), orderBy('startTime', 'desc'));
  }, [firestore]);

  const { data: officialTests, isLoading: areOfficialTestsLoading } = useCollection<OfficialTest>(officialTestsQuery);

  const totalQuestions = (test: CustomTest | OfficialTest) => test.config.subjects.reduce((sum, s) => sum + s.numQuestions, 0);
  const totalDuration = (test: CustomTest | OfficialTest) => test.config.subjects.reduce((sum, s) => sum + s.duration, 0);
  
  const isLoading = areCustomTestsLoading || isTeacherLoading || areOfficialTestsLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Mock Tests" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
            <h2 className="font-headline text-2xl font-semibold">Available Mock Tests</h2>
            <div className='flex gap-2'>
              {isTeacher && (
                 <Button asChild>
                    <Link href="/mock-tests/create-official"><PlusCircle className="mr-2"/>Create Official Test</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                  <Link href="/mock-tests/create"><PlusCircle className="mr-2"/>Create Custom Test</Link>
              </Button>
            </div>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">Official Tests</h3>
             {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-60 w-full" />
                    <Skeleton className="h-60 w-full" />
                    <Skeleton className="h-60 w-full" />
                 </div>
            ) : officialTests && officialTests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {officialTests.map(test => (
                    <Card key={test.id} className="flex flex-col">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <CardTitle>{test.title}</CardTitle>
                            <Badge variant="secondary">{test.examCategory}</Badge>
                        </div>
                        <CardDescription>Scheduled for: {format(test.startTime.toDate(), 'PPP p')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2"><FileText className="h-4 w-4"/><span>{totalQuestions(test)} Questions</span></div>
                            <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{totalDuration(test)} Minutes</span></div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                            Subjects: {test.config.subjects.map(s => s.subjectName).join(', ')}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button asChild className="w-full" disabled={test.startTime.toDate() > new Date()}>
                        <Link href={`/test/${test.id}`}>Start Test <ArrowRight className="ml-2"/></Link>
                        </Button>
                    </CardFooter>
                    </Card>
                ))}
                </div>
            ) : (
                <Card className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg bg-muted/50">
                    <h3 className="font-semibold">No official tests have been scheduled.</h3>
                    {isTeacher ? <p className="text-sm text-muted-foreground">Click "Create Official Test" to add one.</p> : <p className="text-sm text-muted-foreground">Please check back later.</p>}
                </Card>
            )}
          </div>

          <div>
            <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">My Custom Tests</h3>
            {areCustomTestsLoading ? (
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-60 w-full" />
                    <Skeleton className="h-60 w-full" />
                 </div>
            ) : customTests && customTests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {customTests.map(test => (
                        <Card key={test.id} className="flex flex-col">
                        <CardHeader>
                            <CardTitle>{test.title}</CardTitle>
                            <CardDescription>Created {formatDistanceToNow(test.createdAt.toDate(), { addSuffix: true })}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2"><FileText className="h-4 w-4"/><span>{totalQuestions(test)} Questions</span></div>
                                <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{totalDuration(test)} Minutes</span></div>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                                Subjects: {test.config.subjects.map(s => s.subjectName).join(', ')}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button asChild className="w-full">
                            <Link href={`/test/${test.id}?type=custom`}>Start Test <ArrowRight className="ml-2"/></Link>
                            </Button>
                        </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg bg-muted/50">
                    <h3 className="font-semibold">No custom tests found.</h3>
                    <p className="text-sm text-muted-foreground">Click the button above to create your first one!</p>
                </Card>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
