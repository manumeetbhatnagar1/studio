'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
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
import { LoaderCircle, ClipboardList, PlusCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import PdfQuestionExtractor from '@/components/pdf-question-extractor';

const baseSchema = z.object({
    questionText: z.string().min(10, 'Question must be at least 10 characters.'),
    imageUrl: z.string().optional(),
    topicId: z.string().min(1, 'Topic is required.'),
    difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
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

type PracticeQuestion = {
  id: string;
  questionText: string;
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  topicId: string;
  imageUrl?: string;
  questionType: 'MCQ' | 'Numerical';
  // MCQ fields
  options?: string[];
  correctAnswer?: string;
  // Numerical fields
  numericalAnswer?: number;
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
             <Badge variant="secondary">{question.questionType}</Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
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
    defaultValues: { 
        questionType: 'MCQ',
        questionText: '', 
        options: ['', '', '', ''], 
        correctAnswer: '', 
        topicId: '', 
        difficultyLevel: 'Easy', 
        imageUrl: ''
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: "options",
  });
  
  const questionType = form.watch('questionType');

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

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Practice Questions" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {isTeacher && (
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
                        <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            
                            <FormField
                                control={form.control}
                                name="questionType"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>Question Type</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            if (value === 'MCQ') {
                                                form.reset({ ...form.getValues(), numericalAnswer: undefined, options: ['', '', '', ''], correctAnswer: '' });
                                            } else {
                                                form.reset({ ...form.getValues(), options: undefined, correctAnswer: undefined });
                                            }
                                        }}
                                        defaultValue={field.value}
                                        className="flex flex-row space-x-4"
                                        >
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl>
                                            <RadioGroupItem value="MCQ" />
                                            </FormControl>
                                            <FormLabel className="font-normal">Multiple Choice</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl>
                                            <RadioGroupItem value="Numerical" />
                                            </FormControl>
                                            <FormLabel className="font-normal">Numerical Answer</FormLabel>
                                        </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                            control={form.control}
                            name="questionText"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Question Text</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="e.g., What is the formula for..." {...field} rows={4} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />

                            {form.watch('imageUrl') && (
                                <FormItem>
                                    <FormLabel>Image Preview</FormLabel>
                                    <FormControl>
                                        <div className="p-4 border rounded-md flex justify-center bg-muted/50">
                                            <Image 
                                                src={form.watch('imageUrl')!}
                                                alt="Extracted image preview"
                                                width={400}
                                                height={300}
                                                className="rounded-md object-contain"
                                            />
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )}

                            {questionType === 'MCQ' && (
                                <div className="space-y-4">
                                    <FormLabel>Options & Correct Answer</FormLabel>
                                    <FormField
                                    control={form.control}
                                    name="correctAnswer"
                                    render={({ field }) => (
                                        <FormItem className='space-y-0'>
                                            <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value}
                                                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                                                >
                                                {fields.map((item, index) => (
                                                    <FormField
                                                        key={item.id}
                                                        control={form.control}
                                                        name={`options.${index}`}
                                                        render={({ field: optionField }) => (
                                                            <FormItem className="flex items-center gap-2 space-y-0 rounded-md border p-4 has-[:checked]:border-primary">
                                                                <FormControl>
                                                                    <RadioGroupItem value={optionField.value} disabled={!optionField.value} />
                                                                </FormControl>
                                                                <Input {...optionField} placeholder={`Option ${index + 1}`} className="border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0" />
                                                                <FormMessage className="col-span-2"/>
                                                            </FormItem>
                                                        )}
                                                    />
                                                ))}
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                </div>
                            )}

                            {questionType === 'Numerical' && (
                                <FormField
                                    control={form.control}
                                    name="numericalAnswer"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Correct Numerical Answer</FormLabel>
                                        <FormControl>
                                            <Input type="number" placeholder="e.g., 42" {...field} onChange={event => field.onChange(+event.target.value)} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            
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
            </div>
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
