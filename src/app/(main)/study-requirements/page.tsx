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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import DashboardHeader from '@/components/dashboard-header';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { LoaderCircle, PenSquare, Trash2, Mail, BadgeCheck, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Badge } from '@/components/ui/badge';

const requirementSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters long.'),
  examType: z.string().min(3, 'Exam Type must be at least 3 characters long.'),
  classType: z.enum(['Online', 'Offline']),
});

type StudyRequirement = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  subject: string;
  examType: string;
  classType: 'Online' | 'Offline';
  createdAt: Timestamp;
  status: 'Open' | 'Closed';
};

function RequirementItem({ requirement, isTeacherView, onStatusChange, onDelete }: { requirement: StudyRequirement, isTeacherView: boolean, onStatusChange: (id: string, status: 'Open' | 'Closed') => void, onDelete: (id: string) => void }) {
    const userAvatar = PlaceHolderImages.find(img => img.id === 'user-avatar');

    return (
        <Card className="flex flex-col md:flex-row gap-4 p-4">
            <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                        {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt={requirement.studentName} data-ai-hint={userAvatar.imageHint} />}
                    <AvatarFallback>
                        {requirement.studentName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                </Avatar>
            </div>
            <div className="flex-1">
                <div className='flex justify-between items-start'>
                    <div>
                        <p className="font-semibold text-lg">{requirement.subject}</p>
                        <p className="text-sm text-muted-foreground">For: {requirement.examType}</p>
                    </div>
                    <Badge variant={requirement.status === 'Open' ? 'default' : 'secondary'}>{requirement.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                    <p>Posted by <span className='font-semibold'>{requirement.studentName}</span> &bull; {formatDistanceToNow(requirement.createdAt.toDate(), { addSuffix: true })}</p>
                    <p>Prefers <span className='font-semibold'>{requirement.classType}</span> classes.</p>
                </div>
            </div>
            <div className='flex flex-col justify-center gap-2 md:items-end'>
            {isTeacherView ? (
                <>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="sm"><Mail className="mr-2 h-4 w-4" /> Contact Student</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Contact Student</AlertDialogTitle>
                            <AlertDialogDescription>
                                You can reach out to {requirement.studentName} at the following email address: <br />
                                <a href={`mailto:${requirement.studentEmail}`} className="font-semibold text-primary underline">{requirement.studentEmail}</a>
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onStatusChange(requirement.id, 'Closed')}>Mark as Contacted & Close</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            ) : (
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onStatusChange(requirement.id, requirement.status === 'Open' ? 'Closed' : 'Open')} >
                        {requirement.status === 'Open' ? <XCircle className="mr-2 h-4 w-4" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                        {requirement.status === 'Open' ? 'Close' : 'Re-open'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete(requirement.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                </div>
            )}
            </div>
        </Card>
    );
}


export default function StudyRequirementsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  const requirementsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    if (isTeacher) {
        return query(collection(firestore, 'study_requirements'), where('status', '==', 'Open'), orderBy('createdAt', 'desc'));
    } else {
        return query(collection(firestore, 'study_requirements'), where('studentId', '==', user.uid), orderBy('createdAt', 'desc'));
    }
  }, [firestore, user, isTeacher]);

  const { data: requirements, isLoading: areRequirementsLoading } = useCollection<StudyRequirement>(requirementsQuery);

  const form = useForm<z.infer<typeof requirementSchema>>({
    resolver: zodResolver(requirementSchema),
    defaultValues: { subject: '', examType: '', classType: 'Online' },
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
      studentName: user.displayName || 'Anonymous Student',
      studentEmail: user.email,
      createdAt: serverTimestamp(),
      status: 'Open',
    });
    toast({
      title: 'Requirement Posted!',
      description: 'Your requirement is now visible to teachers.',
    });
    form.reset();
    setIsSubmitting(false);
  };

  const handleStatusChange = (id: string, status: 'Open' | 'Closed') => {
    const docRef = doc(firestore, 'study_requirements', id);
    updateDocumentNonBlocking(docRef, { status });
    toast({
        title: 'Requirement Updated',
        description: `The requirement has been marked as ${status.toLowerCase()}.`
    });
  }

  const handleDelete = (id: string) => {
    const docRef = doc(firestore, 'study_requirements', id);
    deleteDocumentNonBlocking(docRef);
    toast({
        title: 'Requirement Deleted',
        description: `Your requirement has been successfully removed.`
    });
  }

  const isLoading = isTeacherLoading || areRequirementsLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Study Requirements" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {!isTeacher && !isTeacherLoading && (
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-2xl">
                    <PenSquare className="w-6 h-6" /> Post a Study Requirement
                    </CardTitle>
                    <CardDescription>Let teachers know what you need help with. Fill out the form below.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className='grid md:grid-cols-2 gap-4'>
                        <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Subject</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., Organic Chemistry" {...field} />
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
                                <Input placeholder="e.g., IIT JEE Advanced" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        </div>
                        <FormField
                            control={form.control}
                            name="classType"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Preferred Class Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select class type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Online">Online</SelectItem>
                                            <SelectItem value="Offline">Offline</SelectItem>
                                        </SelectContent>
                                    </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={isSubmitting || !user}>
                        {isSubmitting ? (
                            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
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
                <CardTitle className="font-headline text-2xl">{isTeacher ? "Open Student Requirements" : "Your Posted Requirements"}</CardTitle>
                <CardDescription>{isTeacher ? "Browse requirements posted by students and offer your help." : "Manage your posted study requirements."}</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : requirements && requirements.length > 0 ? (
                    <div className="space-y-4">
                        {requirements.map(req => (
                            <RequirementItem key={req.id} requirement={req} isTeacherView={isTeacher} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                        <p className='font-medium'>{isTeacher ? "No open requirements right now." : "You haven't posted any requirements yet."}</p>
                        <p className='text-sm'>{isTeacher ? "Check back later to find students who need your expertise." : "Use the form above to post a new requirement."}</p>
                    </div>
                )}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

    