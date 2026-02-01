'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useState, useMemo } from 'react';
import { LoaderCircle, PlusCircle, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const subjectConfigSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  numQuestions: z.coerce.number().min(1, 'At least 1 question is required.').max(100),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 minute.').max(180),
});

const formSchema = z.object({
  title: z.string().min(5, 'Test title must be at least 5 characters long.'),
  startTime: z.date().refine((date) => date > new Date(), {
    message: 'Start time must be in the future.',
  }),
  examCategory: z.enum(['JEE Main', 'JEE Advanced', 'Both']),
  subjects: z.array(subjectConfigSchema).min(1, 'You must select at least one subject.'),
});

type Subject = { id: string; name: string };

export default function CreateOfficialMockTestPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const { data: allSubjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      examCategory: 'Both',
      subjects: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'subjects',
  });

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
    setIsSubmitting(true);

    const mockTestsRef = collection(firestore, 'mock_tests');
    
    await addDocumentNonBlocking(mockTestsRef, {
        title: values.title,
        startTime: values.startTime,
        examCategory: values.examCategory,
        config: {
            subjects: values.subjects,
        },
    });
    
    toast({
      title: 'Official Test Created!',
      description: `${values.title} has been scheduled.`,
    });
    router.push('/mock-tests');
    setIsSubmitting(false);
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Create an Official Mock Test" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">New Official Test</CardTitle>
              <CardDescription>
                Build a mock test for all students. Select subjects and configure the test structure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {areSubjectsLoading ? (
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
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date()} initialFocus />
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
                            <FormItem><FormLabel className="text-lg font-semibold">Exam Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="JEE Main">JEE Main</SelectItem><SelectItem value="JEE Advanced">JEE Advanced</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                        )} />
                    </div>

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
