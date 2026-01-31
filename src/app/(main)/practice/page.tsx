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
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useState } from 'react';
import { LoaderCircle, ClipboardList, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const questionSchema = z.object({
  questionText: z.string().min(10, 'Question must be at least 10 characters.'),
  answer: z.string().min(1, 'Answer is required.'),
  topicId: z.string().min(1, 'Topic is required.'),
  difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
});

type PracticeQuestion = {
  id: string;
  questionText: string;
  answer: string;
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  topicId: string;
};

function QuestionItem({ question }: { question: PracticeQuestion }) {
  const difficultyVariant = {
    'Easy': 'default',
    'Medium': 'secondary',
    'Hard': 'destructive',
  } as const;

  return (
    <AccordionItem value={question.id}>
      <AccordionTrigger>
        <div className="flex-1 text-left">
          <p className="font-medium">{question.questionText}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{question.topicId}</Badge>
            <Badge variant={difficultyVariant[question.difficultyLevel] || 'default'}>
              {question.difficultyLevel}
            </Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="prose prose-sm max-w-none text-card-foreground/90 bg-primary/5 p-4 rounded-md">
           <p className="font-semibold text-primary">Answer:</p>
           <p>{question.answer}</p>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}


export default function PracticePage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  const questionsCollectionRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'practice_questions'), orderBy('topicId'));
  }, [firestore]);

  const { data: questions, isLoading: areQuestionsLoading } = useCollection<PracticeQuestion>(questionsCollectionRef);

  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: { questionText: '', answer: '', topicId: '', difficultyLevel: 'Easy' },
  });

  const onSubmit = (values: z.infer<typeof questionSchema>) => {
    if (!isTeacher) {
      toast({ variant: 'destructive', title: 'Not Authorized', description: 'Only teachers can create questions.' });
      return;
    }
    setIsSubmitting(true);
    const questionsRef = collection(firestore, 'practice_questions');
    addDocumentNonBlocking(questionsRef, values);
    toast({
      title: 'Question Added!',
      description: 'The new practice question has been saved.',
    });
    form.reset();
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Practice Questions" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {isTeacher && (
             <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-2xl">
                    <PlusCircle className="w-6 h-6" /> Create New Question
                    </CardTitle>
                    <CardDescription>Add a new question to the question bank for students to practice.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                        control={form.control}
                        name="questionText"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Question</FormLabel>
                            <FormControl>
                                <Textarea placeholder="What is the formula for..." {...field} rows={4} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                         <FormField
                        control={form.control}
                        name="answer"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Answer</FormLabel>
                            <FormControl>
                                <Textarea placeholder="The correct answer is..." {...field} rows={4} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="topicId"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Topic</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Kinematics" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            <FormField
                                control={form.control}
                                name="difficultyLevel"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Difficulty</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select difficulty" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="Easy">Easy</SelectItem>
                                                <SelectItem value="Medium">Medium</SelectItem>
                                                <SelectItem value="Hard">Hard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                        </div>
                        <Button type="submit" disabled={isSubmitting || isTeacherLoading}>
                        {isSubmitting ? (
                            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                        ) : (
                            'Add Question'
                        )}
                        </Button>
                    </form>
                    </Form>
                </CardContent>
            </Card>
        )}

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2">
                    <ClipboardList className="w-6 h-6" /> All Practice Questions
                </CardTitle>
                <CardDescription>Browse the question bank. Click on a question to view the answer.</CardDescription>
            </CardHeader>
            <CardContent>
                {areQuestionsLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : questions && questions.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {questions.map(q => (
                            <QuestionItem key={q.id} question={q} />
                        ))}
                    </Accordion>
                ) : (
                    <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                        <p className='font-medium'>No practice questions available yet.</p>
                        <p className='text-sm'>{isTeacher ? 'Create one above to get started!' : 'Please check back later.'}</p>
                    </div>
                )}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}
