
'use client';

import DashboardHeader from "@/components/dashboard-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, ArrowRight, PlusCircle, Lock, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, where, doc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { useIsTeacher } from "@/hooks/useIsTeacher";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useIsSubscribed } from "@/hooks/useIsSubscribed";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type CustomTest = {
  id: string;
  title: string;
  accessLevel: 'free' | 'paid';
  config: {
    questionIds: string[];
    duration: number;
  };
  createdAt: { toDate: () => Date };
}

type OfficialTest = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  examTypeId: string;
  accessLevel: 'free' | 'paid';
  config: {
    questionIds: string[];
    duration: number;
  };
}

type ExamType = { id: string; name: string; };

export default function MockTestsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { isSubscribed, subscriptionPlan, isLoading: isSubscribedLoading } = useIsSubscribed();
  const { toast } = useToast();
  const [testToDelete, setTestToDelete] = useState<{ id: string; type: 'official' | 'custom'; title: string } | null>(null);

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

  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);

  const examTypeMap = useMemo(() => {
    if (!examTypes) return {};
    return examTypes.reduce((acc, et) => {
      acc[et.id] = et.name;
      return acc;
    }, {} as Record<string, string>);
  }, [examTypes]);

  const totalQuestions = (test: CustomTest | OfficialTest) => test.config.questionIds?.length || 0;
  const totalDuration = (test: CustomTest | OfficialTest) => test.config.duration || 0;
  
  const isLoading = areCustomTestsLoading || isTeacherLoading || areOfficialTestsLoading || isSubscribedLoading || areExamTypesLoading || isAdminLoading;

  const handleDeleteRequest = (id: string, type: 'official' | 'custom', title: string) => {
    setTestToDelete({ id, type, title });
  };

  const confirmDelete = async () => {
    if (!testToDelete || !firestore || !user) return;
    
    let docRef;
    if (testToDelete.type === 'official') {
        docRef = doc(firestore, 'mock_tests', testToDelete.id);
    } else {
        docRef = doc(firestore, 'users', user.uid, 'custom_tests', testToDelete.id);
    }

    try {
      await deleteDocumentNonBlocking(docRef);
      toast({
          title: 'Test Deleted',
          description: `"${testToDelete.title}" has been removed.`,
      });
    } catch (error: any) {
      toast({
          variant: 'destructive',
          title: 'Error deleting test',
          description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setTestToDelete(null);
    }
  };


  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Mock Tests" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
            <h2 className="font-headline text-2xl font-semibold">Available Mock Tests</h2>
            <div className='flex gap-2'>
              <Button asChild variant="outline">
                  <Link href="/mock-tests/create"><PlusCircle className="mr-2"/>Create Custom Test</Link>
              </Button>
               {(isTeacher || isAdmin) && (
                <Button asChild>
                    <Link href="/mock-tests/create-official">
                        <PlusCircle className="mr-2"/> Create Official Test
                    </Link>
                </Button>
            )}
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
                {officialTests.map(test => {
                  const isPaidTest = test.accessLevel === 'paid';
                  const hasAccessByPlan = isSubscribed && subscriptionPlan && subscriptionPlan.examTypeId === test.examTypeId;
                  const canTakeTest = !isPaidTest || hasAccessByPlan || isTeacher || isAdmin;
                  const isUpcoming = test.startTime.toDate() > new Date();
                  const examTypeName = examTypeMap[test.examTypeId] || 'General';

                  return (
                    <Card key={test.id} className="flex flex-col">
                      <CardHeader>
                          <div className="flex justify-between items-start">
                            <CardTitle className="flex items-center gap-2 pr-2">
                                {isPaidTest && !canTakeTest && <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                                {test.title}
                            </CardTitle>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <Badge variant="secondary">{examTypeName}</Badge>
                                <Badge variant={isPaidTest ? 'destructive' : 'default'}>{isPaidTest ? 'Paid' : 'Free'}</Badge>
                            </div>
                          </div>
                          <CardDescription>Scheduled for: {format(test.startTime.toDate(), 'PPP p')}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-grow">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2"><FileText className="h-4 w-4"/><span>{totalQuestions(test)} Questions</span></div>
                              <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{totalDuration(test)} Minutes</span></div>
                          </div>
                      </CardContent>
                      <CardFooter className="flex-col items-stretch gap-2">
                          {canTakeTest ? (
                              <Button asChild className="w-full" disabled={isUpcoming}>
                                  <Link href={`/test/${test.id}`}>
                                      {isUpcoming ? `Starts ${formatDistanceToNow(test.startTime.toDate(), { addSuffix: true })}` : 'Start Test'}
                                      {!isUpcoming && <ArrowRight className="ml-2"/>}
                                  </Link>
                              </Button>
                          ) : (
                                <Button asChild variant="secondary" className="w-full">
                                    <Link href="/subscription">
                                        <Lock className="mr-2" />
                                        Subscribe to Unlock
                                    </Link>
                                </Button>
                          )}
                          {(isTeacher || isAdmin) && (
                              <div className="flex justify-end gap-2 border-t pt-2 mt-2">
                                   <Button asChild variant="ghost" size="sm">
                                      <Link href={`/mock-tests/edit-official/${test.id}`}>
                                          <Edit className="mr-2 h-4 w-4" /> Edit
                                      </Link>
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRequest(test.id, 'official', test.title)}>
                                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </Button>
                              </div>
                          )}
                      </CardFooter>
                    </Card>
                  );
                })}
                </div>
            ) : (
                <Card className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg bg-muted/50">
                    <h3 className="font-semibold">No official tests have been scheduled.</h3>
                    <p className="text-sm text-muted-foreground">Please check back later.</p>
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
                            <div className="flex justify-between items-start">
                                <CardTitle>{test.title}</CardTitle>
                                <Badge variant={test.accessLevel === 'paid' ? 'destructive' : 'default'}>
                                    {test.accessLevel === 'paid' ? 'Paid' : 'Free'}
                                </Badge>
                            </div>
                            <CardDescription>Created {formatDistanceToNow(test.createdAt.toDate(), { addSuffix: true })}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2"><FileText className="h-4 w-4"/><span>{totalQuestions(test)} Questions</span></div>
                                <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{totalDuration(test)} Minutes</span></div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col items-stretch gap-2">
                            <Button asChild className="w-full">
                                <Link href={`/test/${test.id}?type=custom`}>Start Test <ArrowRight className="ml-2"/></Link>
                            </Button>
                            <div className="flex justify-end gap-2 border-t pt-2 mt-2">
                                <Button asChild variant="ghost" size="sm">
                                    <Link href={`/mock-tests/edit/${test.id}`}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </Link>
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRequest(test.id, 'custom', test.title)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </Button>
                            </div>
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

        <AlertDialog open={!!testToDelete} onOpenChange={(open) => !open && setTestToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the test titled "{testToDelete?.title}".
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setTestToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete} className={cn(buttonVariants({ variant: "destructive" }))}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
