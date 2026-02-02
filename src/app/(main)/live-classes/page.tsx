'use client';
import { useState, useMemo, type FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, PlusCircle, Video, LoaderCircle, Trash2, User, Clock, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import DashboardHeader from '@/components/dashboard-header';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const liveClassSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  startTime: z.date().refine((date) => date > new Date(), {
    message: 'Start time must be in the future.',
  }),
  duration: z.coerce.number().int().min(15, 'Duration must be at least 15 minutes.'),
  examTypeId: z.string().min(1, 'Please select an exam type.'),
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
}

type ExamType = { id: string; name: string; };

const LiveClassForm: FC<{ setOpen: (open: boolean) => void, examTypes: ExamType[] }> = ({ setOpen, examTypes }) => {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof liveClassSchema>>({
        resolver: zodResolver(liveClassSchema),
        defaultValues: {
            title: '',
            duration: 60,
            examTypeId: '',
            meetingUrl: '',
        },
    });

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
                     <FormField control={form.control} name="startTime" render={({ field }) => (
                        <FormItem className="flex flex-col"><FormLabel>Start Time</FormLabel>
                            <Popover><PopoverTrigger asChild>
                                <FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "PPP HH:mm") : <span>Pick a date and time</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button></FormControl>
                            </PopoverTrigger><PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={(date) => {
                                        if (!date) {
                                            field.onChange(undefined);
                                            return;
                                        }
                                        const currentTime = field.value || new Date();
                                        const newDateTime = new Date(
                                            date.getFullYear(),
                                            date.getMonth(),
                                            date.getDate(),
                                            currentTime.getHours(),
                                            currentTime.getMinutes()
                                        );
                                        field.onChange(newDateTime);
                                    }}
                                    disabled={(date) => date < new Date()}
                                    initialFocus
                                />
                                <div className="p-3 border-t border-border">
                                    <Input
                                        type="time"
                                        value={field.value ? format(field.value, 'HH:mm') : ''}
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            const [hours, minutes] = e.target.value.split(':').map(Number);
                                            const currentDate = field.value || new Date();
                                            currentDate.setHours(hours, minutes);
                                            field.onChange(new Date(currentDate));
                                        }}
                                    />
                                </div>
                            </PopoverContent></Popover>
                        <FormMessage /></FormItem>
                    )} />
                     <FormField control={form.control} name="duration" render={({ field }) => (
                        <FormItem><FormLabel>Duration (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g., 60" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                 <FormField control={form.control} name="meetingUrl" render={({ field }) => (
                    <FormItem><FormLabel>Meeting URL</FormLabel><FormControl><Input placeholder="https://meet.google.com/..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="examTypeId" render={({ field }) => (
                    <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Scheduling...</> : <><PlusCircle className="mr-2" /> Schedule Class</>}
                </Button>
            </form>
        </Form>
    );
};

const LiveClassCard: FC<{ liveClass: LiveClass; currentUserId?: string, examTypeMap: Record<string, string> }> = ({ liveClass, currentUserId, examTypeMap }) => {
    const firestore = useFirestore();
    const { toast } = useToast();

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
                    <div className="flex-shrink-0"><span className="text-sm font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">{examTypeMap[liveClass.examTypeId] || 'General'}</span></div>
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
                 <Button asChild disabled={!isUpcoming}>
                    <Link href={liveClass.meetingUrl} target="_blank">
                        <Video className="mr-2" />
                        Join Class
                    </Link>
                </Button>
                {isOwner && (
                    <Button variant="ghost" size="icon" onClick={handleDelete}>
                        <Trash2 className="h-5 w-5 text-destructive" />
                        <span className="sr-only">Delete Class</span>
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
};


export default function LiveClassesPage() {
  const { user } = useUser();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const firestore = useFirestore();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const liveClassesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'live_classes'), orderBy('startTime', 'asc'));
  }, [firestore]);
  
  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);

  const { data: liveClasses, isLoading: areClassesLoading, error } = useCollection<LiveClass>(liveClassesQuery);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);

  const examTypeMap = useMemo(() => {
    if (!examTypes) return {};
    return examTypes.reduce((acc, et) => {
      acc[et.id] = et.name;
      return acc;
    }, {} as Record<string, string>);
  }, [examTypes]);
  
  if (error) {
    console.error("Firestore Error:", error);
  }

  const upcomingClasses = useMemo(() => liveClasses?.filter(c => c.startTime.toDate() >= new Date()) || [], [liveClasses]);
  const pastClasses = useMemo(() => liveClasses?.filter(c => c.startTime.toDate() < new Date()).reverse() || [], [liveClasses]);

  const isLoading = isTeacherLoading || areClassesLoading || areExamTypesLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Live Classes" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-headline text-2xl font-semibold">Class Schedule</h2>
          {isTeacher && (
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2" /> Schedule a Class</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[625px]">
                <DialogHeader>
                  <DialogTitle>Schedule a New Live Class</DialogTitle>
                  <DialogDescription>Fill in the details below to add a new class to the schedule.</DialogDescription>
                </DialogHeader>
                <LiveClassForm setOpen={setIsFormOpen} examTypes={examTypes || []} />
              </DialogContent>
            </Dialog>
          )}
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
                    {upcomingClasses.map(cls => <LiveClassCard key={cls.id} liveClass={cls} currentUserId={user?.uid} examTypeMap={examTypeMap} />)}
                </div>
              ) : (
                <p className="text-muted-foreground">No upcoming classes scheduled.</p>
              )}
            </div>
            <div>
                <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">Past Classes</h3>
                {pastClasses.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {pastClasses.map(cls => <LiveClassCard key={cls.id} liveClass={cls} currentUserId={user?.uid} examTypeMap={examTypeMap} />)}
                    </div>
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
              {isTeacher ? "Get started by scheduling your first class." : "The class schedule is empty right now. Please check back later!"}
            </p>
            {isTeacher && <Button className="mt-4" onClick={() => setIsFormOpen(true)}><PlusCircle className='mr-2' />Schedule a Class</Button>}
          </Card>
        )}
      </main>
    </div>
  );
}
