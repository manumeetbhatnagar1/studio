'use client';

import Link from 'next/link';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useState, useMemo, useEffect, FC } from 'react';
import { LoaderCircle, ClipboardList, PlusCircle, CheckCircle, Lock, Edit2, Trash2, Rocket } from 'lucide-react';
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


const baseSchema = z.object({
    questionText: z.string().min(10, 'Question must be at least 10 characters.'),
    imageUrl: z.string().optional(),
    classId: z.string().min(1, 'Class is required.'),
    subjectId: z.string().min(1, 'Subject is required.'),
    topicId: z.string().min(1, 'Topic is required.'),
    difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
    examCategory: z.enum(['JEE Main', 'JEE Advanced', 'Both']),
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
    classId: z.string().optional(),
    subjectId: z.string().optional(),
    topicId: z.string().optional(),
    difficultyLevel: z.string().optional(),
    accessLevel: z.enum(['free', 'paid']),
    count: z.coerce.number().min(1, "Please enter at least 1 question.").max(50, "You can practice a maximum of 50 questions at a time."),
});

type PracticeQuestion = {
  id: string;
  questionText: string;
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  examCategory: 'JEE Main' | 'JEE Advanced' | 'Both',
  classId: string;
  subjectId: string;
  topicId: string;
  imageUrl?: string;
  questionType: 'MCQ' | 'Numerical';
  options?: string[];
  correctAnswer?: string;
  numericalAnswer?: number;
  accessLevel: 'free' | 'paid';
};
type Class = { id: string; name: string; };
type Subject = { id: string; name: string; classId: string; };
type Topic = { id: string; name: string; subjectId: string; };


function QuestionItem({ question, topicMap, classMap, isTeacher, canViewPaidContent, onEdit, onDelete }: { question: PracticeQuestion; topicMap: Record<string, string>; classMap: Record<string, string>; isTeacher: boolean; canViewPaidContent: boolean; onEdit: (question: PracticeQuestion) => void, onDelete: (questionId: string) => void }) {
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
                {question.imageUrl && (
                    <div className="my-4 p-4 border rounded-md flex justify-center bg-muted/50">
                        <Image
                            src={question.imageUrl}
                            alt="Question diagram"
                            width={400}
                            height={300}
                            className="rounded-md object-contain"
                        />
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
                ): null}
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
  onFinished: () => void,
}> = ({ questionToEdit, classes, subjects, topics, onFinished }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Find the subject and class for the initial topic
    const initialTopic = topics.find(t => t.id === questionToEdit.topicId);
    const initialSubject = subjects.find(s => s.id === initialTopic?.subjectId);
    const initialClassId = initialSubject?.classId || '';

    const form = useForm<z.infer<typeof questionSchema>>({
        resolver: zodResolver(questionSchema),
        defaultValues: { ...questionToEdit, classId: initialClassId },
    });

    const { fields } = useFieldArray({ control: form.control, name: "options" });
    
    const questionType = form.watch('questionType');
    const selectedClass = form.watch('classId');
    const selectedSubject = form.watch('subjectId');

    useEffect(() => {
        const newInitialTopic = topics.find(t => t.id === questionToEdit.topicId);
        const newInitialSubject = subjects.find(s => s.id === newInitialTopic?.subjectId);
        const newInitialClassId = newInitialSubject?.classId || '';
        form.reset({ ...questionToEdit, classId: newInitialClassId });
    }, [questionToEdit, form, topics, subjects]);

    useEffect(() => {
        if (form.getValues('classId') !== initialClassId) {
            form.setValue('subjectId', '');
            form.setValue('topicId', '');
        }
    }, [selectedClass, form, initialClassId]);

    useEffect(() => {
        if (form.getValues('subjectId') !== initialSubject?.id) {
            form.setValue('topicId', '');
        }
    }, [selectedSubject, form, initialSubject]);


    const filteredSubjects = useMemo(() => {
        if (!selectedClass || !subjects) return [];
        return subjects.filter(subject => subject.classId === selectedClass);
    }, [selectedClass, subjects]);

    const filteredTopics = useMemo(() => {
        if (!selectedSubject || !topics) return [];
        return topics.filter(topic => topic.subjectId === selectedSubject);
    }, [selectedSubject, topics]);

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
                <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Image URL (Optional)</FormLabel><FormControl><Input placeholder="https://example.com/image.png" {...field} /></FormControl><FormMessage /></FormItem>)} />

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
                    <FormField control={form.control} name="classId" render={({ field }) => (
                        <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{classes?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="subjectId" render={({ field }) => (
                        <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedClass}><FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl><SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="topicId" render={({ field }) => (
                        <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                        <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="examCategory" render={({ field }) => (
                        <FormItem><FormLabel>Exam Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="JEE Main">JEE Main</SelectItem><SelectItem value="JEE Advanced">JEE Advanced</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                </div>

                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? (<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : ('Save Changes')}</Button>
            </form>
        </Form>
    );
}

const StartPracticeForm: FC<{
  classes: Class[],
  subjects: Subject[],
  topics: Topic[],
  isSubscribed: boolean
}> = ({ classes, subjects, topics, isSubscribed }) => {
    const router = useRouter();
    const form = useForm<z.infer<typeof practiceQuizSchema>>({
        resolver: zodResolver(practiceQuizSchema),
        defaultValues: {
            classId: '',
            subjectId: '',
            topicId: '',
            difficultyLevel: 'Medium',
            accessLevel: 'free',
            count: 10,
        }
    });

    const { watch, setValue } = form;
    const selectedClass = watch('classId');
    const selectedSubject = watch('subjectId');

    const filteredSubjects = useMemo(() => {
        if (!selectedClass) return subjects;
        return subjects.filter(subject => subject.classId === selectedClass);
    }, [selectedClass, subjects]);

    const filteredTopics = useMemo(() => {
        if (!selectedSubject) return topics;
        return topics.filter(topic => topic.subjectId === selectedSubject);
    }, [selectedSubject, topics]);

    useEffect(() => {
        setValue('subjectId', '');
        setValue('topicId', '');
    }, [selectedClass, setValue]);

    useEffect(() => {
        setValue('topicId', '');
    }, [selectedSubject, setValue]);

    function onSubmit(values: z.infer<typeof practiceQuizSchema>) {
        const params = new URLSearchParams();
        Object.entries(values).forEach(([key, value]) => {
            if (value) {
                params.append(key, String(value));
            }
        });
        router.push(`/practice/session?${params.toString()}`);
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField control={form.control} name="classId" render={({ field }) => (
                        <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger></FormControl><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name="subjectId" render={({ field }) => (
                        <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="All Subjects" /></SelectTrigger></FormControl><SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name="topicId" render={({ field }) => (
                        <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="All Topics" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                        <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name="count" render={({ field }) => (
                        <FormItem><FormLabel>Number of Questions</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
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

  const questionsCollectionRef = useMemoFirebase(() => firestore ? query(collection(firestore, 'practice_questions'), orderBy('topicId')) : null, [firestore]);
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);

  const { data: questions, isLoading: areQuestionsLoading } = useCollection<PracticeQuestion>(questionsCollectionRef);
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);

  const [bankClassFilter, setBankClassFilter] = useState('all');
  const [bankSubjectFilter, setBankSubjectFilter] = useState('all');
  const [bankTopicFilter, setBankTopicFilter] = useState('all');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState('all');
  const [bankExamFilter, setBankExamFilter] = useState('all');

  const bankFilteredSubjects = useMemo(() => {
    if (!subjects) return [];
    if (bankClassFilter === 'all') return subjects;
    return subjects.filter(subject => subject.classId === bankClassFilter);
  }, [bankClassFilter, subjects]);

  const bankFilteredTopics = useMemo(() => {
    if (!topics) return [];
    if (bankSubjectFilter === 'all') {
      const subjectIds = bankFilteredSubjects.map(s => s.id);
      return topics.filter(t => subjectIds.includes(t.subjectId));
    }
    return topics.filter(topic => topic.subjectId === bankSubjectFilter);
  }, [bankSubjectFilter, topics, bankFilteredSubjects]);

  const bankQuestions = useMemo(() => {
    if (!questions) return [];
    return questions.filter(q => {
      if (bankClassFilter !== 'all' && q.classId !== bankClassFilter) return false;
      if (bankSubjectFilter !== 'all' && q.subjectId !== bankSubjectFilter) return false;
      if (bankTopicFilter !== 'all' && q.topicId !== bankTopicFilter) return false;
      if (bankDifficultyFilter !== 'all' && q.difficultyLevel !== bankDifficultyFilter) return false;
      if (bankExamFilter !== 'all' && q.examCategory !== bankExamFilter) return false;
      return true;
    });
  }, [questions, bankClassFilter, bankSubjectFilter, bankTopicFilter, bankDifficultyFilter, bankExamFilter]);
  
  useEffect(() => {
    setBankSubjectFilter('all');
  }, [bankClassFilter]);

  useEffect(() => {
    setBankTopicFilter('all');
  }, [bankSubjectFilter]);
  
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
  
  const isLoading = isTeacherLoading || areQuestionsLoading || areClassesLoading || areSubjectsLoading || areTopicsLoading || isSubscribedLoading;
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
        examCategory: 'Both',
        imageUrl: '',
        accessLevel: 'free',
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: "options" });
  
  const questionType = form.watch('questionType');
  const selectedClass = form.watch('classId');
  const selectedSubject = form.watch('subjectId');

  useEffect(() => {
    form.setValue('subjectId', '');
    form.setValue('topicId', '');
  }, [selectedClass, form]);

  useEffect(() => {
      form.setValue('topicId', '');
  }, [selectedSubject, form]);

  const filteredSubjects = useMemo(() => {
    if (!selectedClass || !subjects) return [];
    return subjects.filter(subject => subject.classId === selectedClass);
  }, [selectedClass, subjects]);

  const filteredTopics = useMemo(() => {
    if (!selectedSubject || !topics) return [];
    return topics.filter(topic => topic.subjectId === selectedSubject);
  }, [selectedSubject, topics]);

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
  
  const handleImageCropped = (data: { imageUrl: string }) => {
    form.setValue('imageUrl', data.imageUrl);
    form.setValue('questionText', '');
    form.setValue('options', ['', '', '', '']);
    form.setValue('correctAnswer', '');
    toast({
      title: 'Image Added',
      description: 'The image is ready. Please fill in the question details manually.',
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
            <PdfQuestionExtractor onImageCropped={handleImageCropped} />
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
                          {form.watch('imageUrl') && (<FormItem><FormLabel>Image Preview</FormLabel><FormControl><div className="p-4 border rounded-md flex justify-center bg-muted/50"><Image src={form.watch('imageUrl')!} alt="Extracted image preview" width={400} height={300} className="rounded-md object-contain" /></div></FormControl></FormItem>)}
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
                            <FormField control={form.control} name="classId" render={({ field }) => (
                              <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{classes?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="subjectId" render={({ field }) => (
                              <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedClass}><FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl><SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="topicId" render={({ field }) => (
                              <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
                              <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="examCategory" render={({ field }) => (
                              <FormItem><FormLabel>Exam Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="JEE Main">JEE Main</SelectItem><SelectItem value="JEE Advanced">JEE Advanced</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select><FormMessage /></FormItem>
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
                ) : questions && questions.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {questions.map(q => (
                            <QuestionItem key={q.id} question={q} topicMap={topicMap} classMap={classMap} isTeacher={!!isTeacher} canViewPaidContent={canViewPaidContent} onEdit={setEditingQuestion} onDelete={handleDeleteRequest} />
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
                                classes={classes || []}
                                subjects={subjects || []}
                                topics={topics || []}
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
                        <CardDescription>Browse the question bank. Click on a question to view the answer.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
                            <div className="space-y-2">
                                <Label htmlFor="bank-class-filter">Class</Label>
                                <Select value={bankClassFilter} onValueChange={setBankClassFilter}>
                                    <SelectTrigger id="bank-class-filter"><SelectValue placeholder="All Classes" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Classes</SelectItem>
                                        {classes?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="bank-subject-filter">Subject</Label>
                                <Select value={bankSubjectFilter} onValueChange={setBankSubjectFilter}>
                                    <SelectTrigger id="bank-subject-filter"><SelectValue placeholder="All Subjects" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Subjects</SelectItem>
                                        {bankFilteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bank-topic-filter">Topic</Label>
                                <Select value={bankTopicFilter} onValueChange={setBankTopicFilter} disabled={bankSubjectFilter === 'all' && bankClassFilter === 'all'}>
                                    <SelectTrigger id="bank-topic-filter"><SelectValue placeholder="All Topics" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Topics</SelectItem>
                                        {bankFilteredTopics.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bank-difficulty-filter">Difficulty</Label>
                                <Select value={bankDifficultyFilter} onValueChange={setBankDifficultyFilter}>
                                    <SelectTrigger id="bank-difficulty-filter"><SelectValue placeholder="All Difficulties" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Difficulties</SelectItem>
                                        <SelectItem value="Easy">Easy</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="Hard">Hard</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="bank-exam-filter">Exam</Label>
                                <Select value={bankExamFilter} onValueChange={setBankExamFilter}>
                                    <SelectTrigger id="bank-exam-filter"><SelectValue placeholder="All Exams" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Exams</SelectItem>
                                        <SelectItem value="JEE Main">JEE Main</SelectItem>
                                        <SelectItem value="JEE Advanced">JEE Advanced</SelectItem>
                                        <SelectItem value="Both">Both</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : bankQuestions && bankQuestions.length > 0 ? (
                            <Accordion type="single" collapsible className="w-full space-y-2">
                                {bankQuestions.map(q => (
                                    <QuestionItem key={q.id} question={q} topicMap={topicMap} classMap={classMap} isTeacher={false} canViewPaidContent={canViewPaidContent} onEdit={()=>{}} onDelete={()=>{}} />
                                ))}
                            </Accordion>
                        ) : (
                            <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                                <p className='font-medium'>No practice questions match your current filters.</p>
                                <p className='text-sm'>Try adjusting your search criteria.</p>
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
