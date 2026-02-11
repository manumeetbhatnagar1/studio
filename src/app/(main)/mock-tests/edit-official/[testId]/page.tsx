

'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, useDoc } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { collection, query, orderBy, where, getDocs, doc } from 'firebase/firestore';
import { useState, useMemo, useEffect } from 'react';
import { LoaderCircle, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useParams } from 'next/navigation';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

type PracticeQuestion = { id: string; subjectId: string; examTypeId: string; accessLevel: 'free' | 'paid', tags?: string[]; };
type ExamType = { id: string; name: string; };
type Subject = { id: string; name: string; };
type MockTest = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  examTypeId: string;
  accessLevel: 'free' | 'paid';
  config: {
    questionIds: string[];
    duration: number;
    totalQuestions: number;
    marksPerQuestion: number;
    negativeMarksPerQuestion: number;
    subjectConfigs: { subjectId: string, numQuestions: number }[];
  };
};

const subjectConfigSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  numQuestions: z.coerce.number().min(1, "Must be > 0"),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  startTime: z.coerce.date().refine((date) => date > new Date(), { message: 'Start time must be in the future.' }),
  accessLevel: z.enum(['free', 'paid']),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.'),
  marksPerQuestion: z.coerce.number().min(0, 'Marks cannot be negative.'),
  negativeMarksPerQuestion: z.coerce.number().min(0, 'Negative marks cannot be negative.'),
  examTypeId: z.string().min(1, 'Please select an exam type.'),
  officialTag: z.string().min(1, 'Please provide a tag to filter questions.'),
  subjectConfigs: z.array(subjectConfigSchema).min(1, 'Please select at least one subject configuration.'),
});


export default function EditOfficialTestPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const { testId } = useParams() as { testId: string };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  const testDocRef = useMemoFirebase(() => {
    if (!firestore || !testId) return null;
    return doc(firestore, 'mock_tests', testId);
  }, [firestore, testId]);
  const { data: testData, isLoading: isTestLoading } = useDoc<MockTest>(testDocRef);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { subjectConfigs: [] },
  });

  const { control, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "subjectConfigs"
  });

  const selectedExamTypeId = watch('examTypeId');
  const officialTag = watch('officialTag');

  // Data fetching
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const questionsQuery = useMemoFirebase(() => {
    if (!firestore || !officialTag) return null;
    return query(collection(firestore, 'practice_questions'), where('tags', 'array-contains', officialTag));
  }, [firestore, officialTag]);
  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
  
  const { data: allSubjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: officialQuestions, isLoading: areQuestionsLoading } = useCollection<PracticeQuestion>(questionsQuery);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);


  useEffect(() => {
    if (testData && allSubjects) {
        form.reset({
            title: testData.title,
            startTime: testData.startTime.toDate(),
            accessLevel: testData.accessLevel,
            duration: testData.config.duration,
            marksPerQuestion: testData.config.marksPerQuestion,
            negativeMarksPerQuestion: testData.config.negativeMarksPerQuestion,
            examTypeId: testData.examTypeId,
            officialTag: 'official-test', // Default tag, as it's not stored in the test object
            subjectConfigs: testData.config.subjectConfigs.map(sc => ({
                ...sc,
                subjectName: allSubjects.find(s => s.id === sc.subjectId)?.name || 'Unknown'
            }))
        });
    }
  }, [testData, allSubjects, form]);
  
  useEffect(() => {
    if (form.formState.isSubmitted) { // Prevent reset on initial load
        remove();
    }
  }, [selectedExamTypeId, remove, form.formState.isSubmitted]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!testDocRef) return;
    setIsSubmitting(true);
    
    let finalQuestionIds: string[] = [];
    let questionSelectionError = false;

    const availableQuestions = (officialQuestions || []).filter(q => 
        q.examTypeId === values.examTypeId && q.accessLevel === values.accessLevel
    );

    for (const config of values.subjectConfigs) {
        const subjectQuestions = availableQuestions.filter(q => q.subjectId === config.subjectId);
        
        if (subjectQuestions.length < config.numQuestions) {
            toast({
                variant: 'destructive',
                title: 'Not Enough Questions',
                description: `Subject "${config.subjectName}" only has ${subjectQuestions.length} official questions for the selected filters, but you requested ${config.numQuestions}.`,
            });
            questionSelectionError = true;
            break; 
        }

        const shuffled = [...subjectQuestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, config.numQuestions);
        finalQuestionIds.push(...selected.map(q => q.id));
    }

    if (questionSelectionError) {
        setIsSubmitting(false);
        return;
    }

    const totalQuestions = values.subjectConfigs.reduce((acc, curr) => acc + curr.numQuestions, 0);

    if (finalQuestionIds.length !== totalQuestions) {
        toast({ variant: 'destructive', title: 'Question Selection Error', description: 'Could not gather the correct number of questions. Please check your configuration.' });
        setIsSubmitting(false);
        return;
    }
    
    try {
      await updateDocumentNonBlocking(testDocRef, {
          title: values.title,
          startTime: values.startTime,
          examTypeId: values.examTypeId,
          accessLevel: values.accessLevel,
          config: {
              questionIds: finalQuestionIds,
              duration: values.duration,
              totalQuestions: totalQuestions,
              marksPerQuestion: values.marksPerQuestion,
              negativeMarksPerQuestion: values.negativeMarksPerQuestion,
              subjectConfigs: values.subjectConfigs.map(({ subjectId, numQuestions }) => ({ subjectId, numQuestions })),
          },
      });
      
      toast({
        title: 'Official Test Updated!',
        description: `"${values.title}" has been updated.`,
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

  const isLoading = isTeacherLoading || isAdminLoading || areSubjectsLoading || areQuestionsLoading || areExamTypesLoading || isTestLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Edit Official Mock Test" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"><Skeleton className="h-96 w-full" /></main>
      </div>
    );
  }

  if (!isTeacher && !isAdmin) {
    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Access Denied" />
            <main className="flex-1 flex items-center justify-center p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2 text-destructive"><AlertTriangle/> Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>You do not have permission to edit official mock tests. Please contact an administrator.</p>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Edit Official Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">Edit Test Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <div className="space-y-4">
                      <FormField control={form.control} name="title" render={({ field }) => (
                          <FormItem><FormLabel className="text-lg font-semibold">Test Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <FormField control={form.control} name="startTime" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel className="font-semibold">Start Date & Time</FormLabel><FormControl>
                                    <Input type="datetime-local" value={field.value ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ''} onChange={(e) => field.onChange(new Date(e.target.value))} min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} />
                                </FormControl><FormMessage /></FormItem>
                           )} />
                           <FormField control={form.control} name="examTypeId" render={({ field }) => (
                                <FormItem><FormLabel className="font-semibold">Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Exam Type" /></SelectTrigger></FormControl><SelectContent>{(examTypes || []).map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                           )} />
                       </div>
                       <FormField control={form.control} name="officialTag" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-semibold">Official Question Tag</FormLabel>
                                <FormDescription>Enter the tag used to identify questions for this test.</FormDescription>
                                <FormControl><Input placeholder="e.g., official-test" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                      <h3 className="text-lg font-semibold">Scoring & Duration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FormField control={form.control} name="duration" render={({ field }) => (
                              <FormItem><FormLabel>Duration (minutes)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="marksPerQuestion" render={({ field }) => (
                              <FormItem><FormLabel>Marks per Question</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="negativeMarksPerQuestion" render={({ field }) => (
                              <FormItem><FormLabel>Negative Marks</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="accessLevel" render={({ field }) => (
                            <FormItem className="col-span-full"><FormLabel>Access Level</FormLabel><FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="paid" /></FormControl><FormLabel className="font-normal">Paid</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl></FormItem>
                        )} />
                      </div>
                  </div>

                  <div className="space-y-4">
                      <FormLabel className="text-lg font-semibold">Test Structure</FormLabel>
                       {fields.map((field, index) => (
                           <div key={field.id} className="flex items-end gap-2 p-2 border rounded-md">
                               <FormField control={form.control} name={`subjectConfigs.${index}.subjectId`} render={({ field }) => (
                                    <FormItem className="flex-1"><FormLabel>Subject</FormLabel><Select onValueChange={(value) => {
                                        field.onChange(value);
                                        const subjectName = allSubjects?.find(s => s.id === value)?.name || '';
                                        form.setValue(`subjectConfigs.${index}.subjectName`, subjectName);
                                    }} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger></FormControl>
                                    <SelectContent>{(allSubjects || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                )} />
                               <FormField control={form.control} name={`subjectConfigs.${index}.numQuestions`} render={({ field }) => (
                                    <FormItem className="w-48"><FormLabel>No. of Questions</FormLabel><FormControl><Input type="number" placeholder="e.g., 25" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>
                           </div>
                       ))}
                       <Button type="button" variant="outline" onClick={() => append({ subjectId: '', subjectName: '', numQuestions: 25 })}>
                           Add Subject Section
                       </Button>
                       <FormField control={form.control} name="subjectConfigs" render={() => <FormItem><FormMessage /></FormItem>} />
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
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
