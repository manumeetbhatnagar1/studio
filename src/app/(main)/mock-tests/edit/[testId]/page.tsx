'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useState, useMemo, useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useParams } from 'next/navigation';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; accessLevel: 'free' | 'paid', examTypeId: string, difficultyLevel: 'Easy' | 'Medium' | 'Hard' };
type Class = { id: string; name: string; };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };
type ExamType = { id: string; name: string; };

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  examTypeId: z.string().optional(),
  difficultyLevel: z.enum(['Easy', 'Medium', 'Hard', 'All']),
});

type CustomTest = {
  id: string;
  title: string;
  accessLevel: 'free' | 'paid';
  examTypeId: string;
  config: {
      questionIds: string[];
      duration: number;
  };
}


export default function EditCustomMockTestPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const { testId } = useParams() as { testId: string };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isSubscribed, isLoading: isSubscribedLoading } = useIsSubscribed();
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const testDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid, 'custom_tests', testId);
  }, [firestore, user, testId]);

  const { data: testData, isLoading: isTestLoading } = useDoc<CustomTest>(testDocRef);
  
  // Data fetching
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  const questionsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'practice_questions')) : null, [firestore]);
  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);

  
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);
  const { data: allQuestions, isLoading: areQuestionsLoading } = useCollection<Question>(questionsQuery);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      accessLevel: 'free',
      duration: 60,
      examTypeId: '',
      difficultyLevel: 'All',
    },
  });

  useEffect(() => {
    if (testData && allQuestions) {
      form.reset({
        title: testData.title,
        accessLevel: testData.accessLevel,
        duration: testData.config.duration,
        examTypeId: testData.examTypeId || '',
        difficultyLevel: 'All', // We don't store difficulty in the test itself
      });
      
      const topicIdsFromQuestions = new Set(
        testData.config.questionIds
          .map(qId => allQuestions.find(q => q.id === qId)?.topicId)
          .filter((id): id is string => !!id)
      );
      setSelectedTopics(Array.from(topicIdsFromQuestions));
    }
  }, [testData, allQuestions, form]);

  const { watch } = form;
  const accessLevelFilter = watch('accessLevel');
  const examTypeIdFilter = watch('examTypeId');
  const difficultyLevelFilter = watch('difficultyLevel');

  const curriculumTree = useMemo(() => {
    if (!classes || !subjects || !topics) return [];

    return classes.map(c => ({
      ...c,
      subjects: subjects
        .filter(s => s.classId === c.id)
        .map(s => ({
          ...s,
          topics: topics.filter(t => t.subjectId === s.id),
        })),
    }));
  }, [classes, subjects, topics]);

  const filteredQuestions = useMemo(() => {
    if (!allQuestions) return [];
    return allQuestions.filter(q => {
      if (!selectedTopics.includes(q.topicId)) return false;
      if (q.accessLevel !== accessLevelFilter) return false;
      if (examTypeIdFilter && q.examTypeId !== examTypeIdFilter) return false;
      if (difficultyLevelFilter !== 'All' && q.difficultyLevel !== difficultyLevelFilter) return false;
      return true;
    });
  }, [allQuestions, selectedTopics, accessLevelFilter, examTypeIdFilter, difficultyLevelFilter]);


  async function onSubmit(values: z.infer<typeof formSchema>) {
    if(!user || !testDocRef) return;

    if (filteredQuestions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Questions Found',
        description: 'Your new selection and filters did not match any questions. Please adjust your criteria.',
      });
      return;
    }
    
    setIsSubmitting(true);

    try {
        const questionIds = filteredQuestions.map(q => q.id);
        
        await updateDocumentNonBlocking(testDocRef, {
            title: values.title,
            accessLevel: values.accessLevel,
            examTypeId: values.examTypeId || null,
            config: {
                questionIds,
                duration: values.duration,
            },
        });
        
        toast({
          title: 'Custom Test Updated!',
          description: `${values.title} has been saved with ${questionIds.length} questions.`,
        });
        router.push('/mock-tests');
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const handleTopicToggle = (topicId: string, isChecked: boolean) => {
    setSelectedTopics(prev => isChecked ? [...prev, topicId] : prev.filter(id => id !== topicId));
  }

  const isLoading = areSubjectsLoading || isSubscribedLoading || isTestLoading || areClassesLoading || areTopicsLoading || areQuestionsLoading || areExamTypesLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Edit Custom Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">Edit Your Test</CardTitle>
              <CardDescription>
                Update the configuration for your personalized mock test.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <FormField control={form.control} name="title" render={({ field }) => (
                            <FormItem><FormLabel className="text-lg font-semibold">Test Title</FormLabel><FormControl><Input placeholder="e.g., My Weekly Physics & Math Practice" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="duration" render={({ field }) => (
                            <FormItem><FormLabel className="text-lg font-semibold">Total Duration (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g., 180" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>

                    {/* Filters */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <h3 className="text-lg font-semibold">Filter Questions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField control={form.control} name="accessLevel" render={({ field }) => (
                                <FormItem><FormLabel>Access Level</FormLabel><FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="paid" disabled={!isSubscribed} /></FormControl><FormLabel className={cn("font-normal", !isSubscribed && "text-muted-foreground")}>Paid {!isSubscribed && ' (Pro)'}</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl></FormItem>
                            )} />
                             <FormField control={form.control} name="examTypeId" render={({ field }) => (
                                <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="All Exam Types" /></SelectTrigger></FormControl><SelectContent>{(examTypes || []).map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select></FormItem>
                            )} />
                            <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                                <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select></FormItem>
                            )} />
                        </div>
                    </div>
                    
                    {/* Topic Selector */}
                    <div className="space-y-4">
                        <FormLabel className="text-lg font-semibold">Select Topics</FormLabel>
                        <FormDescription>Choose one or more topics to include in your test.</FormDescription>
                        <Card>
                            <CardContent className='p-4 max-h-96 overflow-y-auto'>
                                <Accordion type="multiple" className="w-full">
                                    {curriculumTree.map(c => (
                                    <AccordionItem value={c.id} key={c.id}>
                                        <AccordionTrigger>{c.name}</AccordionTrigger>
                                        <AccordionContent>
                                        <Accordion type="multiple" className="w-full pl-4">
                                            {c.subjects.map(s => (
                                            <AccordionItem value={s.id} key={s.id}>
                                                <AccordionTrigger>{s.name}</AccordionTrigger>
                                                <AccordionContent className='pl-4'>
                                                    <div className="space-y-2">
                                                        {s.topics.map(t => (
                                                            <div key={t.id} className="flex items-center space-x-2">
                                                                <Checkbox id={t.id} onCheckedChange={(checked) => handleTopicToggle(t.id, !!checked)} checked={selectedTopics.includes(t.id)}/>
                                                                <label htmlFor={t.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t.name}</label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                            ))}
                                        </Accordion>
                                        </AccordionContent>
                                    </AccordionItem>
                                    ))}
                                </Accordion>
                            </CardContent>
                            <CardFooter>
                                <Badge>Selected Questions: {filteredQuestions.length}</Badge>
                            </CardFooter>
                        </Card>
                    </div>

                    <Button type="submit" disabled={isSubmitting} size="lg">
                      {isSubmitting ? (
                        <><LoaderCircle className="mr-2 animate-spin" /> Saving Changes...</>
                      ) : (
                        'Save Changes'
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
