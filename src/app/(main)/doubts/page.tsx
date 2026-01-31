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
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import DashboardHeader from '@/components/dashboard-header';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, query, orderBy, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { LoaderCircle, MessageSquare, CornerDownRight, UserCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const doubtSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  topicId: z.string().min(1, 'Topic is required'),
});

const answerSchema = z.object({
    answer: z.string().min(10, 'Answer must be at least 10 characters'),
});

type Doubt = {
    id: string;
    studentId: string;
    studentName: string;
    question: string;
    topicId: string;
    createdAt: Timestamp;
    answer?: string;
};

function DoubtItem({ doubt, isTeacher }: { doubt: Doubt; isTeacher: boolean }) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const form = useForm<z.infer<typeof answerSchema>>({
        resolver: zodResolver(answerSchema),
        defaultValues: { answer: '' },
    });

    const handleAnswerSubmit = (values: z.infer<typeof answerSchema>) => {
        setIsSubmitting(true);
        const doubtRef = doc(firestore, 'doubts', doubt.id);
        updateDocumentNonBlocking(doubtRef, { answer: values.answer });
        toast({
            title: 'Answer Submitted',
            description: 'Your answer has been posted.',
        });
        form.reset();
        setIsSubmitting(false);
    };
    
    const userAvatar = PlaceHolderImages.find(img => img.id === 'user-avatar');

    return (
        <AccordionItem value={doubt.id}>
            <AccordionTrigger>
                <div className="flex items-center gap-4 text-left">
                    <Avatar>
                         {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt={doubt.studentName} data-ai-hint={userAvatar.imageHint} />}
                        <AvatarFallback>
                            {doubt.studentName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <p className="font-medium">{doubt.question}</p>
                        <p className="text-sm text-muted-foreground">
                            Asked by {doubt.studentName} about {doubt.topicId} &bull;{' '}
                            {formatDistanceToNow(doubt.createdAt.toDate(), { addSuffix: true })}
                        </p>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pl-16">
                {doubt.answer ? (
                    <div className="flex items-start gap-4 mt-4">
                        <CornerDownRight className="w-5 h-5 text-primary mt-1" />
                        <div className="flex-1 text-card-foreground/90 bg-primary/5 p-4 rounded-md">
                            <p className="font-semibold text-primary">Answer:</p>
                            <p>{doubt.answer}</p>
                        </div>
                    </div>
                ) : isTeacher ? (
                    <div className="mt-4">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleAnswerSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="answer"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Your Answer</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Explain the concept clearly..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                    Submit Answer
                                </Button>
                            </form>
                        </Form>
                    </div>
                ) : (
                    <p className="text-muted-foreground italic">No answer yet. A teacher will respond soon.</p>
                )}
            </AccordionContent>
        </AccordionItem>
    );
}

export default function DoubtsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  const doubtsCollectionRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'doubts'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const { data: doubts, isLoading: areDoubtsLoading } = useCollection<Doubt>(doubtsCollectionRef);

  const form = useForm<z.infer<typeof doubtSchema>>({
    resolver: zodResolver(doubtSchema),
    defaultValues: { question: '', topicId: '' },
  });

  const onSubmit = (values: z.infer<typeof doubtSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to ask a doubt.' });
      return;
    }
    setIsSubmitting(true);
    const doubtsRef = collection(firestore, 'doubts');
    addDocumentNonBlocking(doubtsRef, {
      ...values,
      studentId: user.uid,
      studentName: user.displayName || 'Anonymous Student',
      createdAt: serverTimestamp(),
      answer: '',
    });
    toast({
      title: 'Doubt Submitted!',
      description: 'Your doubt has been posted for our teachers to see.',
    });
    form.reset();
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Doubts" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline text-2xl">
              <MessageSquare className="w-6 h-6" /> Ask a Doubt
            </CardTitle>
            <CardDescription>Have a doubt? Post it here and get it cleared by our expert instructors.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="question"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Doubt</FormLabel>
                      <FormControl>
                        <Textarea placeholder="e.g., How does Lenz's Law work?" {...field} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="topicId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Topic</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Electromagnetism" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={isSubmitting || !user}>
                  {isSubmitting ? (
                    <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><Send className="mr-2 h-4 w-4" /> Post Doubt</>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Recent Doubts</CardTitle>
                <CardDescription>Browse previously asked doubts and answers.</CardDescription>
            </CardHeader>
            <CardContent>
                {(areDoubtsLoading || isTeacherLoading) ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : doubts && doubts.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {doubts.map(doubt => (
                            <DoubtItem key={doubt.id} doubt={doubt} isTeacher={isTeacher} />
                        ))}
                    </Accordion>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <p>No doubts have been posted yet. Be the first one!</p>
                    </div>
                )}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
