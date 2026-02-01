'use client';

import { useForm, useFieldArray } from 'react-hook-form';
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
import { LoaderCircle, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; accessLevel: 'free' | 'paid' };
type Class = { id: string; name: string };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };

const subjectConfigSchema = z.object({
  subjectId: z.string().min(1, 'Please select a subject.'),
  numQuestions: z.coerce.number().int().min(1, 'Must be at least 1 question.'),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  totalQuestions: z.coerce.number().int().min(1, 'Total questions must be at least 1.'),
  subjectConfigs: z.array(subjectConfigSchema).min(1, 'At least one subject must be configured.'),
  questionIds: z.array(z.string()),
}).refine(data => {
    const totalFromSubjects = data.subjectConfigs.reduce((sum, config) => sum + config.numQuestions, 0);
    return totalFromSubjects === data.totalQuestions;
}, {
    message: 'The sum of questions from each subject must equal the total number of questions.',
    path: ['totalQuestions'],
}).refine(data => data.questionIds.length === data.totalQuestions, {
    message: 'The number of selected questions must match the total questions configured.',
    path: ['questionIds'],
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
      totalQuestions: 0,
      subjectConfigs: [],
      questionIds: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "subjectConfigs"
  });

  const selectedQuestionIds = form.watch('questionIds');
  const subjectConfigs = form.watch('subjectConfigs');

  const handleAutoSelect = () => {
    const { subjectConfigs, accessLevel, totalQuestions } = form.getValues();

    if (!subjectConfigs || subjectConfigs.length === 0 || !totalQuestions || totalQuestions === 0) {
      toast({
        variant: 'destructive',
        title: 'Incomplete Configuration',
        description: 'Please define the total questions and subject structure first.',
      });
      return;
    }
    
    const sumOfSubjectQs = subjectConfigs.reduce((acc, c) => acc + c.numQuestions, 0);
    if (sumOfSubjectQs !== totalQuestions) {
            toast({
            variant: 'destructive',
            title: 'Configuration Mismatch',
            description: 'The sum of questions per subject does not match the total questions.',
        });
        return;
    }

    const availableQuestions = (allQuestions || []).filter(
      q => q.accessLevel === accessLevel
    );

    const questionsBySubject: Record<string, Question[]> = {};
    availableQuestions.forEach(q => {
      if (!questionsBySubject[q.subjectId]) {
        questionsBySubject[q.subjectId] = [];
      }
      questionsBySubject[q.subjectId].push(q);
    });

    let selectedIds: string[] = [];
    let possible = true;

    for (const config of subjectConfigs) {
      const subjectQuestionPool = questionsBySubject[config.subjectId] || [];
      if (subjectQuestionPool.length < config.numQuestions) {
        const subject = subjects?.find(s => s.id === config.subjectId);
        toast({
          variant: 'destructive',
          title: 'Not Enough Questions',
          description: `Not enough questions available for ${subject?.name || 'the selected subject'}. Found ${subjectQuestionPool.length}, need ${config.numQuestions}.`,
        });
        possible = false;
        break;
      }

      // Shuffle and pick, ensuring no duplicates if this function is ever called multiple times
      const shuffled = [...subjectQuestionPool].filter(q => !selectedIds.includes(q.id)).sort(() => 0.5 - Math.random());
      const selectedForSubject = shuffled.slice(0, config.numQuestions).map(q => q.id);
      selectedIds.push(...selectedForSubject);
    }
    
    const finalIds = [...new Set(selectedIds)];

    if (possible) {
        if(finalIds.length !== totalQuestions) {
             toast({
                variant: 'destructive',
                title: 'Selection Error',
                description: `Could only select ${finalIds.length} out of ${totalQuestions} questions. Please check question availability.`,
            });
            form.setValue('questionIds', finalIds, { shouldValidate: true });
        } else {
            form.setValue('questionIds', finalIds, { shouldValidate: true });
            toast({
                title: 'Questions Auto-Selected',
                description: `${finalIds.length} questions have been automatically selected for your test.`,
            });
        }
    }
  };

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
            totalQuestions: values.totalQuestions,
            subjectConfigs: values.subjectConfigs,
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
  
  const availableSubjects = useMemo(() => {
    const selectedSubjectIds = subjectConfigs.map(c => c.subjectId);
    return (subjects || []).filter(s => !selectedSubjectIds.includes(s.id));
  }, [subjects, subjectConfigs]);


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
                                    Paid tests will only use paid questions from the question bank.
                                </FormDescription>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={(value) => {
                                        field.onChange(value);
                                        form.setValue('questionIds', []); // Reset questions on change
                                    }}
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

                     <div>
                        <FormLabel className="text-lg font-semibold">Test Structure</FormLabel>
                        <FormDescription>Define the subjects and number of questions for your test.</FormDescription>
                        <div className="space-y-4 pt-4">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="totalQuestions" render={({ field }) => (
                                    <FormItem><FormLabel>Total Questions</FormLabel><FormControl><Input type="number" placeholder="e.g., 90" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl><FormMessage /></FormItem>
                                )} />
                             </div>
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-end gap-2 p-4 border rounded-lg bg-muted/50">
                                    <FormField control={form.control} name={`subjectConfigs.${index}.subjectId`} render={({ field }) => (
                                        <FormItem className="flex-1"><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger></FormControl><SelectContent>{availableSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name={`subjectConfigs.${index}.numQuestions`} render={({ field }) => (
                                        <FormItem><FormLabel># of Qs</FormLabel><FormControl><Input type="number" className="w-24" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <Button variant="ghost" size="icon" type="button" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                            ))}
                             <Button type="button" variant="outline" size="sm" onClick={() => append({ subjectId: '', numQuestions: 10 })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Subject
                            </Button>
                        </div>
                    </div>
                    
                    <FormItem>
                        <FormLabel className="text-lg font-semibold">Question Selection</FormLabel>
                        <Card className='p-4'>
                            <div className='flex items-center justify-between'>
                                <div>
                                <p className='text-muted-foreground'>Selected <span className='font-bold text-foreground'>{selectedQuestionIds.length} / {form.getValues('totalQuestions') || 0}</span> question(s).</p>
                                <FormDescription>
                                    Click "Auto-select" to randomly fill the test with questions based on your structure.
                                </FormDescription>
                                <FormMessage>{form.formState.errors.questionIds?.message}</FormMessage>
                                </div>
                                <Button type="button" variant="secondary" onClick={handleAutoSelect}>Auto-select Questions</Button>
                            </div>
                        </Card>
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
