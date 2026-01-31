'use client';

import { useState, useMemo, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatDistanceToNow } from 'date-fns';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy, serverTimestamp, doc } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, LoaderCircle, MessageSquare, User, HelpCircle, CheckCircle } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';

// Data types
type Doubt = {
  id: string;
  studentId: string;
  studentName: string;
  studentPhotoUrl?: string;
  teacherId?: string;
  teacherName?: string;
  teacherPhotoUrl?: string;
  topicId: string;
  question: string;
  answer?: string;
  status: 'open' | 'answered' | 'closed';
  createdAt: Timestamp;
};

// Zod schema for the doubt form
const doubtSchema = z.object({
  topicId: z.string().min(1, 'Please enter a topic.'),
  question: z.string().min(20, 'Your question must be at least 20 characters long.'),
});

// Component for the "Ask a Doubt" form
const AskDoubtForm: FC<{ setOpen: (open: boolean) => void }> = ({ setOpen }) => {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof doubtSchema>>({
    resolver: zodResolver(doubtSchema),
    defaultValues: { topicId: '', question: '' },
  });

  function onSubmit(values: z.infer<typeof doubtSchema>) {
    if (!user) return;
    setIsSubmitting(true);
    
    const doubtsRef = collection(firestore, 'doubts');
    addDocumentNonBlocking(doubtsRef, {
      ...values,
      studentId: user.uid,
      studentName: user.displayName || 'Anonymous Student',
      studentPhotoUrl: user.photoURL || '',
      status: 'open',
      createdAt: serverTimestamp(),
    });

    toast({ title: 'Doubt Submitted!', description: 'An expert will answer your question soon.' });
    form.reset();
    setOpen(false);
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="topicId" render={({ field }) => (
          <FormItem>
            <FormLabel>Topic</FormLabel>
            <FormControl>
                <Input placeholder="e.g., Kinematics, Thermodynamics" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="question" render={({ field }) => (
          <FormItem>
            <FormLabel>Your Question</FormLabel>
            <FormControl><Textarea placeholder="Describe your doubt in detail..." {...field} rows={6} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : <>Submit Doubt</>}
        </Button>
      </form>
    </Form>
  );
};

// Component to handle answering a doubt
const AnswerForm: FC<{ doubt: Doubt }> = ({ doubt }) => {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleAnswerSubmit = () => {
    if (!user || answer.trim().length < 20) {
        toast({ variant: 'destructive', title: 'Answer is too short', description: 'Please provide a detailed answer.' });
        return;
    }
    setIsSubmitting(true);
    const doubtRef = doc(firestore, 'doubts', doubt.id);
    updateDocumentNonBlocking(doubtRef, {
      answer: answer,
      status: 'answered',
      teacherId: user.uid,
      teacherName: user.displayName || 'Expert Teacher',
      teacherPhotoUrl: user.photoURL || '',
    });
    toast({ title: 'Answer Submitted!', description: 'The student has been notified.' });
    setIsSubmitting(false);
  }

  return (
    <div className="mt-4 space-y-4 rounded-md border bg-muted/50 p-4">
        <h4 className="font-semibold">Provide an Answer</h4>
        <Textarea 
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your detailed answer here..."
            rows={5}
        />
        <Button onClick={handleAnswerSubmit} disabled={isSubmitting}>
            {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Posting...</> : <>Post Answer</>}
        </Button>
    </div>
  );
}

// Main component for the Doubts page
export default function DoubtsPage() {
  const { user } = useUser();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const firestore = useFirestore();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const doubtsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'doubts'), orderBy('createdAt', 'desc')) : null, [firestore]);

  const { data: doubts, isLoading: areDoubtsLoading } = useCollection<Doubt>(doubtsQuery);

  const filteredDoubts = useMemo(() => {
    if (!doubts) return { open: [], answered: [], myDoubts: [] };
    const myDoubts = user ? doubts.filter(d => d.studentId === user.uid) : [];
    return {
      open: doubts.filter(d => d.status === 'open'),
      answered: doubts.filter(d => d.status === 'answered' || d.status === 'closed'),
      myDoubts: myDoubts,
    };
  }, [doubts, user]);
  
  const isLoading = areDoubtsLoading || isTeacherLoading;

  const getStatus = (doubt: Doubt) => {
    switch (doubt.status) {
      case 'open':
        return <Badge variant="destructive"><HelpCircle className="mr-1 h-3 w-3" />Open</Badge>;
      case 'answered':
        return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Answered</Badge>;
      case 'closed':
         return <Badge variant="secondary">Closed</Badge>;
    }
  };

  const renderDoubtList = (doubtList: Doubt[]) => {
    if (isLoading) {
        return <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
        </div>;
    }
    if (doubtList.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No doubts here.</p>;
    }
    return (
        <Accordion type="single" collapsible className="w-full space-y-4">
            {doubtList.map(doubt => (
                <AccordionItem value={doubt.id} key={doubt.id} className="border rounded-lg bg-card">
                    <AccordionTrigger className="p-4 text-left hover:no-underline">
                        <div className="flex-1 space-y-2">
                             <p className="font-semibold">{doubt.question}</p>
                             <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6"><AvatarImage src={doubt.studentPhotoUrl} /><AvatarFallback><User className="h-4 w-4" /></AvatarFallback></Avatar>
                                    <span>{doubt.studentName}</span>
                                </div>
                                <span>{doubt.createdAt && formatDistanceToNow(doubt.createdAt.toDate(), { addSuffix: true })}</span>
                                {getStatus(doubt)}
                             </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 pt-0">
                       <div className="prose prose-sm max-w-none border-t pt-4">
                           {doubt.answer ? (
                            <>
                                <div className="flex items-center gap-2 mb-2">
                                    <Avatar className="h-8 w-8"><AvatarImage src={doubt.teacherPhotoUrl} /><AvatarFallback>T</AvatarFallback></Avatar>
                                    <div>
                                        <p className="font-semibold">{doubt.teacherName || 'Expert Teacher'}</p>
                                        <p className="text-xs text-muted-foreground">Answered</p>
                                    </div>
                                </div>
                                <p>{doubt.answer}</p>
                            </>
                           ) : isTeacher ? (
                               <AnswerForm doubt={doubt} />
                           ) : (
                               <p className="italic text-muted-foreground">An expert is looking into your question. Please check back later for an answer.</p>
                           )}
                       </div>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
  };
  
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Doubt Resolution" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
         <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><MessageSquare /> Doubts Forum</CardTitle>
                    <CardDescription>Ask questions and get answers from our expert teachers.</CardDescription>
                </div>
                {!isTeacher && (
                    <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                        <DialogTrigger asChild>
                            <Button><PlusCircle className="mr-2"/>Ask a New Doubt</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Ask a New Doubt</DialogTitle>
                                <DialogDescription>Our experts will get back to you shortly.</DialogDescription>
                            </DialogHeader>
                            <AskDoubtForm setOpen={setIsFormOpen} />
                        </DialogContent>
                    </Dialog>
                )}
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="open">
                    <TabsList>
                        <TabsTrigger value="open">Open</TabsTrigger>
                        <TabsTrigger value="answered">Answered</TabsTrigger>
                        {!isTeacher && <TabsTrigger value="my-doubts">My Doubts</TabsTrigger>}
                    </TabsList>
                    <TabsContent value="open" className="pt-4">{renderDoubtList(filteredDoubts.open)}</TabsContent>
                    <TabsContent value="answered" className="pt-4">{renderDoubtList(filteredDoubts.answered)}</TabsContent>
                    {!isTeacher && <TabsContent value="my-doubts" className="pt-4">{renderDoubtList(filteredDoubts.myDoubts)}</TabsContent>}
                </Tabs>
            </CardContent>
         </Card>
      </main>
    </div>
  );
}
