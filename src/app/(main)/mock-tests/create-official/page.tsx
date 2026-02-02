'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useState, useMemo } from 'react';
import { LoaderCircle, PlusCircle, CalendarIcon, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; accessLevel: 'free' | 'paid' };
type Class = { id: string; name: string };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };
type ExamType = { id: string; name: string; };

const subjectConfigSchema = z.object({
  subjectId: z.string().min(1, 'Please select a subject.'),
  numQuestions: z.coerce.number().int().min(1, 'Must be at least 1 question.'),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  startTime: z.date().refine((date) => date > new Date(), { message: 'Start time must be in the future.' }),
  examTypeId: z.string().min(1, 'Please select an exam type.'),
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


export default function CreateOfficialMockTestPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data fetching for filters and questions
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
      examTypeId: '',
      accessLevel: 'free',
      duration: 180,
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const mockTestsRef = collection(firestore, 'mock_tests');
      
      await addDocumentNonBlocking(mockTestsRef, {
          title: values.title,
          startTime: values.startTime,
          examTypeId: values.examTypeId,
          accessLevel: values.accessLevel,
          config: {
              questionIds: values.questionIds,
              duration: values.duration,
              totalQuestions: values.totalQuestions,
              subjectConfigs: values.subjectConfigs,
          },
      });
      
      toast({
        title: 'Official Test Created!',
        description: `${values.title} has been scheduled.`,
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

  const isLoading = areSubjectsLoading || areClassesLoading || areTopicsLoading || areQuestionsLoading || areExamTypesLoading;
  
  const availableSubjects = useMemo(() => {
    const selectedSubjectIds = subjectConfigs.map(c => c.subjectId);
    return (subjects || []).filter(s => !selectedSubjectIds.includes(s.id));
  }, [subjects, subjectConfigs]);


  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Create an Official Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">New Official Test</CardTitle>
              <CardDescription>
                Build a mock test for all students by selecting questions from the question bank.
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
                            <Input placeholder="e.g., JEE Advanced Full Syllabus Test - 1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField control={form.control} name="startTime" render={({ field }) => (
                          <FormItem className="flex flex-col"><FormLabel className="text-lg font-semibold">Start Time</FormLabel>
                              <Popover><PopoverTrigger asChild>
                                  <FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                      {field.value ? format(field.value, "PPP HH:mm") : <span>Pick a date and time</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button></FormControl>
                              </PopoverTrigger><PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={(selectedDate) => {
                                        if (!selectedDate) {
                                          field.onChange(undefined);
                                          return;
                                        }
                                        const currentDateTime = field.value || new Date();
                                        const newDateTime = new Date(selectedDate);
                                        newDateTime.setHours(currentDateTime.getHours());
                                        newDateTime.setMinutes(currentDateTime.getMinutes());
                                        field.onChange(newDateTime);
                                      }}
                                      disabled={(date) => date < new Date()}
                                      initialFocus
                                  />
                                  <div className="p-3 border-t border-border flex items-center justify-center gap-2">
                                    <Select
                                        value={field.value ? String(field.value.getHours()).padStart(2, '0') : '09'}
                                        onValueChange={(hour) => {
                                            const newDateTime = new Date(field.value || new Date());
                                            newDateTime.setHours(parseInt(hour, 10));
                                            field.onChange(newDateTime);
                                        }}
                                    >
                                        <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <span className="font-bold">:</span>
                                    <Select
                                        value={field.value ? String(field.value.getMinutes()).padStart(2, '0') : '00'}
                                         onValueChange={(minute) => {
                                            const newDateTime = new Date(field.value || new Date());
                                            newDateTime.setMinutes(parseInt(minute, 10));
                                            field.onChange(newDateTime);
                                        }}
                                    >
                                        <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>{['00', '15', '30', '45'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                              </PopoverContent></Popover>
                          <FormMessage /></FormItem>
                      )} />
                       <FormField control={form.control} name="examTypeId" render={({ field }) => (
                            <FormItem><FormLabel className="text-lg font-semibold">Exam Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{(examTypes || []).map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                        )} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <FormField
                            control={form.control}
                            name="accessLevel"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="text-lg font-semibold">Access Level</FormLabel>
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
                                        <FormControl><RadioGroupItem value="paid" /></FormControl>
                                        <FormLabel className="font-normal">Paid</FormLabel>
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
                                <FormControl><Input type="number" placeholder="e.g., 180" {...field} /></FormControl>
                                <FormMessage /></FormItem>
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
                                <p className='text-muted-foreground'>You have selected <span className='font-bold text-foreground'>{selectedQuestionIds.length} / {form.getValues('totalQuestions') || 0}</span> question(s).</p>
                                <FormMessage>{form.formState.errors.questionIds?.message}</FormMessage>
                                </div>
                                <QuestionSelector
                                    allQuestions={allQuestions || []}
                                    accessLevel={form.watch('accessLevel')}
                                    classes={classes || []}
                                    subjects={subjects || []}
                                    topics={topics || []}
                                    selectedQuestionIds={selectedQuestionIds}
                                    setSelectedQuestionIds={(ids) => form.setValue('questionIds', ids, { shouldValidate: true })}
                                    totalLimit={form.watch('totalQuestions')}
                                    subjectLimits={form.watch('subjectConfigs')}
                                />
                            </div>
                        </Card>
                    </FormItem>

                    <Button type="submit" disabled={isSubmitting} size="lg">
                      {isSubmitting ? (
                        <><LoaderCircle className="mr-2 animate-spin" /> Scheduling Test...</>
                      ) : (
                        'Schedule Official Test'
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
    accessLevel,
    classes,
    subjects,
    topics,
    selectedQuestionIds,
    setSelectedQuestionIds,
    totalLimit,
    subjectLimits,
}: {
    allQuestions: Question[],
    accessLevel: 'free' | 'paid',
    classes: Class[],
    subjects: Subject[],
    topics: Topic[],
    selectedQuestionIds: string[],
    setSelectedQuestionIds: (ids: string[]) => void,
    totalLimit: number,
    subjectLimits: { subjectId: string, numQuestions: number }[]
}) {
    const [open, setOpen] = useState(false);
    const [classFilter, setClassFilter] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [topicFilter, setTopicFilter] = useState('');
    const { toast } = useToast();

    const filteredSubjects = useMemo(() => subjects.filter(s => s.classId === classFilter), [subjects, classFilter]);
    const filteredTopics = useMemo(() => topics.filter(t => t.subjectId === subjectFilter), [topics, subjectFilter]);
    
    const subjectQuestionCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for(const qId of selectedQuestionIds) {
            const question = allQuestions.find(q => q.id === qId);
            if (question) {
                counts[question.subjectId] = (counts[question.subjectId] || 0) + 1;
            }
        }
        return counts;
    }, [selectedQuestionIds, allQuestions]);

    const filteredQuestions = useMemo(() => {
        return allQuestions.filter(q => {
            if (q.accessLevel !== accessLevel) return false;
            if (topicFilter && q.topicId !== topicFilter) return false;
            if (subjectFilter && q.subjectId !== subjectFilter) return false;
            if (classFilter && q.classId !== classFilter) return false;
            return true;
        });
    }, [allQuestions, classFilter, subjectFilter, topicFilter, accessLevel]);

    const handleToggleQuestion = (question: Question) => {
        const isSelected = selectedQuestionIds.includes(question.id);
        
        if (isSelected) {
            setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== question.id));
        } else {
            if ((totalLimit > 0) && selectedQuestionIds.length >= totalLimit) {
                toast({ variant: 'destructive', title: "Total question limit reached", description: `You cannot select more than ${totalLimit} questions.`});
                return;
            }

            const subjectLimitConfig = subjectLimits.find(sl => sl.subjectId === question.subjectId);
            if (subjectLimitConfig) {
                const currentSubjectCount = subjectQuestionCounts[question.subjectId] || 0;
                if (currentSubjectCount >= subjectLimitConfig.numQuestions) {
                    toast({ variant: 'destructive', title: "Subject question limit reached", description: `You cannot select more questions for this subject.`});
                    return;
                }
            } else {
                 toast({ variant: 'destructive', title: "Invalid Subject", description: `This question's subject is not part of the test configuration.`});
                return;
            }

            setSelectedQuestionIds([...selectedQuestionIds, question.id]);
        }
    }
    
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline">Select Questions</Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-2xl w-full flex flex-col">
                <SheetHeader>
                    <SheetTitle>Select Practice Questions</SheetTitle>
                    <SheetDescription>Filter and select the questions to include in your test. Limits will be enforced.</SheetDescription>
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
                        {filteredQuestions.length > 0 ? filteredQuestions.map(q => {
                             const subjectLimit = subjectLimits.find(sl => sl.subjectId === q.subjectId);
                             const subjectCount = subjectQuestionCounts[q.subjectId] || 0;
                             const isSubjectLimitReached = subjectLimit && subjectCount >= subjectLimit.numQuestions;
                             const isTotalLimitReached = (totalLimit > 0) && selectedQuestionIds.length >= totalLimit;
                             const isSelected = selectedQuestionIds.includes(q.id);
                             const isDisabled = !isSelected && (isTotalLimitReached || isSubjectLimitReached || !subjectLimit);
                            
                            return (
                             <div key={q.id} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted">
                                <Checkbox
                                    id={`q-sel-${q.id}`}
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleQuestion(q)}
                                    disabled={isDisabled}
                                    className='mt-1'
                                />
                                <label htmlFor={`q-sel-${q.id}`} className={cn("flex-1 text-sm font-medium leading-none", isDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
                                    {q.questionText}
                                </label>
                            </div>
                        )}) : <p className='text-sm text-muted-foreground text-center py-8'>No questions match your filters.</p>}
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
