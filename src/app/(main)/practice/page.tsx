'use client';

import Link from 'next/link';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useState, useMemo, useEffect, FC } from 'react';
import { LoaderCircle, ClipboardList, PlusCircle, CheckCircle, Lock, Edit2, Trash2, Rocket, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import PdfQuestionExtractor from '@/components/pdf-question-extractor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';


const baseSchema = z.object({
    questionText: z.string().min(10, 'Question must be at least 10 characters.'),
    imageUrls: z.array(z.string().url()).optional(),
    explanationImageUrls: z.array(z.string().url()).optional(),
    classId: z.string().min(1, 'Class is required.'),
    subjectId: z.string().min(1, 'Subject is required.'),
    topicId: z.string().min(1, 'Topic is required.'),
    difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
    examTypeId: z.string().min(1, 'Exam Type is required.'),
    accessLevel: z.enum(['free', 'paid']),
});

const mcqSchema = baseSchema.extend({
    questionType: z.literal('MCQ'),
    options: z.array(z.string().min(1, "Option cannot be empty.")).length(4, "You must provide 4 options."),
    correctAnswer: z.string().min(1, "Please select the correct answer."),
});

const numericalSchema = baseSchema.extend({
    questionType: z.literal('Numerical'),
    numericalAnswer: z.coerce.number({ required_error: 'A numerical answer is required.' }),
});

const questionSchema = z.discriminatedUnion("questionType", [
    mcqSchema,
    numericalSchema
]).superRefine((data, ctx) => {
    if (data.questionType === 'MCQ') {
        if (data.options && !data.options.includes(data.correctAnswer)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Correct answer must match one of the options.",
                path: ['correctAnswer'],
            });
        }
    }
});

const practiceQuizSchema = z.object({
    topicsConfig: z.array(z.object({
        topicId: z.string(),
        topicName: z.string(),
        count: z.coerce.number().min(1, "Must be > 0"),
    })).min(1, 'Please select at least one topic.'),
    difficultyLevel: z.string().optional(),
    accessLevel: z.enum(['free', 'paid']),
});

type PracticeQuestion = {
  id: string;
  questionText: string;
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  examTypeId: string,
  classId: string;
  subjectId: string;
  topicId: string;
  imageUrls?: string[];
  explanationImageUrls?: string[];
  questionType: 'MCQ' | 'Numerical';
  options?: string[];
  correctAnswer?: string;
  numericalAnswer?: number;
  accessLevel: 'free' | 'paid';
};
type Class = { id: string; name: string; examTypeId: string; };
type Subject = { id: string; name: string; classId: string; };
type Topic = { id: string; name: string; subjectId: string; };
type ExamType = { id: string; name: string; };


function QuestionItem({ question, topicMap, classMap, examTypeMap, isTeacher, canViewPaidContent, onEdit, onDelete }: { question: PracticeQuestion; topicMap: Record<string, string>; classMap: Record<string, string>; examTypeMap: Record<string, string>; isTeacher: boolean; canViewPaidContent: boolean; onEdit: (question: PracticeQuestion) => void, onDelete: (questionId: string) => void }) {
  const difficultyVariant = {
    'Easy': 'default',
    'Medium': 'secondary',
    'Hard': 'destructive',
  } as const;

  const isLocked = question.accessLevel === 'paid' && !canViewPaidContent;

  return (
    <AccordionItem value={question.id}>
      <div className="flex items-center">
        <AccordionTrigger className="flex-1" disabled={isLocked}>
          <div className="flex-1 text-left">
            <p className="font-medium">{question.questionText}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline">{classMap[question.classId] || 'Unknown Class'}</Badge>
              <Badge variant="outline">{examTypeMap[question.examTypeId] || 'Unknown Exam'}</Badge>
              <Badge variant="outline">{topicMap[question.topicId] || 'Unknown Topic'}</Badge>
              <Badge variant={difficultyVariant[question.difficultyLevel] || 'default'}>
                {question.difficultyLevel}
              </Badge>
              <Badge variant="secondary">{question.questionType}</Badge>
              {question.accessLevel === 'free' && <Badge variant="secondary">Free</Badge>}
            </div>
          </div>
        </AccordionTrigger>
        {isLocked && <Lock className="h-4 w-4 mr-4 text-muted-foreground" />}
        {isTeacher && (
          <div className="flex items-center gap-1 pr-2">
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(question); }}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(question.id); }}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>
      <AccordionContent>
        {isLocked ? (
            <div className="text-center text-muted-foreground py-4">
                <Lock className="mx-auto h-6 w-6 mb-2"/>
                <p>This is a premium question. <Link href="/subscription" className="text-primary hover:underline">Subscribe</Link> to view the answer.</p>
            </div>
        ) : (
          <>
            {isTeacher ? (
              <>
                {question.imageUrls && question.imageUrls.length > 0 && (
                  <div className="my-4 space-y-2">
                      <p className="font-semibold text-sm text-muted-foreground">Question Image(s):</p>
                      <div className="flex flex-col gap-2">
                          {question.imageUrls.map((url, index) => (
                              <div key={index} className="p-2 border rounded-md flex justify-center bg-muted/50">
                                  <Image
                                      src={url}
                                      alt={`Question image ${index + 1}`}
                                      width={1000}
                                      height={750}
                                      className="rounded-md object-contain"
                                  />
                              </div>
                          ))}
                      </div>
                  </div>
                )}
                {question.explanationImageUrls && question.explanationImageUrls.length > 0 && (
                  <div className="my-4 space-y-2">
                    <p className="font-semibold text-sm text-muted-foreground">Explanation Image(s):</p>
                    <div className="flex flex-col gap-2">
                      {question.explanationImageUrls.map((url, index) => (
                          <div key={index} className="p-2 border rounded-md flex justify-center bg-muted/50">
                            <Image
                              src={url}
                              alt={`Explanation image ${index + 1}`}
                              width={1000}
                              height={750}
                              className="rounded-md object-contain"
                            />
                          </div>
                      ))}
                    </div>
                  </div>
                )}
                {question.questionType === 'MCQ' && question.options ? (
                  <div className="prose prose-sm max-w-none text-card-foreground/90 bg-primary/5 p-4 rounded-md space-y-2">
                    <p className="font-semibold text-primary">Options:</p>
                    <ul className='list-disc pl-5 space-y-1'>
                      {question.options.map((option, index) => (
                        <li key={index} className={cn(option === question.correctAnswer && "font-bold text-primary")}>
                          {option}
                          {option === question.correctAnswer && <CheckCircle className="inline-block ml-2 h-4 w-4" />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : question.questionType === 'Numerical' ? (
                  <div className="prose prose-sm max-w-none text-card-foreground/90 bg-primary/5 p-4 rounded-md space-y-2">
                    <p className="font-semibold text-primary">Correct Answer:</p>
                    <p className="font-bold text-2xl">{question.numericalAnswer}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                <p>To see the answer, start a practice session for this topic.</p>
              </div>
            )}
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

const EditQuestionForm: FC<{
  questionToEdit: PracticeQuestion,
  classes: Class[],
  subjects: Subject[],
  topics: Topic[],
  examTypes: ExamType[],
  onFinished: () => void,
}> = ({ questionToEdit, classes, subjects, topics, examTypes, onFinished }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof questionSchema>>({
        resolver: zodResolver(questionSchema),
    });

    useEffect(() => {
      if (!questionToEdit || !topics || !subjects || !classes) return;
      const initialTopic = topics.find(t => t.id === questionToEdit.topicId);
      const initialSubject = subjects.find(s => s.id === initialTopic?.subjectId);
      const initialClass = classes.find(c => c.id === initialSubject?.classId);
      const initialExamTypeId = initialClass?.examTypeId || '';
      form.reset({ ...questionToEdit, examTypeId: initialExamTypeId, classId: initialClass?.id || '' });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questionToEdit]);

    const { fields } = useFieldArray({ control: form.control, name: "options" });
    
    const { watch, setValue } = form;
    const questionType = watch('questionType');
    const selectedExamType = watch('examTypeId');
    const selectedClass = watch('classId');
    const selectedSubject = watch('subjectId');

    const filteredClasses = useMemo(() => {
        if (!selectedExamType || !classes) return [];
        return classes.filter(c => c.examTypeId === selectedExamType);
    }, [selectedExamType, classes]);
    
    const filteredSubjects = useMemo(() => {
        if (!selectedClass || !subjects) return [];
        return subjects.filter(subject => subject.classId === selectedClass);
    }, [selectedClass, subjects]);

    const filteredTopics = useMemo(() => {
        if (!selectedSubject || !topics) return [];
        return topics.filter(topic => topic.subjectId === selectedSubject);
    }, [selectedSubject, topics]);

    useEffect(() => {
      setValue('classId', '');
      setValue('subjectId', '');
      setValue('topicId', '');
    }, [selectedExamType, setValue]);

    useEffect(() => {
        setValue('subjectId', '');
        setValue('topicId', '');
    }, [selectedClass, setValue]);
    
    useEffect(() => {
        setValue('topicId', '');
    }, [selectedSubject, setValue]);

    const onSubmit = (values: z.infer<typeof questionSchema>) => {
        setIsSubmitting(true);
        const questionRef = doc(firestore, 'practice_questions', questionToEdit.id);
        
        updateDocumentNonBlocking(questionRef, values);
        toast({
          title: 'Question Updated!',
          description: 'The practice question has been successfully updated.',
        });
        setIsSubmitting(false);
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto p-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="questionType" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Question Type</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={(value) => { field.onChange(value);
                                    if (value === 'MCQ') { form.reset({ ...form.getValues(), numericalAnswer: undefined, options: ['', '', '', ''], correctAnswer: '' });
                                    } else { form.reset({ ...form.getValues(), options: undefined, correctAnswer: undefined }); }
                                }} defaultValue={field.value} className="flex flex-row space-x-4">
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="MCQ" /></FormControl><FormLabel className="font-normal">Multiple Choice</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Numerical" /></FormControl><FormLabel className="font-normal">Numerical Answer</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="accessLevel" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Access Level</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-row space-x-4">
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="paid" /></FormControl><FormLabel className="font-normal">Paid</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="questionText" render={({ field }) => (<FormItem><FormLabel>Question Text</FormLabel><FormControl><Textarea placeholder="e.g., What is the formula for..." {...field} rows={4} /></FormControl><FormMessage /></FormItem>)} />
                
                <div className="space-y-2">
                    <FormLabel>Question Images (Optional)</FormLabel>
                    <div className="flex flex-col gap-4">
                        {form.watch('imageUrls')?.map((url, index) => (
                            <div key={index} className="relative group">
                                <Image src={url} alt={`Question image ${index + 1}`} width={200} height={150} className="rounded-md object-cover border" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={() => {
                                        const currentUrls = form.getValues('imageUrls') || [];
                                        form.setValue('imageUrls', currentUrls.filter((_, i) => i !== index));
                                    }}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <FormLabel>Explanation Images (Optional)</FormLabel>
                    <div className="flex flex-col gap-4">
                        {form.watch('explanationImageUrls')?.map((url, index) => (
                            <div key={index} className="relative group">
                                <Image src={url} alt={`Explanation image ${index + 1}`} width={200} height={150} className="rounded-md object-cover border" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={() => {
                                        const currentUrls = form.getValues('explanationImageUrls') || [];
                                        form.setValue('explanationImageUrls', currentUrls.filter((_, i) => i !== index));
                                    }}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                {questionType === 'MCQ' && (
                    <div className="space-y-4">
                        <FormLabel>Options & Correct Answer</FormLabel>
                        <FormField control={form.control} name="correctAnswer" render={({ field }) => (
                            <FormItem className='space-y-0'><FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {fields.map((item, index) => (<FormField key={item.id} control={form.control} name={`options.${index}`} render={({ field: optionField }) => (<FormItem className="flex items-center gap-2 space-y-0 rounded-md border p-4 has-[:checked]:border-primary"><FormControl><RadioGroupItem value={optionField.value} disabled={!optionField.value} /></FormControl><Input {...optionField} placeholder={`Option ${index + 1}`} className="border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0" /><FormMessage className="col-span-2"/></FormItem>)} />))}
                                </RadioGroup>
                            </FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                )}
                {questionType === 'Numerical' && (<FormField control={form.control} name="numericalAnswer" render={({ field }) => (<FormItem><FormLabel>Correct Numerical Answer</FormLabel><FormControl><Input type="number" placeholder="e.g., 42" {...field} onChange={event => field.onChange(+event.target.value)} /></FormControl><FormMessage /></FormItem>)} />)}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <FormField control={form.control} name="examTypeId" render={({ field }) => (
                        <FormItem><FormLabel>Exam Type</FormLabel>
                            <Select onValueChange={(value) => {
                                field.onChange(value);
                                form.setValue('classId', '');
                                form.setValue('subjectId', '');
                                form.setValue('topicId', '');
                            }} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                                <SelectContent>{examTypes?.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="classId" render={({ field }) => (
                        <FormItem><FormLabel>Class</FormLabel>
                            <Select onValueChange={(value) => {
                                field.onChange(value);
                                form.setValue('subjectId', '');
                                form.setValue('topicId', '');
                            }} value={field.value} disabled={!selectedExamType}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                                <SelectContent>{filteredClasses?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="subjectId" render={({ field }) => (
                        <FormItem><FormLabel>Subject</FormLabel>
                            <Select onValueChange={(value) => {
                                field.onChange(value);
                                form.setValue('topicId', '');
                            }} value={field.value} disabled={!selectedClass}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl>
                                <SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="topicId" render={({ field }) => (
                        <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                        <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                </div>

                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : ('Save Changes')}</Button>
            </form>
        </Form>
    );
}

const StartPracticeForm: FC<{
  curriculumTree: any[],
  isSubscribed: boolean,
}> = ({ curriculumTree, isSubscribed }) => {
    const router = useRouter();
    const form = useForm<z.infer<typeof practiceQuizSchema>>({
        resolver: zodResolver(practiceQuizSchema),
        defaultValues: {
            topicsConfig: [],
            difficultyLevel: 'All',
            accessLevel: 'free',
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "topicsConfig"
    });

    function onSubmit(values: z.infer<typeof practiceQuizSchema>) {
        const params = new URLSearchParams();
        const topicsParam = values.topicsConfig.map(tc => `${tc.topicId}:${tc.count}`).join(',');
        params.append('topics', topicsParam);
        
        if (values.difficultyLevel) {
            params.append('difficultyLevel', values.difficultyLevel);
        }
        params.append('accessLevel', values.accessLevel);

        router.push(`/practice/session?${params.toString()}`);
    }
    
    const handleTopicToggle = (topic: { id: string; name: string }, isChecked: boolean) => {
        const index = fields.findIndex(field => field.topicId === topic.id);
        if (isChecked && index === -1) {
            append({ topicId: topic.id, topicName: topic.name, count: 5 });
        } else if (!isChecked && index !== -1) {
            remove(index);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4 rounded-lg border p-4">
                  <h3 className="text-base font-semibold">Filters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                          <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="All">All Difficulties</SelectItem><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select></FormItem>
                      )} />
                      <FormField control={form.control} name="accessLevel" render={({ field }) => (
                          <FormItem><FormLabel>Access Level</FormLabel><FormControl>
                              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex pt-2">
                                  <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                  <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="paid" disabled={!isSubscribed} /></FormControl><FormLabel className={cn("font-normal", !isSubscribed && "text-muted-foreground")}>Paid {!isSubscribed && "(Pro)"}</FormLabel></FormItem>
                              </RadioGroup>
                          </FormControl></FormItem>
                      )} />
                  </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-semibold">Select Topics</Label>
                    <FormDescription>Choose one or more topics for your practice session.</FormDescription>
                    <Card>
                        <CardContent className='p-4 max-h-96 overflow-y-auto'>
                            <Accordion type="multiple" className="w-full">
                                {curriculumTree.map(et => (
                                <AccordionItem value={et.id} key={et.id}>
                                    <AccordionTrigger>{et.name}</AccordionTrigger>
                                    <AccordionContent>
                                    <Accordion type="multiple" className="w-full pl-4">
                                        {et.classes.map((c:any) => (
                                        <AccordionItem value={c.id} key={c.id}>
                                            <AccordionTrigger>{c.name}</AccordionTrigger>
                                            <AccordionContent>
                                            <Accordion type="multiple" className="w-full pl-4" defaultValue={c.subjects.map((s:any) => s.id)}>
                                                {c.subjects.map((s:any) => (
                                                <AccordionItem value={s.id} key={s.id}>
                                                    <AccordionTrigger>{s.name}</AccordionTrigger>
                                                    <AccordionContent className='pl-4'>
                                                        <div className="space-y-2">
                                                            {s.topics.map((t:any) => (
                                                                <div key={t.id} className="flex items-center space-x-2">
                                                                    <Checkbox id={`practice-${t.id}`} onCheckedChange={(checked) => handleTopicToggle(t, !!checked)} checked={fields.some(f => f.topicId === t.id)}/>
                                                                    <label htmlFor={`practice-${t.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t.name}</label>
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
                                    </AccordionContent>
                                </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Label className="text-base font-semibold">Selected Topics & Question Count</Label>
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
                        Select topics from the curriculum above.
                        </div>
                    )}
                    <FormField
                        control={form.control}
                        name="topicsConfig"
                        render={() => (
                        <FormItem>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>


                <Button type="submit"><Rocket className="mr-2 h-4 w-4" /> Start Practice Session</Button>
            </form>
        </Form>
    );
};


export default function PracticePage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const { isSubscribed, isLoading: isSubscribedLoading } = useIsSubscribed();
  const [editingQuestion, setEditingQuestion] = useState<PracticeQuestion | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [questionPdfFile, setQuestionPdfFile] = useState<File | null>(null);
  const [explanationPdfFile, setExplanationPdfFile] = useState<File | null>(null);
  const [questionPdfPage, setQuestionPdfPage] = useState(1);
  const [explanationPdfPage, setExplanationPdfPage] = useState(1);

  const questionsCollectionRef = useMemoFirebase(() => firestore ? query(collection(firestore, 'practice_questions'), orderBy('topicId')) : null, [firestore]);
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);

  const { data: questions, isLoading: areQuestionsLoading } = useCollection<PracticeQuestion>(questionsCollectionRef);
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);
  
  const topicMap = useMemo(() => {
    if (!topics) return {};
    return topics.reduce((acc, topic) => {
      acc[topic.id] = topic.name;
      return acc;
    }, {} as Record<string, string>);
  }, [topics]);
  
  const classMap = useMemo(() => {
    if (!classes) return {};
    return classes.reduce((acc, c) => {
      acc[c.id] = c.name;
      return acc;
    }, {} as Record<string, string>);
  }, [classes]);

  const examTypeMap = useMemo(() => {
    if (!examTypes) return {};
    return examTypes.reduce((acc, et) => {
      acc[et.id] = et.name;
      return acc;
    }, {} as Record<string, string>);
  }, [examTypes]);

  const questionTree = useMemo(() => {
    if (!examTypes || !classes || !subjects || !topics || !questions) return [];
    
    return examTypes.map(et => ({
      ...et,
      classes: classes
        .filter(c => c.examTypeId === et.id)
        .map(c => ({
          ...c,
          subjects: subjects
            .filter(s => s.classId === c.id)
            .map(s => ({
              ...s,
              topics: topics
                .filter(t => t.subjectId === s.id)
                .map(topic => ({
                  ...topic,
                  questions: questions.filter(q => q.topicId === topic.id)
                }))
                .filter(t => t.questions.length > 0)
            }))
            .filter(s => s.topics.length > 0)
        }))
        .filter(c => c.subjects.length > 0)
    })).filter(et => et.classes.length > 0);
  }, [examTypes, classes, subjects, topics, questions]);
  
  const curriculumTree = useMemo(() => {
    if (!examTypes || !classes || !subjects || !topics) return [];

    const sortedExamTypes = [...examTypes].sort((a,b) => a.name.localeCompare(b.name));
    
    return sortedExamTypes.map(et => {
        const examClasses = [...classes]
            .filter(c => c.examTypeId === et.id)
            .sort((a,b) => a.name.localeCompare(b.name));

        const classesWithData = examClasses.map(c => {
            const classSubjects = [...subjects]
                .filter(s => s.classId === c.id)
                .sort((a,b) => a.name.localeCompare(b.name));

            const subjectsWithTopics = classSubjects.map(s => {
                const subjectTopics = [...topics]
                    .filter(t => t.subjectId === s.id)
                    .sort((a,b) => a.name.localeCompare(b.name));
                return { ...s, topics: subjectTopics };
            });

            return { ...c, subjects: subjectsWithTopics };
        });
        return { ...et, classes: classesWithData };
    });

  }, [examTypes, classes, subjects, topics]);

  const isLoading = isTeacherLoading || areQuestionsLoading || areClassesLoading || areSubjectsLoading || areTopicsLoading || isSubscribedLoading || areExamTypesLoading;
  const canViewPaidContent = isTeacher || isSubscribed;

  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: { 
        questionType: 'MCQ',
        questionText: '', 
        options: ['', '', '', ''], 
        correctAnswer: '', 
        classId: '',
        subjectId: '',
        topicId: '', 
        difficultyLevel: 'Easy', 
        examTypeId: '',
        imageUrls: [],
        explanationImageUrls: [],
        accessLevel: 'free',
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: "options" });
  
  const { watch, setValue } = form;
  const questionType = watch('questionType');
  const selectedExamType = watch('examTypeId');
  const selectedClass = watch('classId');
  const selectedSubject = watch('subjectId');
  
  const filteredClasses = useMemo(() => {
    if (!selectedExamType || !classes) return [];
    return classes.filter(c => c.examTypeId === selectedExamType);
  }, [selectedExamType, classes]);

  const filteredSubjects = useMemo(() => {
    if (!selectedClass || !subjects) return [];
    return subjects.filter(subject => subject.classId === selectedClass);
  }, [selectedClass, subjects]);

  const filteredTopics = useMemo(() => {
    if (!selectedSubject || !topics) return [];
    return topics.filter(topic => topic.subjectId === selectedSubject);
  }, [selectedSubject, topics]);
  
  useEffect(() => {
    setValue('classId', '');
    setValue('subjectId', '');
    setValue('topicId', '');
  }, [selectedExamType, setValue]);

  useEffect(() => {
    setValue('subjectId', '');
    setValue('topicId', '');
  }, [selectedClass, setValue]);

  useEffect(() => {
    setValue('topicId', '');
  }, [selectedSubject, setValue]);


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
    setIsSubmitting(false);
  };

  const handleDeleteRequest = (questionId: string) => {
    setQuestionToDelete(questionId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (questionToDelete) {
      deleteDocumentNonBlocking(doc(firestore, 'practice_questions', questionToDelete));
      toast({
        title: 'Question Deleted',
        description: 'The question has been removed from the question bank.',
      });
      setQuestionToDelete(null);
    }
    setIsDeleteDialogOpen(false);
  };
  
  const handleQuestionImageCropped = (data: { imageUrl: string }) => {
    const currentUrls = form.getValues('imageUrls') || [];
    form.setValue('imageUrls', [...currentUrls, data.imageUrl]);
    toast({
      title: 'Question Image Added',
      description: 'The image has been added. You can add more or fill in the details.',
    });
  };

  const handleExplanationImageCropped = (data: { imageUrl: string }) => {
    const currentUrls = form.getValues('explanationImageUrls') || [];
    form.setValue('explanationImageUrls', [...currentUrls, data.imageUrl]);
    toast({
      title: 'Explanation Image Added',
      description: 'The explanation image has been added.',
    });
  };
  
  const SubscriptionPrompt = () => (
    <div className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full bg-amber-500/5">
        <Lock className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="font-headline text-2xl font-semibold text-amber-600">Practice Area Locked</h2>
        <p className="text-amber-700/80 mt-2 max-w-md">
            You need an active subscription to access the practice question bank. Please subscribe to unlock this feature.
        </p>
        <Button asChild className="mt-6 bg-amber-500 hover:bg-amber-600 text-white">
            <Link href="/subscription">View Subscription Plans</Link>
        </Button>
    </div>
  );

  const TeacherView = () => (
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        <div className='space-y-8'>
            <PdfQuestionExtractor
              file={questionPdfFile}
              onFileChange={setQuestionPdfFile}
              onImageCropped={handleQuestionImageCropped} 
              title="Add Question Image from PDF"
              description="Upload a PDF, crop an image for the question, then fill in details below."
              pageNumber={questionPdfPage}
              onPageNumberChange={setQuestionPdfPage}
            />
            <PdfQuestionExtractor 
              file={explanationPdfFile}
              onFileChange={setExplanationPdfFile}
              onImageCropped={handleExplanationImageCropped}
              title="Add Explanation Image from PDF"
              description="Upload a PDF and crop an image for the question's explanation."
              pageNumber={explanationPdfPage}
              onPageNumberChange={setExplanationPdfPage}
            />
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-2xl">
                    <PlusCircle className="w-6 h-6" /> Create New Question
                    </CardTitle>
                    <CardDescription>Use the tool above to add an image from a PDF, then fill out the form below to create a new question.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (<Skeleton className="h-64 w-full" />) : (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="questionType" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Question Type</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={(value) => { field.onChange(value);
                                            if (value === 'MCQ') { form.reset({ ...form.getValues(), numericalAnswer: undefined, options: ['', '', '', ''], correctAnswer: '' });
                                            } else { form.reset({ ...form.getValues(), options: undefined, correctAnswer: undefined }); }
                                        }} defaultValue={field.value} className="flex flex-row space-x-4">
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="MCQ" /></FormControl><FormLabel className="font-normal">Multiple Choice</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Numerical" /></FormControl><FormLabel className="font-normal">Numerical Answer</FormLabel></FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="accessLevel" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Access Level</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-row space-x-4">
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="paid" /></FormControl><FormLabel className="font-normal">Paid</FormLabel></FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                          <FormField control={form.control} name="questionText" render={({ field }) => (<FormItem><FormLabel>Question Text</FormLabel><FormControl><Textarea placeholder="e.g., What is the formula for..." {...field} rows={4} /></FormControl><FormMessage /></FormItem>)} />
                          
                          {form.watch('imageUrls') && form.watch('imageUrls').length > 0 && (
                            <div className="space-y-2">
                                <FormLabel>Question Image Previews</FormLabel>
                                <div className="flex flex-col gap-4">
                                    {form.watch('imageUrls').map((url, index) => (
                                        <div key={index} className="relative group">
                                            <Image src={url} alt={`Question image ${index + 1}`} width={200} height={150} className="rounded-md object-cover border" />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                                onClick={() => {
                                                    const currentUrls = form.getValues('imageUrls') || [];
                                                    form.setValue('imageUrls', currentUrls.filter((_, i) => i !== index));
                                                }}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                           )}
                          
                           {form.watch('explanationImageUrls') && form.watch('explanationImageUrls').length > 0 && (
                            <div className="space-y-2">
                                <FormLabel>Explanation Image Previews</FormLabel>
                                <div className="flex flex-col gap-4">
                                    {form.watch('explanationImageUrls').map((url, index) => (
                                        <div key={index} className="relative group">
                                            <Image src={url} alt={`Explanation image ${index + 1}`} width={200} height={150} className="rounded-md object-cover border" />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                                onClick={() => {
                                                    const currentUrls = form.getValues('explanationImageUrls') || [];
                                                    form.setValue('explanationImageUrls', currentUrls.filter((_, i) => i !== index));
                                                }}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                           )}

                          {questionType === 'MCQ' && (
                              <div className="space-y-4">
                                  <FormLabel>Options & Correct Answer</FormLabel>
                                  <FormField control={form.control} name="correctAnswer" render={({ field }) => (
                                      <FormItem className='space-y-0'><FormControl>
                                          <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          {fields.map((item, index) => (<FormField key={item.id} control={form.control} name={`options.${index}`} render={({ field: optionField }) => (<FormItem className="flex items-center gap-2 space-y-0 rounded-md border p-4 has-[:checked]:border-primary"><FormControl><RadioGroupItem value={optionField.value} disabled={!optionField.value} /></FormControl><Input {...optionField} placeholder={`Option ${index + 1}`} className="border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0" /><FormMessage className="col-span-2"/></FormItem>)} />))}
                                          </RadioGroup>
                                      </FormControl><FormMessage /></FormItem>
                                  )} />
                              </div>
                          )}
                          {questionType === 'Numerical' && (<FormField control={form.control} name="numericalAnswer" render={({ field }) => (<FormItem><FormLabel>Correct Numerical Answer</FormLabel><FormControl><Input type="number" placeholder="e.g., 42" {...field} onChange={event => field.onChange(+event.target.value)} /></FormControl><FormMessage /></FormItem>)} />)}
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="examTypeId" render={({ field }) => (
                              <FormItem><FormLabel>Exam Type</FormLabel>
                                <Select onValueChange={(value) => {
                                  field.onChange(value);
                                }} value={field.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                                  <SelectContent>{examTypes?.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="classId" render={({ field }) => (
                              <FormItem><FormLabel>Class</FormLabel>
                                <Select onValueChange={(value) => {
                                  field.onChange(value);
                                }} value={field.value} disabled={!selectedExamType}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                                  <SelectContent>{filteredClasses?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="subjectId" render={({ field }) => (
                              <FormItem><FormLabel>Subject</FormLabel>
                                <Select onValueChange={(value) => {
                                  field.onChange(value);
                                }} value={field.value} disabled={!selectedClass}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl>
                                  <SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="topicId" render={({ field }) => (
                              <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                              <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )} />
                          </div>

                          <Button type="submit" disabled={isSubmitting || isTeacherLoading}>{isSubmitting ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Adding...</>) : ('Add Question')}</Button>
                      </form>
                    </Form>
                  )}
                </CardContent>
            </Card>
        </div>
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2">
                    <ClipboardList className="w-6 h-6" /> All Practice Questions
                </CardTitle>
                <CardDescription>Browse the question bank. Click on a question to view the answer.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : questionTree && questionTree.length > 0 ? (
                    <Accordion type="multiple" className="w-full space-y-2">
                        {questionTree.map(et => (
                            <AccordionItem value={et.id} key={et.id} className="border rounded-lg">
                                <AccordionTrigger className="text-2xl font-semibold px-6">{et.name}</AccordionTrigger>
                                <AccordionContent className="px-6 pb-2">
                                    {et.classes.length > 0 ? (
                                        <Accordion type="multiple" className="w-full space-y-2" defaultValue={et.classes.map(c => c.id)}>
                                            {et.classes.map(c => (
                                                <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                                                    <AccordionTrigger className="text-xl font-medium px-4">{c.name}</AccordionTrigger>
                                                    <AccordionContent className="px-4 pb-2">
                                                        {c.subjects.length > 0 ? (
                                                            <Accordion type="multiple" className="w-full space-y-2" defaultValue={c.subjects.map(s => s.id)}>
                                                                {c.subjects.map(s => (
                                                                    <AccordionItem value={s.id} key={s.id} className="border-l-2 pl-4 border-muted">
                                                                        <AccordionTrigger className="text-lg font-medium">{s.name}</AccordionTrigger>
                                                                        <AccordionContent className="pl-4 pt-2">
                                                                            {s.topics.length > 0 ? (
                                                                                <Accordion type="multiple" className="w-full space-y-1">
                                                                                    {s.topics.map(t => (
                                                                                        <AccordionItem value={t.id} key={t.id} className="border-none">
                                                                                            <AccordionTrigger className="text-sm py-2">{t.name} ({t.questions.length} questions)</AccordionTrigger>
                                                                                            <AccordionContent className="pl-4">
                                                                                                <Accordion type="single" collapsible className="w-full space-y-2">
                                                                                                    {t.questions.map(q => (
                                                                                                        <QuestionItem key={q.id} question={q} topicMap={topicMap} classMap={classMap} examTypeMap={examTypeMap} isTeacher={!!isTeacher} canViewPaidContent={canViewPaidContent} onEdit={setEditingQuestion} onDelete={handleDeleteRequest} />
                                                                                                    ))}
                                                                                                </Accordion>
                                                                                            </AccordionContent>
                                                                                        </AccordionItem>
                                                                                    ))}
                                                                                </Accordion>
                                                                            ) : <p className="text-center text-muted-foreground py-4">No topics with questions found for this subject.</p>}
                                                                        </AccordionContent>
                                                                    </AccordionItem>
                                                                ))}
                                                            </Accordion>
                                                        ) : <p className="text-center text-muted-foreground py-4">No subjects with questions found for this class.</p>}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            ))}
                                        </Accordion>
                                    ) : <p className="text-center text-muted-foreground py-4">No classes with questions found for this exam type.</p>}
                                </AccordionContent>
                            </AccordionItem>
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
  );

  const StudentView = () => (
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Tabs defaultValue="quiz" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="quiz">Practice Quiz</TabsTrigger>
                <TabsTrigger value="bank">Question Bank</TabsTrigger>
            </TabsList>
            <TabsContent value="quiz">
                <Card className="shadow-lg mt-4">
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl">Start a New Practice Session</CardTitle>
                        <CardDescription>Customize your practice session by selecting your desired filters.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-48 w-full" /> : (
                            <StartPracticeForm 
                                curriculumTree={curriculumTree}
                                isSubscribed={!!isSubscribed}
                            />
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="bank">
                 <Card className="shadow-lg mt-4">
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl flex items-center gap-2">
                            <ClipboardList className="w-6 h-6" /> All Practice Questions
                        </CardTitle>
                        <CardDescription>Browse the question bank by curriculum. Click on a topic to start a practice session.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : questionTree.length > 0 ? (
                            <Accordion type="multiple" className="w-full space-y-2">
                                {questionTree.map(et => (
                                    <AccordionItem value={et.id} key={et.id} className="border rounded-lg">
                                        <AccordionTrigger className="text-2xl font-semibold px-6">{et.name}</AccordionTrigger>
                                        <AccordionContent className="px-6 pb-2">
                                            {et.classes.length > 0 ? (
                                                <Accordion type="multiple" className="w-full space-y-2" defaultValue={et.classes.map(c => c.id)}>
                                                    {et.classes.map(c => (
                                                        <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                                                            <AccordionTrigger className="text-xl font-medium px-4">{c.name}</AccordionTrigger>
                                                            <AccordionContent className="px-4 pb-2">
                                                                {c.subjects.length > 0 ? (
                                                                    <Accordion type="multiple" className="w-full space-y-2" defaultValue={c.subjects.map(s => s.id)}>
                                                                        {c.subjects.map(s => (
                                                                            <AccordionItem value={s.id} key={s.id} className="border-l-2 pl-4 border-muted">
                                                                                <AccordionTrigger className="text-lg font-medium">{s.name}</AccordionTrigger>
                                                                                <AccordionContent className="pl-4 pt-2">
                                                                                    {s.topics.length > 0 ? (
                                                                                        <Accordion type="multiple" className="w-full space-y-1">
                                                                                            {s.topics.map(t => (
                                                                                                <AccordionItem value={t.id} key={t.id} className="border-none">
                                                                                                    <AccordionTrigger className="text-sm py-2">{t.name} ({t.questions.length} questions)</AccordionTrigger>
                                                                                                    <AccordionContent className="pl-4">
                                                                                                        <div className="flex justify-end">
                                                                                                            <Button asChild size="sm">
                                                                                                                <Link href={`/practice/session?topicId=${t.id}${!isSubscribed ? '&accessLevel=free' : ''}`}>
                                                                                                                    <Rocket className="mr-2 h-4 w-4" /> Practice Topic
                                                                                                                </Link>
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                    </AccordionContent>
                                                                                                </AccordionItem>
                                                                                            ))}
                                                                                        </Accordion>
                                                                                    ) : <p className="text-center text-muted-foreground py-4">No topics with questions found for this subject.</p>}
                                                                                </AccordionContent>
                                                                            </AccordionItem>
                                                                        ))}
                                                                    </Accordion>
                                                                ) : <p className="text-center text-muted-foreground py-4">No subjects with questions found for this class.</p>}
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    ))}
                                                </Accordion>
                                            ) : <p className="text-center text-muted-foreground py-4">No classes with questions found for this exam type.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        ) : (
                            <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                                <p className='font-medium'>No practice questions available yet.</p>
                                <p className='text-sm'>Please check back later.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
          </Tabs>
      </main>
  );

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Practice Questions" />
      {isTeacher ? <TeacherView /> : <StudentView />}
      <Dialog open={!!editingQuestion} onOpenChange={(isOpen) => !isOpen && setEditingQuestion(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>Make changes to the question below. Click save when you're done.</DialogDescription>
          </DialogHeader>
          {editingQuestion && !isLoading && (
            <EditQuestionForm
              key={editingQuestion.id}
              questionToEdit={editingQuestion}
              classes={classes || []}
              subjects={subjects || []}
              topics={topics || []}
              examTypes={examTypes || []}
              onFinished={() => setEditingQuestion(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete this question.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setQuestionToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={cn(buttonVariants({ variant: "destructive" }))}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
