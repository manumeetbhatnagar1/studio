'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
    RadioGroup,
    RadioGroupItem,
} from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardHeader from '@/components/dashboard-header';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, orderBy, Timestamp, doc, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { LoaderCircle, PencilRuler, Trash2, Mail, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import type { StudyRequirement as StudyRequirementType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const requirementSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters long.'),
  examType: z.string().min(2, 'Please specify the exam type.'),
  classPreference: z.enum(['Online', 'Offline'], { required_error: "You need to select a class preference."}),
});

const getPostedDate = (timestamp?: Timestamp) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    }
    return 'just now';
}

function StudentRequirementList() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const studentRequirementsQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(collection(firestore, 'study_requirements'), where('studentId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user]);

    const { data: requirements, isLoading } = useCollection<StudyRequirementType>(studentRequirementsQuery);

    const handleDelete = (id: string) => {
        if(!confirm('Are you sure you want to delete this requirement?')) return;
        const reqRef = doc(firestore, 'study_requirements', id);
        deleteDocumentNonBlocking(reqRef);
        toast({ title: 'Requirement Deleted', description: 'Your study requirement has been removed.' });
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        )
    }

    if (!requirements || requirements.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>You haven&apos;t posted any requirements yet.</p>
                <p className='text-sm'>Fill out the form above to let teachers know what you need.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {requirements.map(req => (
                <Card key={req.id} className="flex flex-col sm:flex-row justify-between items-start p-4 gap-4">
                    <div className="flex-1">
                        <p className="font-semibold text-lg">{req.subject}</p>
                        <p className="text-muted-foreground text-sm">
                            Exam: {req.examType} &bull; Preference: {req.classPreference} &bull; Posted {getPostedDate(req.createdAt)}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                         <Badge variant={req.status === 'Open' ? 'secondary' : 'default'} className="flex items-center gap-1">
                            {req.status === 'Open' ? <Clock className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                            {req.status}
                        </Badge>
                        {req.status === 'Open' && (
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(req.id)}>
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Requirement</span>
                            </Button>
                        )}
                    </div>
                </Card>
            ))}
        </div>
    )
}

function TeacherRequirementList() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const openRequirementsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'study_requirements'), where('status', '==', 'Open'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const closedRequirementsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'study_requirements'), where('status', '==', 'Closed'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const { data: openRequirements, isLoading: isLoadingOpen } = useCollection<StudyRequirementType>(openRequirementsQuery);
    const { data: closedRequirements, isLoading: isLoadingClosed } = useCollection<StudyRequirementType>(closedRequirementsQuery);

    const handleMarkAsClosed = (id: string) => {
        const reqRef = doc(firestore, 'study_requirements', id);
        updateDocumentNonBlocking(reqRef, { status: 'Closed' });
        toast({ title: 'Requirement Closed', description: 'The requirement has been moved to the closed tab.' });
    };

    const RequirementCard = ({ req }: { req: StudyRequirementType }) => (
         <Card key={req.id} className="p-4">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <p className="font-semibold text-lg">{req.subject}</p>
                    <div className="text-muted-foreground text-sm space-y-1 mt-1">
                        <p><strong>Student:</strong> {req.studentName}</p>
                        <p><strong>Exam:</strong> {req.examType} &bull; <strong>Preference:</strong> {req.classPreference}</p>
                        <p><strong>Posted:</strong> {getPostedDate(req.createdAt)}</p>
                    </div>
                </div>
                 <div className="flex flex-col items-end gap-2">
                    <Button asChild variant="outline" className="w-full" disabled={!req.studentEmail}>
                        <a href={req.studentEmail ? `mailto:${req.studentEmail}` : undefined}>
                            <Mail className="mr-2 h-4 w-4" /> Contact
                        </a>
                    </Button>
                    {req.status === 'Open' && (
                        <Button onClick={() => handleMarkAsClosed(req.id)} className="w-full">
                            <CheckCircle className="mr-2 h-4 w-4" /> Mark as Closed
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );

    return (
        <Tabs defaultValue="open">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="open">Open Requirements</TabsTrigger>
                <TabsTrigger value="closed">Closed Requirements</TabsTrigger>
            </TabsList>
            <TabsContent value="open" className="mt-4">
                 {isLoadingOpen ? (
                    <div className="space-y-4">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-28 w-full" />
                    </div>
                ) : !openRequirements || openRequirements.length === 0 ? (
                     <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                        <p className='font-medium'>No open requirements at the moment.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {openRequirements.map(req => <RequirementCard key={req.id} req={req} />)}
                    </div>
                )}
            </TabsContent>
            <TabsContent value="closed" className="mt-4">
                  {isLoadingClosed ? (
                    <div className="space-y-4">
                        <Skeleton className="h-28 w-full" />
                    </div>
                ) : !closedRequirements || closedRequirements.length === 0 ? (
                     <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                        <p className='font-medium'>No requirements have been closed yet.</p>
                    </div>
                ) : (
                     <div className="space-y-4">
                        {closedRequirements.map(req => <RequirementCard key={req.id} req={req} />)}
                    </div>
                )}
            </TabsContent>
        </Tabs>
    )

}


export default function StudyRequirementsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  const form = useForm<z.infer<typeof requirementSchema>>({
    resolver: zodResolver(requirementSchema),
    defaultValues: { subject: '', examType: '', classPreference: 'Online' },
  });

  const onSubmit = (values: z.infer<typeof requirementSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to post a requirement.' });
      return;
    }
    setIsSubmitting(true);
    const requirementsRef = collection(firestore, 'study_requirements');
    addDocumentNonBlocking(requirementsRef, {
      ...values,
      studentId: user.uid,
      studentName: user.displayName || 'Anonymous',
      studentEmail: user.email || null,
      status: 'Open',
      createdAt: serverTimestamp(),
    });
    toast({
      title: 'Requirement Posted!',
      description: 'Teachers will now be able to see your requirement.',
    });
    form.reset();
    setIsSubmitting(false);
  };

  if (isTeacherLoading) {
    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Study Requirements" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                 <div className="flex h-full w-full items-center justify-center">
                    <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
                </div>
            </main>
        </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Study Requirements" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {!isTeacher && (
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-2xl">
                    <PencilRuler className="w-6 h-6" /> Post a Study Requirement
                    </CardTitle>
                    <CardDescription>Let our teachers know what you need help with.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <FormField
                                control={form.control}
                                name="subject"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Subject</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Physics, Organic Chemistry" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <FormField
                                control={form.control}
                                name="examType"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Exam Type</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., IIT JEE, CBSE Board" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="classPreference"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Class Preference</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex flex-row space-x-4"
                                    >
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="Online" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Online</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="Offline" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Offline</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />

                        <Button type="submit" disabled={isSubmitting || !user}>
                        {isSubmitting ? (
                            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Posting...</>
                        ) : (
                            'Post Requirement'
                        )}
                        </Button>
                    </form>
                    </Form>
                </CardContent>
            </Card>
        )}

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">{isTeacher ? "Student Requirements" : "My Posted Requirements"}</CardTitle>
                <CardDescription>{isTeacher ? "View and manage student learning needs." : "Track the status of your requirements."}</CardDescription>
            </CardHeader>
            <CardContent>
                {isTeacher ? <TeacherRequirementList /> : <StudentRequirementList />}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
