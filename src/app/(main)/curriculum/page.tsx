'use client';

import { useState, useMemo, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useCollection, addDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, LoaderCircle, Book, Library, ListTree } from 'lucide-react';

// Zod schemas
const subjectSchema = z.object({
  name: z.string().min(2, 'Subject name must be at least 2 characters.'),
});

const topicSchema = z.object({
  name: z.string().min(3, 'Topic name must be at least 3 characters.'),
  description: z.string().optional(),
  subjectId: z.string().min(1, 'You must select a subject.'),
});

// Data types
type Subject = { id: string; name: string; };
type Topic = { id: string; name: string; description?: string; subjectId: string; };

// Add Subject Form
const AddSubjectForm: FC<{ onFormSubmit: () => void }> = ({ onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '' },
  });

  function onSubmit(values: z.infer<typeof subjectSchema>) {
    setIsSubmitting(true);
    const subjectsRef = collection(firestore, 'subjects');
    addDocumentNonBlocking(subjectsRef, values);
    toast({ title: 'Subject Added!', description: `"${values.name}" has been added.` });
    form.reset();
    onFormSubmit();
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Subject Name</FormLabel>
            <FormControl><Input placeholder="e.g., Organic Chemistry" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
          Add Subject
        </Button>
      </form>
    </Form>
  );
};

// Add Topic Form
const AddTopicForm: FC<{ subjects: Subject[]; onFormSubmit: () => void }> = ({ subjects, onFormSubmit }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
  
    const form = useForm<z.infer<typeof topicSchema>>({
      resolver: zodResolver(topicSchema),
      defaultValues: { name: '', description: '', subjectId: '' },
    });
  
    function onSubmit(values: z.infer<typeof topicSchema>) {
      setIsSubmitting(true);
      const topicsRef = collection(firestore, 'topics');
      addDocumentNonBlocking(topicsRef, values);
      toast({ title: 'Topic Added!', description: `"${values.name}" has been added.` });
      form.reset();
      onFormSubmit();
      setIsSubmitting(false);
    }
  
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="subjectId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl>
                        <SelectContent>{subjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                    <FormLabel>Topic Name</FormLabel>
                    <FormControl><Input placeholder="e.g., General Organic Chemistry" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                    <FormLabel>Topic Description (Optional)</FormLabel>
                    <FormControl><Textarea placeholder="A brief overview of the topic" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
            <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            Add Topic
            </Button>
        </form>
      </Form>
    );
};


export default function CurriculumPage() {
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const firestore = useFirestore();
  const [formKey, setFormKey] = useState(0);

  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);

  const curriculumTree = useMemo(() => {
    if (!subjects) return {};

    const tree: Record<string, { subjectId: string; name: string; topics: Topic[] }> = {};
    
    subjects.forEach(subject => {
        tree[subject.id] = { subjectId: subject.id, name: subject.name, topics: [] };
    });

    if (topics) {
        topics.forEach(topic => {
            if (tree[topic.subjectId]) {
                tree[topic.subjectId].topics.push(topic);
            }
        });
    }

    return tree;
  }, [subjects, topics]);

  const sortedSubjects = useMemo(() => {
    if (!subjects) return [];
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects]);

  const isLoading = isTeacherLoading || areSubjectsLoading || areTopicsLoading;
  const onFormSubmit = () => setFormKey(prev => prev + 1);

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Curriculum Management" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {isTeacher && (
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><Book />Add New Subject</CardTitle>
                <CardDescription>Add a new high-level subject like "Physics".</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-24 w-full" /> : <AddSubjectForm key={`subject-${formKey}`} onFormSubmit={onFormSubmit} />}
              </CardContent>
            </Card>
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-xl"><ListTree />Add New Topic</CardTitle>
                    <CardDescription>Add a new topic within an existing subject.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-48 w-full" /> : <AddTopicForm key={`topic-${formKey}`} subjects={subjects || []} onFormSubmit={onFormSubmit} />}
                </CardContent>
            </Card>
          </div>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><Library />Curriculum Overview</CardTitle>
            <CardDescription>Browse all subjects and their corresponding topics.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : sortedSubjects.length > 0 ? (
              <Accordion type="multiple" className="w-full space-y-2">
                {sortedSubjects.map(subject => (
                  <AccordionItem value={subject.id} key={subject.id} className="border rounded-lg">
                    <AccordionTrigger className="text-xl font-semibold px-6">{subject.name}</AccordionTrigger>
                    <AccordionContent className="px-6">
                      {curriculumTree[subject.id]?.topics.length > 0 ? (
                        <ul className="list-disc pl-5 space-y-2 pt-2">
                            {curriculumTree[subject.id].topics.map(topic => (
                                <li key={topic.id}>
                                    <p className="font-medium">{topic.name}</p>
                                    {topic.description && <p className="text-sm text-muted-foreground">{topic.description}</p>}
                                </li>
                            ))}
                        </ul>
                      ) : (
                        <div className="text-center text-muted-foreground py-4">
                          <p>No topics have been added for this subject yet.</p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>No subjects available yet.</p>
                {isTeacher && <p className='text-sm'>Add a subject above to get started!</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
