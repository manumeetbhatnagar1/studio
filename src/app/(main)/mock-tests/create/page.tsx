'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { useState, useMemo } from 'react';
import { LoaderCircle, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; };
type Class = { id: string; name: string };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  questionIds: z.array(z.string()).min(1, 'You must select at least one question.'),
});


export default function CreateCustomTestPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isSubscribed, isLoading: isSubscribedLoading } = useIsSubscribed();

  // Data fetching for filters and questions
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  const questionsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'practice_questions')) : null, [firestore]);
  
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);
  const { data: allQuestions, isLoading: areQuestionsLoading } = useCollection<Question>(questionsQuery);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      accessLevel: 'free',
      duration: 60,
      questionIds: [],
    },
  });

  const selectedQuestionIds = form.watch('questionIds');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if(!user) return;
    setIsSubmitting(true);

    const customTestsRef = collection(firestore, 'users', user.uid, 'custom_tests');
    
    await addDocumentNonBlocking(customTestsRef, {
        studentId: user.uid,
        title: values.title,
        accessLevel: values.accessLevel,
        config: {
            questionIds: values.questionIds,
            duration: values.duration,
        },
        createdAt: serverTimestamp(),
    });
    
    toast({
      title: 'Custom Test Created!',
      description: `${values.title} has been saved.`,
    });
    router.push('/mock-tests');
    setIsSubmitting(false);
  }

  const isLoading = areSubjectsLoading || isSubscribedLoading || areClassesLoading || areTopicsLoading || areQuestionsLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Create a Custom Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">Design Your Test</CardTitle>
              <CardDescription>
                Build a personalized mock test by selecting questions from the question bank.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold">Test Title</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., My Weekly Physics & Math Practice" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField
                            control={form.control}
                            name="accessLevel"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="text-lg font-semibold">Question Access Level</FormLabel>
                                <FormDescription>
                                    Paid tests will only use paid questions from the question bank. You need a subscription to create paid tests.
                                </FormDescription>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex gap-4 pt-2"
                                    >
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl><RadioGroupItem value="free" /></FormControl>
                                        <FormLabel className="font-normal">Free</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl><RadioGroupItem value="paid" disabled={!isSubscribed} /></FormControl>
                                        <FormLabel className={cn("font-normal", !isSubscribed && "text-muted-foreground")}>
                                            Paid {!isSubscribed && ' (Subscription required)'}
                                        </FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="duration"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="text-lg font-semibold">Total Duration (minutes)</FormLabel>
                                <FormDescription>Set the total time limit for the entire test.</FormDescription>
                                <FormControl><Input type="number" placeholder="e.g., 180" {...field} /></FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    
                    <FormItem>
                        <FormLabel className="text-lg font-semibold">Questions</FormLabel>
                        <Card className='p-4'>
                            <div className='flex items-center justify-between'>
                                <p className='text-muted-foreground'>You have selected <span className='font-bold text-foreground'>{selectedQuestionIds.length}</span> question(s).</p>
                                <QuestionSelector
                                    allQuestions={allQuestions || []}
                                    classes={classes || []}
                                    subjects={subjects || []}
                                    topics={topics || []}
                                    selectedQuestionIds={selectedQuestionIds}
                                    setSelectedQuestionIds={(ids) => form.setValue('questionIds', ids, { shouldValidate: true })}
                                />
                            </div>
                        </Card>
                        <FormMessage>{form.formState.errors.questionIds?.message}</FormMessage>
                    </FormItem>

                    <Button type="submit" disabled={isSubmitting} size="lg">
                      {isSubmitting ? (
                        <><LoaderCircle className="mr-2 animate-spin" /> Saving Test...</>
                      ) : (
                        'Create and Save Test'
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function QuestionSelector({
    allQuestions,
    classes,
    subjects,
    topics,
    selectedQuestionIds,
    setSelectedQuestionIds
}: {
    allQuestions: Question[],
    classes: Class[],
    subjects: Subject[],
    topics: Topic[],
    selectedQuestionIds: string[],
    setSelectedQuestionIds: (ids: string[]) => void
}) {
    const [open, setOpen] = useState(false);
    const [classFilter, setClassFilter] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [topicFilter, setTopicFilter] = useState('');

    const filteredSubjects = useMemo(() => subjects.filter(s => s.classId === classFilter), [subjects, classFilter]);
    const filteredTopics = useMemo(() => topics.filter(t => t.subjectId === subjectFilter), [topics, subjectFilter]);
    
    const filteredQuestions = useMemo(() => {
        return allQuestions.filter(q => {
            if (topicFilter && q.topicId !== topicFilter) return false;
            if (subjectFilter && q.subjectId !== subjectFilter) return false;
            if (classFilter && q.classId !== classFilter) return false;
            return true;
        });
    }, [allQuestions, classFilter, subjectFilter, topicFilter]);

    const handleToggleQuestion = (questionId: string) => {
        const newIds = selectedQuestionIds.includes(questionId)
            ? selectedQuestionIds.filter(id => id !== questionId)
            : [...selectedQuestionIds, questionId];
        setSelectedQuestionIds(newIds);
    }
    
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline">Select Questions</Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-2xl w-full flex flex-col">
                <SheetHeader>
                    <SheetTitle>Select Practice Questions</SheetTitle>
                    <SheetDescription>Filter and select the questions to include in your test.</SheetDescription>
                </SheetHeader>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                    <Select value={classFilter} onValueChange={v => { setClassFilter(v); setSubjectFilter(''); setTopicFilter(''); }}>
                        <SelectTrigger><SelectValue placeholder="Filter by Class" /></SelectTrigger>
                        <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                     <Select value={subjectFilter} onValueChange={v => { setSubjectFilter(v); setTopicFilter(''); }} disabled={!classFilter}>
                        <SelectTrigger><SelectValue placeholder="Filter by Subject" /></SelectTrigger>
                        <SelectContent>{filteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                     <Select value={topicFilter} onValueChange={setTopicFilter} disabled={!subjectFilter}>
                        <SelectTrigger><SelectValue placeholder="Filter by Topic" /></SelectTrigger>
                        <SelectContent>{filteredTopics.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                
                <ScrollArea className="flex-grow border rounded-md p-4">
                    <div className="space-y-4">
                        {filteredQuestions.length > 0 ? filteredQuestions.map(q => (
                             <div key={q.id} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted">
                                <Checkbox
                                    id={q.id}
                                    checked={selectedQuestionIds.includes(q.id)}
                                    onCheckedChange={() => handleToggleQuestion(q.id)}
                                    className='mt-1'
                                />
                                <label htmlFor={q.id} className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {q.questionText}
                                </label>
                            </div>
                        )) : <p className='text-sm text-muted-foreground text-center py-8'>No questions match your filters.</p>}
                    </div>
                </ScrollArea>
                <SheetFooter className='pt-4'>
                    <div className='flex justify-between items-center w-full'>
                        <Badge variant="secondary">{selectedQuestionIds.length} question(s) selected</Badge>
                        <SheetClose asChild><Button>Done</Button></SheetClose>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
