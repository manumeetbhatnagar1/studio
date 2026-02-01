'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, useDoc, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useState, useMemo, useEffect } from 'react';
import { LoaderCircle, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter, useParams } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


const subjectConfigSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  numQuestions: z.coerce.number().min(1, 'At least 1 question is required.').max(100),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.').max(180),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  startTime: z.date(),
  examCategory: z.enum(['JEE Main', 'JEE Advanced', 'Both']),
  accessLevel: z.enum(['free', 'paid']),
  subjects: z.array(subjectConfigSchema).min(1, 'You must select at least one subject.'),
});

type Subject = { id: string; name: string };
type OfficialTest = {
  id: string;
  title: string;
  startTime: { toDate: () => Date };
  examCategory: 'JEE Main' | 'JEE Advanced' | 'Both';
  accessLevel: 'free' | 'paid';
  config: {
    subjects: {
        subjectId: string;
        subjectName: string;
        numQuestions: number;
        duration: number;
    }[];
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

  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const { data: allSubjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      examCategory: 'Both',
      accessLevel: 'free',
      subjects: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'subjects',
  });

  useEffect(() => {
    if (testData) {
      form.reset({
        title: testData.title,
        startTime: testData.startTime.toDate(),
        examCategory: testData.examCategory,
        accessLevel: testData.accessLevel,
      });
      replace(testData.config.subjects);
    }
  }, [testData, form, replace]);


  const selectedSubjectIds = useMemo(() => fields.map(field => field.subjectId), [fields]);

  const handleSubjectToggle = (checked: boolean, subject: Subject) => {
    if (checked) {
      append({ subjectId: subject.id, subjectName: subject.name, numQuestions: 30, duration: 60 });
    } else {
      const index = fields.findIndex(field => field.subjectId === subject.id);
      if (index > -1) {
        remove(index);
      }
    }
  };
  
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!testDocRef) return;
    setIsSubmitting(true);

    updateDocumentNonBlocking(testDocRef, {
        title: values.title,
        startTime: values.startTime,
        examCategory: values.examCategory,
        accessLevel: values.accessLevel,
        config: {
            subjects: values.subjects,
        },
    });
    
    toast({
      title: 'Official Test Updated!',
      description: `${values.title} has been saved.`,
    });
    router.push('/mock-tests');
    setIsSubmitting(false);
  }

  const isLoading = isTestLoading || areSubjectsLoading;

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
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                  <div className="p-3 border-t border-border">
                                      <Input type="time" value={field.value ? format(field.value, 'HH:mm') : ''} onChange={(e) => {
                                          const [hours, minutes] = e.target.value.split(':').map(Number);
                                          const newDate = field.value ? new Date(field.value) : new Date();
                                          newDate.setHours(hours, minutes);
                                          field.onChange(newDate);
                                      }}/>
                                  </div>
                              </PopoverContent></Popover>
                          <FormMessage /></FormItem>
                      )} />
                       <FormField control={form.control} name="examCategory" render={({ field }) => (
                            <FormItem><FormLabel className="text-lg font-semibold">Exam Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="JEE Main">JEE Main</SelectItem><SelectItem value="JEE Advanced">JEE Advanced</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                        )} />
                    </div>

                    <FormField
                      control={form.control}
                      name="accessLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold">Access Level</FormLabel>
                          <FormDescription>
                            Paid tests will only use paid questions from the question bank.
                          </FormDescription>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex gap-4 pt-2"
                            >
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <RadioGroupItem value="free" />
                                </FormControl>
                                <FormLabel className="font-normal">Free</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <RadioGroupItem value="paid" />
                                </FormControl>
                                <FormLabel className="font-normal">Paid</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormItem>
                      <FormLabel className="text-lg font-semibold">Select Subjects</FormLabel>
                      <div className="p-4 border rounded-md space-y-4">
                        {allSubjects?.map(subject => (
                          <div key={subject.id} className="flex items-center space-x-3">
                            <Checkbox
                              id={subject.id}
                              checked={selectedSubjectIds.includes(subject.id)}
                              onCheckedChange={(checked) => handleSubjectToggle(Boolean(checked), subject)}
                            />
                            <label htmlFor={subject.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {subject.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage>{form.formState.errors.subjects?.message}</FormMessage>
                    </FormItem>

                    {fields.length > 0 && (
                        <div className='space-y-6'>
                             <h3 className="text-lg font-semibold">Configure Subjects</h3>
                            {fields.map((field, index) => (
                                <Card key={field.id} className="bg-muted/50">
                                    <CardHeader>
                                        <CardTitle className="text-xl">{field.subjectName}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name={`subjects.${index}.numQuestions`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Number of Questions</FormLabel>
                                                    <FormControl><Input type="number" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`subjects.${index}.duration`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Duration (minutes)</FormLabel>
                                                    <FormControl><Input type="number" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

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
