'use client';

import { useState, useMemo, type FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, PlusCircle, Video, LoaderCircle, Trash2, User, Clock, Link as LinkIcon, AlertTriangle, CreditCard, PlayCircle, CalendarClock, BookOpen, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import DashboardHeader from '@/components/dashboard-header';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// ===== TYPE DEFINITIONS =====

const liveClassSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  startTime: z.coerce.date().refine((date) => date > new Date(), {
    message: 'Start time must be in the future.',
  }),
  duration: z.coerce.number().int().min(15, 'Duration must be at least 15 minutes.'),
  examTypeId: z.string().min(1, 'Please select an exam type.'),
  classId: z.string().min(1, 'Please select a class.'),
  subjectId: z.string().min(1, 'Please select a subject.'),
  accessLevel: z.enum(['free', 'paid']),
  meetingUrl: z.string().url('Please enter a valid meeting URL.'),
});

type LiveClass = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  duration: number;
  teacherId: string;
  teacherName: string;
  teacherPhotoUrl?: string;
  meetingUrl: string;
  examTypeId: string;
  classId: string;
  subjectId: string;
  accessLevel: 'free' | 'paid';
  recordingUrl?: string;
};

type ExamType = { id: string; name: string; };
type Class = { id: string; name: string; examTypeId: string; };
type Subject = { id: string; name: string; classId: string };

type UserProfile = {
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
};


// ===== SHARED & STUDENT COMPONENTS =====

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

const LiveClassCard: FC<{ liveClass: LiveClass; currentUserId?: string, examTypeMap: Record<string, string>, classMap: Record<string, string>, subjectMap: Record<string, string> }> = ({ liveClass, currentUserId, examTypeMap, classMap, subjectMap }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isRecordingDialogOpen, setIsRecordingDialogOpen] = useState(false);

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
            try {
              const docRef = doc(firestore, 'live_classes', liveClass.id);
              await deleteDocumentNonBlocking(docRef);
              toast({ title: 'Class Deleted', description: `'${liveClass.title}' has been removed from the schedule.` });
            } catch (error: any) {
              toast({ variant: 'destructive', title: 'Error Deleting Class', description: error.message || 'Could not delete the class.' });
            }
        }
    };
    
    const isOwner = liveClass.teacherId === currentUserId;
    const classTime = liveClass.startTime.toDate();
    const isUpcoming = classTime > new Date();

    return (
        <Card className="flex flex-col shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-start gap-4">
                    <CardTitle className="font-headline text-xl">{liveClass.title}</CardTitle>
                    <div className="flex-shrink-0 flex gap-2">
                      <Badge variant={liveClass.accessLevel === 'paid' ? 'destructive' : 'default'}>
                        {liveClass.accessLevel === 'paid' ? 'Paid' : 'Free'}
                      </Badge>
                      <Badge variant="secondary">{examTypeMap[liveClass.examTypeId] || 'General'}</Badge>
                    </div>
                </div>
                <CardDescription className="flex items-center gap-2 pt-2">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={liveClass.teacherPhotoUrl} />
                        <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <span>{liveClass.teacherName}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4"/>
                    <span>{classMap[liveClass.classId] || 'N/A'} / {subjectMap[liveClass.subjectId] || 'N/A'}</span>
                </div>
                 <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><CalendarIcon className="h-4 w-4"/><span>{format(classTime, 'E, d MMM yyyy')}</span></div>
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{format(classTime, 'h:mm a')} ({liveClass.duration} min)</span></div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                     <LinkIcon className="h-4 w-4 flex-shrink-0" />
                     <Link href={liveClass.meetingUrl} target='_blank' className='truncate text-blue-600 hover:underline'>{liveClass.meetingUrl}</Link>
                </div>
            </CardContent>
            <CardFooter className="bg-muted/50 px-6 py-4 flex justify-between items-center">
                 <div>
                    {isUpcoming ? (
                        <Button asChild>
                            <Link href={liveClass.meetingUrl} target="_blank">
                                <Video className="mr-2" />
                                Join Class
                            </Link>
                        </Button>
                    ) : liveClass.recordingUrl ? (
                        <Button asChild>
                            <Link href={liveClass.recordingUrl} target="_blank">
                                <PlayCircle className="mr-2" />
                                Watch Recording
                            </Link>
                        </Button>
                    ) : (
                        <div className='text-sm text-muted-foreground'>Recording not available</div>
                    )}
                 </div>
                 <div className="flex items-center gap-1">
                    {isOwner && !isUpcoming && (
                        <Dialog open={isRecordingDialogOpen} onOpenChange={setIsRecordingDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {liveClass.recordingUrl ? <Edit className="mr-2 h-4 w-4"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                                    Recording
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add/Edit Recording URL</DialogTitle>
                                    <DialogDescription>Paste the video URL for the recording of "{liveClass.title}".</DialogDescription>
                                </DialogHeader>
                                <RecordingUrlForm liveClass={liveClass} onFinished={() => setIsRecordingDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    )}
                    {isOwner && (
                        <Button variant="ghost" size="icon" onClick={handleDelete}>
                            <Trash2 className="h-5 w-5 text-destructive" />
                            <span className="sr-only">Delete Class</span>
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
};

const PastClassesCurriculumView: FC<{
    pastClasses: LiveClass[];
    examTypes: ExamType[];
    classes: Class[];
    subjects: Subject[];
    examTypeMap: Record<string, string>;
    classMap: Record<string, string>;
    subjectMap: Record<string, string>;
    currentUserId?: string;
}> = ({ pastClasses, examTypes, classes, subjects, examTypeMap, classMap, subjectMap, currentUserId }) => {

    const curriculumTree = useMemo(() => {
        if (!examTypes || !classes || !subjects || !pastClasses) return [];

        return examTypes.map(et => ({
            ...et,
            classes: classes
                .filter(c => c.examTypeId === et.id)
                .map(c => ({
                    ...c,
                    subjects: subjects
                        .filter(s => s.classId === c.id)
                        .map(s => ({
                            ...s,
                            classes: pastClasses.filter(lc => lc.subjectId === s.id && lc.classId === c.id)
                        }))
                        .filter(s => s.classes.length > 0)
                }))
                .filter(c => c.subjects.length > 0)
        })).filter(et => et.classes.length > 0);
    }, [pastClasses, examTypes, classes, subjects]);

    if (curriculumTree.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No past classes found in the curriculum view.</p>;
    }

    return (
        <Accordion type="multiple" className="w-full space-y-2">
            {curriculumTree.map(et => (
                <AccordionItem value={et.id} key={et.id} className="border rounded-lg">
                    <AccordionTrigger className="text-xl font-semibold px-6">{et.name}</AccordionTrigger>
                    <AccordionContent className="px-6 pb-2">
                        <Accordion type="multiple" className="w-full space-y-2" defaultValue={et.classes.map(c => c.id)}>
                            {et.classes.map(c => (
                                <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                                    <AccordionTrigger className="text-lg font-medium px-4">{c.name}</AccordionTrigger>
                                    <AccordionContent className="px-4 pb-2">
                                        <Accordion type="multiple" className="w-full space-y-2" defaultValue={c.subjects.map(s => s.id)}>
                                            {c.subjects.map(s => (
                                                <AccordionItem value={s.id} key={s.id} className="border-l-2 pl-4 border-muted">
                                                    <AccordionTrigger className="font-medium">{s.name}</AccordionTrigger>
                                                    <AccordionContent className="pl-4 pt-2 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                                        {s.classes.map(cls => (
                                                            <LiveClassCard
                                                                key={cls.id}
                                                                liveClass={cls}
                                                                currentUserId={currentUserId}
                                                                examTypeMap={examTypeMap}
                                                                classMap={classMap}
                                                                subjectMap={subjectMap}
                                                            />
                                                        ))}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            ))}
                                        </Accordion>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
};


function StudentView() {
    const firestore = useFirestore();

    const liveClassesQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'live_classes'), orderBy('startTime', 'desc')) : null,
        [firestore]
    );
    const { data: liveClasses, isLoading: areLiveClassesLoading } = useCollection<LiveClass>(liveClassesQuery);

    const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
    const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
    const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);

    const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);
    const { data: classes, isLoading: areClassesDataLoading } = useCollection<Class>(classesQuery);
    const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);

    const isLoading = areLiveClassesLoading || areExamTypesLoading || areClassesDataLoading || areSubjectsLoading;

    const { upcomingClasses, pastClasses } = useMemo(() => {
        if (!liveClasses) return { upcomingClasses: [], pastClasses: [] };
        const now = new Date();
        const upcoming = liveClasses.filter(c => c.startTime.toDate() >= now).reverse().slice(0, 3);
        const past = liveClasses.filter(c => c.startTime.toDate() < now);
        return { upcomingClasses: upcoming, pastClasses: past };
    }, [liveClasses]);

     const examTypeMap = useMemo(() => {
      if (!examTypes) return {};
      return examTypes.reduce((acc, et) => ({ ...acc, [et.id]: et.name }), {} as Record<string, string>);
    }, [examTypes]);
    
    const classMap = useMemo(() => classes ? classes.reduce((acc, c) => ({...acc, [c.id]: c.name}), {} as Record<string, string>) : {}, [classes]);
    const subjectMap = useMemo(() => subjects ? subjects.reduce((acc, s) => ({...acc, [s.id]: s.name}), {} as Record<string, string>) : {}, [subjects]);

    return (
        <div className="space-y-6">
            <FeePaymentReminder />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Upcoming Classes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isLoading ? <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></> :
                        upcomingClasses.length > 0 ? upcomingClasses.map(c => (
                            <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                <div>
                                    <p className="font-semibold">{c.title}</p>
                                    <p className="text-sm text-muted-foreground">{format(c.startTime.toDate(), "EEE, MMM d 'at' h:mm a")}</p>
                                </div>
                                <Button asChild size="sm">
                                    <Link href={c.meetingUrl} target="_blank">
                                        <Video className="mr-2 h-4 w-4" />
                                        Join
                                    </Link>
                                </Button>
                            </div>
                        )) : <p className="text-muted-foreground">No upcoming classes scheduled.</p>
                        }
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Recent Recordings</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                       {isLoading ? <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></> :
                       pastClasses.filter(c => c.recordingUrl).slice(0,5).length > 0 ? pastClasses.filter(c => c.recordingUrl).slice(0,5).map(c => (
                            <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                <div>
                                    <p className="font-semibold">{c.title}</p>
                                    <p className="text-sm text-muted-foreground">{format(c.startTime.toDate(), "MMM d, yyyy")} &middot; by {c.teacherName}</p>
                                </div>
                                <Button asChild variant="ghost" size="sm">
                                    <Link href={c.recordingUrl!} target="_blank"><PlayCircle className="h-4 w-4" /></Link>
                                </Button>
                            </div>
                        )) : <p className="text-muted-foreground">No recordings available yet.</p>
                       }
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Past Class Recordings by Curriculum</CardTitle>
                    <CardDescription>Browse all available class recordings.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-64 w-full" /> : 
                        <PastClassesCurriculumView
                            pastClasses={pastClasses}
                            examTypes={examTypes || []}
                            classes={classes || []}
                            subjects={subjects || []}
                            examTypeMap={examTypeMap}
                            classMap={classMap}
                            subjectMap={subjectMap}
                        />
                    }
                </CardContent>
            </Card>
        </div>
    );
}

// ===== TEACHER VIEW: COMPONENTS =====

const LiveClassForm: FC<{ setOpen: (open: boolean) => void, examTypes: ExamType[], classes: Class[], subjects: Subject[] }> = ({ setOpen, examTypes, classes, subjects }) => {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    const form = useForm<z.infer<typeof liveClassSchema>>({
        resolver: zodResolver(liveClassSchema),
        defaultValues: {
            title: '',
            duration: 60,
            examTypeId: '',
            classId: '',
            subjectId: '',
            accessLevel: 'free',
            meetingUrl: '',
        },
    });

    const { watch, setValue } = form;
    const selectedExamType = watch('examTypeId');
    const selectedClass = watch('classId');
    
    const filteredClasses = useMemo(() => {
      if (!selectedExamType) return [];
      return classes.filter((c) => c.examTypeId === selectedExamType);
    }, [selectedExamType, classes]);
  
    const filteredSubjects = useMemo(() => {
      if (!selectedClass) return [];
      return subjects.filter((subject) => subject.classId === selectedClass);
    }, [selectedClass, subjects]);
  
    useEffect(() => {
      setValue('classId', '');
      setValue('subjectId', '');
    }, [selectedExamType, setValue]);
  
    useEffect(() => {
      setValue('subjectId', '');
    }, [selectedClass, setValue]);

    async function onSubmit(values: z.infer<typeof liveClassSchema>) {
        if (!user) {
            toast({ variant: 'destructive', title: 'You must be logged in.' });
            return;
        }
        setIsSubmitting(true);
        
        try {
          const liveClassesRef = collection(firestore, 'live_classes');
          await addDocumentNonBlocking(liveClassesRef, {
              ...values,
              teacherId: user.uid,
              teacherName: user.displayName || 'Unnamed Teacher',
              teacherPhotoUrl: user.photoURL || '',
          });

          const notificationsRef = collection(firestore, 'notifications');
          const className = classes.find(c => c.id === values.classId)?.name || '';
          const subjectName = subjects.find(s => s.id === values.subjectId)?.name || '';
          const notificationMessage = `"${values.title}" for ${className} (${subjectName}) is scheduled at ${format(values.startTime, 'p, dd/MM/yy')}.`;
          
          await addDocumentNonBlocking(notificationsRef, {
              title: 'New Live Class',
              message: notificationMessage,
              href: '/live-classes',
              createdAt: serverTimestamp(),
              examTypeId: values.examTypeId
          });

          toast({
              title: 'Class Scheduled!',
              description: `'${values.title}' has been added to the calendar.`,
          });
          form.reset();
          setOpen(false);
        } catch (error: any) {
          toast({
              variant: 'destructive',
              title: 'Scheduling Failed',
              description: error.message || 'An unexpected error occurred.',
          });
        } finally {
          setIsSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem><FormLabel>Class Title</FormLabel><FormControl><Input placeholder="e.g., Advanced Problem Solving in Algebra" {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Start Date & Time</FormLabel>
                                <FormControl>
                                    <Input
                                        type="datetime-local"
                                        value={field.value instanceof Date ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value) {
                                                const newDate = new Date(value);
                                                if (!isNaN(newDate.getTime())) {
                                                    field.onChange(newDate);
                                                }
                                            } else {
                                                field.onChange(undefined);
                                            }
                                        }}
                                        min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField control={form.control} name="duration" render={({ field }) => (
                        <FormItem><FormLabel>Duration (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g., 60" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="accessLevel" render={({ field }) => (
                    <FormItem className="space-y-3"><FormLabel>Access Level</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-row space-x-4">
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="paid" /></FormControl><FormLabel className="font-normal">Paid</FormLabel></FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="examTypeId" render={({ field }) => (
                        <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                            <SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                        </Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="classId" render={({ field }) => (
                        <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamType}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                            <SelectContent>{filteredClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="subjectId" render={({ field }) => (
                        <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedClass}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl>
                            <SelectContent>{filteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select><FormMessage /></FormItem>
                    )} />
                 </div>
                 <FormField control={form.control} name="meetingUrl" render={({ field }) => (
                    <FormItem><FormLabel>Meeting URL</FormLabel><FormControl><Input placeholder="https://meet.google.com/..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Scheduling...</> : <><PlusCircle className="mr-2" /> Schedule Class</>}
                </Button>
            </form>
        </Form>
    );
};

const RecordingUrlForm: FC<{ liveClass: LiveClass; onFinished: () => void }> = ({ liveClass, onFinished }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm({
        defaultValues: {
            recordingUrl: liveClass.recordingUrl || ''
        }
    });
    
    async function onSubmit(values: { recordingUrl: string }) {
        setIsSubmitting(true);
        try {
            const docRef = doc(firestore, 'live_classes', liveClass.id);
            await updateDocumentNonBlocking(docRef, { recordingUrl: values.recordingUrl });
            toast({ title: 'Recording URL Saved!' });
            onFinished();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="recordingUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Recording URL</FormLabel>
                            <FormControl>
                                <Input placeholder="https://youtube.com/watch?v=..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <LoaderCircle className="animate-spin mr-2" /> : null}
                    Save URL
                </Button>
            </form>
        </Form>
    );
}

function TeacherView() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [isFormOpen, setIsFormOpen] = useState(false);
  
    const liveClassesQuery = useMemoFirebase(() => {
      if (!firestore) return null;
      return query(collection(firestore, 'live_classes'), orderBy('startTime', 'asc'));
    }, [firestore]);
    
    const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
    const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
    const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);

    const { data: liveClasses, isLoading: areLiveClassesLoading, error } = useCollection<LiveClass>(liveClassesQuery);
    const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);
    const { data: classes, isLoading: areClassesDataLoading } = useCollection<Class>(classesQuery);
    const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  
    const examTypeMap = useMemo(() => {
      if (!examTypes) return {};
      return examTypes.reduce((acc, et) => ({ ...acc, [et.id]: et.name }), {} as Record<string, string>);
    }, [examTypes]);
    
    const classMap = useMemo(() => classes ? classes.reduce((acc, c) => ({...acc, [c.id]: c.name}), {} as Record<string, string>) : {}, [classes]);
    const subjectMap = useMemo(() => subjects ? subjects.reduce((acc, s) => ({...acc, [s.id]: s.name}), {} as Record<string, string>) : {}, [subjects]);
    
    if (error) {
      console.error("Firestore Error:", error);
    }
  
    const upcomingClasses = useMemo(() => liveClasses?.filter(c => c.startTime.toDate() >= new Date()) || [], [liveClasses]);
    const pastClasses = useMemo(() => liveClasses?.filter(c => c.startTime.toDate() < new Date()).reverse() || [], [liveClasses]);
  
    const isLoading = areLiveClassesLoading || areExamTypesLoading || areClassesDataLoading || areSubjectsLoading;

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-2xl font-semibold">Class Schedule</h2>
                <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                    <DialogTrigger asChild>
                    <Button><PlusCircle className="mr-2" /> Schedule a Class</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                        <DialogTitle>Schedule a New Live Class</DialogTitle>
                        <DialogDescription>Fill in the details below to add a new class to the schedule.</DialogDescription>
                    </DialogHeader>
                    {isLoading ? <Skeleton className="h-64"/> : <LiveClassForm setOpen={setIsFormOpen} examTypes={examTypes || []} classes={classes || []} subjects={subjects || []} />}
                    </DialogContent>
                </Dialog>
            </div>
    
            {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            ) : error ? (
                 <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full bg-destructive/10">
                    <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                    <h2 className="font-headline text-2xl font-semibold text-destructive">Error Loading Classes</h2>
                    <p className="text-destructive/80 mt-2 max-w-md">
                        We couldn't fetch the class schedule. It might be a permission issue or a network problem. Please try again later.
                    </p>
                 </Card>
            ) : liveClasses && liveClasses.length > 0 ? (
              <div className="space-y-8">
                <div>
                  <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">Upcoming Classes</h3>
                  {upcomingClasses.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {upcomingClasses.map(cls => <LiveClassCard key={cls.id} liveClass={cls} currentUserId={user?.uid} examTypeMap={examTypeMap} classMap={classMap} subjectMap={subjectMap} />)}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No upcoming classes scheduled.</p>
                  )}
                </div>
                <div>
                    <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">Past Classes</h3>
                     {pastClasses.length > 0 ? (
                        <PastClassesCurriculumView
                            pastClasses={pastClasses}
                            examTypes={examTypes || []}
                            classes={classes || []}
                            subjects={subjects || []}
                            examTypeMap={examTypeMap}
                            classMap={classMap}
                            subjectMap={subjectMap}
                            currentUserId={user?.uid}
                        />
                    ) : (
                        <p className="text-muted-foreground">No past classes found.</p>
                    )}
                </div>
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full">
                <Video className="w-16 h-16 text-muted-foreground mb-4" />
                <h2 className="font-headline text-3xl font-semibold">No Classes Scheduled</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                  Get started by scheduling your first class.
                </p>
                <Button className="mt-4" onClick={() => setIsFormOpen(true)}><PlusCircle className='mr-2' />Schedule a Class</Button>
              </Card>
            )}
      </>
    )
}

// ===== MAIN PAGE COMPONENT =====
export default function LiveClassesPage() {
    const { isTeacher, isLoading } = useIsTeacher();

    if (isLoading) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Live Classes" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    <Skeleton className="h-64 w-full" />
                </main>
            </div>
        );
    }
  
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Live Classes" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {isTeacher ? <TeacherView /> : <StudentView />}
        </main>
      </div>
    );
  }
