'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, useUser } from '@/firebase';
import { collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { useState, useMemo } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';


type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; accessLevel: 'free' | 'paid', examTypeId: string, difficultyLevel: 'Easy' | 'Medium' | 'Hard' };
type Class = { id: string; name: string; examTypeId: string };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };
type ExamType = { id: string; name: string; };

const topicConfigSchema = z.object({
  topicId: z.string(),
  topicName: z.string(),
  count: z.coerce.number().min(1, "Must be > 0"),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  marksPerQuestion: z.coerce.number().min(0, 'Marks cannot be negative.'),
  negativeMarksPerQuestion: z.coerce.number().min(0, 'Negative marks cannot be negative.'),
  examTypeId: z.string().optional(),
  difficultyLevel: z.enum(['Easy', 'Medium', 'Hard', 'All']),
  topicsConfig: z.array(topicConfigSchema).min(1, 'Please select at least one topic.'),
});


export default function CreateCustomTestPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isSubscribed, isLoading: isSubscribedLoading } = useIsSubscribed();
  
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
      marksPerQuestion: 4,
      negativeMarksPerQuestion: 1,
      examTypeId: '',
      difficultyLevel: 'All',
      topicsConfig: [],
    },
  });

  const { control, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "topicsConfig"
  });
  
  const accessLevelFilter = watch('accessLevel');
  const examTypeIdFilter = watch('examTypeId');
  const difficultyLevelFilter = watch('difficultyLevel');

  const curriculumTree = useMemo(() => {
    if (!classes || !subjects || !topics) return [];

    const filteredClasses = examTypeIdFilter
      ? classes.filter(c => c.examTypeId === examTypeIdFilter)
      : classes;

    return filteredClasses.map(c => ({
      ...c,
      subjects: subjects
        .filter(s => s.classId === c.id)
        .map(s => ({
          ...s,
          topics: topics.filter(t => t.subjectId === s.id),
        }))
        .filter(s => s.topics.length > 0),
    })).filter(c => c.subjects.length > 0);
  }, [classes, subjects, topics, examTypeIdFilter]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if(!user) return;
    
    setIsSubmitting(true);
    
    const finalQuestionIds: string[] = [];
    let questionSelectionError = false;

    const availableQuestions = (allQuestions || []).filter(q => {
        if (q.accessLevel !== values.accessLevel) return false;
        if (values.examTypeId && q.examTypeId !== values.examTypeId) return false;
        if (values.difficultyLevel !== 'All' && q.difficultyLevel !== values.difficultyLevel) return false;
        return true;
    });

    for (const config of values.topicsConfig) {
        const topicQuestions = availableQuestions.filter(q => q.topicId === config.topicId);
        
        if (topicQuestions.length < config.count) {
            toast({
                variant: 'destructive',
                title: 'Not Enough Questions',
                description: `Topic "${config.topicName}" only has ${topicQuestions.length} questions for your filters, but you requested ${config.count}.`,
            });
            questionSelectionError = true;
            break; 
        }

        const shuffled = [...topicQuestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, config.count);
        finalQuestionIds.push(...selected.map(q => q.id));
    }

    if (questionSelectionError) {
        setIsSubmitting(false);
        return;
    }
    
    if (finalQuestionIds.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Questions Found',
        description: 'Your topic selection and filters did not yield any questions. Please adjust your criteria.',
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const customTestsRef = collection(firestore, 'users', user.uid, 'custom_tests');
      
      await addDocumentNonBlocking(customTestsRef, {
          studentId: user.uid,
          title: values.title,
          accessLevel: values.accessLevel,
          examTypeId: values.examTypeId || null,
          config: {
              questionIds: finalQuestionIds,
              duration: values.duration,
              marksPerQuestion: values.marksPerQuestion,
              negativeMarksPerQuestion: values.negativeMarksPerQuestion,
          },
          createdAt: serverTimestamp(),
      });
      
      toast({
        title: 'Custom Test Created!',
        description: `${values.title} has been saved with ${finalQuestionIds.length} questions.`,
      });
      router.push('/mock-tests');
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Submission Failed',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const handleTopicToggle = (topic: { id: string; name: string }, isChecked: boolean) => {
    const index = fields.findIndex(field => field.topicId === topic.id);
    if (isChecked && index === -1) {
        append({ topicId: topic.id, topicName: topic.name, count: 5 });
    } else if (!isChecked && index !== -1) {
        remove(index);
    }
  };

  const isLoading = areSubjectsLoading || isSubscribedLoading || areClassesLoading || areTopicsLoading || areQuestionsLoading || areExamTypesLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Create a Custom Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">Design Your Test</CardTitle>
              <CardDescription>
                Build a personalized mock test by selecting topics from the curriculum.
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FormField control={form.control} name="duration" render={({ field }) => (
                              <FormItem><FormLabel className="font-semibold">Duration (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g., 180" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="marksPerQuestion" render={({ field }) => (
                              <FormItem><FormLabel className="font-semibold">Marks per Question</FormLabel><FormControl><Input type="number" placeholder="e.g., 4" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="negativeMarksPerQuestion" render={({ field }) => (
                              <FormItem><FormLabel className="font-semibold">Negative Marks</FormLabel><FormControl><Input type="number" placeholder="e.g., 1" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
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
                    
                    <div className="space-y-4">
                        <FormLabel className="text-lg font-semibold">Selected Topics & Question Count</FormLabel>
                        {fields.length > 0 ? (
                            <Card>
                                <CardContent className="p-4 space-y-4 max-h-60 overflow-y-auto">
                                    {fields.map((field, index) => (
                                    <div key={field.id} className="flex items-center justify-between gap-4 p-2 rounded-md bg-muted/50">
                                        <span className="font-medium text-sm flex-1">{field.topicName}</span>
                                        <div className="flex items-center gap-2">
                                        <Label htmlFor={`topicsConfig.${index}.count`} className="text-sm">Questions:</Label>
                                        <FormField
                                            control={form.control}
                                            name={`topicsConfig.${index}.count`}
                                            render={({ field: countField }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Input
                                                        id={`topicsConfig.${index}.count`}
                                                        type="number"
                                                        min="1"
                                                        className="w-20 h-8"
                                                        {...countField}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(index)}>
                                        <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    ))}
                                </CardContent>
                                <CardFooter>
                                    <p className="text-sm text-muted-foreground">
                                    Total questions: {form.watch('topicsConfig').reduce((acc, curr) => acc + (Number(curr.count) || 0), 0)}
                                    </p>
                                </CardFooter>
                            </Card>
                        ) : (
                            <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded-md">
                            Select topics from the curriculum below.
                            </div>
                        )}
                        <FormField control={form.control} name="topicsConfig" render={() => <FormItem><FormMessage /></FormItem>} />
                    </div>

                    {/* Topic Selector */}
                    <div className="space-y-4">
                        <FormLabel className="text-lg font-semibold">Select Topics from Curriculum</FormLabel>
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
                                                                <Checkbox id={t.id} onCheckedChange={(checked) => handleTopicToggle(t, !!checked)} checked={fields.some(f => f.topicId === t.id)}/>
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
                        </Card>
                    </div>

                    <Button type="submit" disabled={isSubmitting} size="lg">
                      {isSubmitting ? (
                        <><LoaderCircle className="mr-2 animate-spin" /> Creating Test...</>
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
