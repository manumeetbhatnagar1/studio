'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, useDoc, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, documentId, where } from 'firebase/firestore';
import { useState, useMemo, useEffect } from 'react';
import { LoaderCircle, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useParams } from 'next/navigation';
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

type Question = { id: string; questionText: string; classId: string; subjectId: string; topicId: string; };
type Class = { id: string; name: string };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; subjectId: string };
type ExamType = { id: string; name: string; };

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  startTime: z.date(),
  examTypeId: z.string().min(1, 'Please select an exam type.'),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  questionIds: z.array(z.string()).min(1, 'You must select at least one question.'),
});

type OfficialTest = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  examTypeId: string;
  accessLevel: 'free' | 'paid';
  config: {
    questionIds: string[];
    duration: number;
  };
}

export default function EditOfficialMockTestPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const { testId } = useParams() as { testId: string };
  const [isSubmitting, setIsSubmitting] = useState(false);

  const testDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'mock_tests', testId);
  }, [firestore, testId]);

  const { data: testData, isLoading: isTestLoading } = useDoc<OfficialTest>(testDocRef);

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
      questionIds: [],
    },
  });

  useEffect(() => {
    if (testData) {
      form.reset({
        title: testData.title,
        startTime: testData.startTime.toDate(),
        examTypeId: testData.examTypeId,
        accessLevel: testData.accessLevel,
        duration: testData.config.duration,
        questionIds: testData.config.questionIds || [],
      });
    }
  }, [testData, form]);

  const selectedQuestionIds = form.watch('questionIds');
  
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!testDocRef) return;
    setIsSubmitting(true);

    try {
      await updateDocumentNonBlocking(testDocRef, {
        title: values.title,
        startTime: values.startTime,
        examTypeId: values.examTypeId,
        accessLevel: values.accessLevel,
        config: {
          questionIds: values.questionIds,
          duration: values.duration,
        },
      });

      toast({
        title: 'Official Test Updated!',
        description: `${values.title} has been saved.`,
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

  const isLoading = isTestLoading || areSubjectsLoading || areClassesLoading || areTopicsLoading || areQuestionsLoading || areExamTypesLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Edit Official Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">Edit Official Test</CardTitle>
              <CardDescription>
                Update the configuration for this official mock test.
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
                                        const newDateTime = new Date(
                                          selectedDate.getFullYear(),
                                          selectedDate.getMonth(),
                                          selectedDate.getDate(),
                                          currentDateTime.getHours(),
                                          currentDateTime.getMinutes()
                                        );
                                        field.onChange(newDateTime);
                                      }}
                                      initialFocus
                                  />
                                  <div className="p-3 border-t border-border flex items-center justify-center gap-2">
                                    <Select
                                        value={field.value ? String(field.value.getHours()).padStart(2, '0') : '09'}
                                        onValueChange={(hour) => {
                                            const currentDateTime = field.value || new Date();
                                            const newDateTime = new Date(
                                                currentDateTime.getFullYear(),
                                                currentDateTime.getMonth(),
                                                currentDateTime.getDate(),
                                                parseInt(hour, 10),
                                                currentDateTime.getMinutes()
                                            );
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
                                            const currentDateTime = field.value || new Date();
                                            const newDateTime = new Date(
                                                currentDateTime.getFullYear(),
                                                currentDateTime.getMonth(),
                                                currentDateTime.getDate(),
                                                currentDateTime.getHours(),
                                                parseInt(minute, 10)
                                            );
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
                            <FormItem><FormLabel className="text-lg font-semibold">Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{(examTypes || []).map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
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
                                    value={field.value}
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
                    <SheetDescription>Filter and select the questions to include in the test.</SheetDescription>
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
