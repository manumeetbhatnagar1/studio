'use client';

import { useState, useMemo, FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useCollection, addDocumentNonBlocking, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy, doc, writeBatch, getDocs, where } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, LoaderCircle, Book, Library, ListTree, BookCopy, Edit2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Zod schemas
const classSchema = z.object({
  name: z.string().min(2, 'Class name must be at least 2 characters.'),
});

const subjectSchema = z.object({
  name: z.string().min(2, 'Subject name must be at least 2 characters.'),
  classId: z.string().min(1, 'You must select a class.'),
});

const topicSchema = z.object({
  name: z.string().min(3, 'Topic name must be at least 3 characters.'),
  description: z.string().optional(),
  subjectId: z.string().min(1, 'You must select a subject.'),
});

// Data types
type Class = { id: string; name: string; };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; description?: string; subjectId: string; };

// Add Class Form
const AddClassForm: FC<{ onFormSubmit: () => void }> = ({ onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof classSchema>>({
    resolver: zodResolver(classSchema),
    defaultValues: { name: '' },
  });

  function onSubmit(values: z.infer<typeof classSchema>) {
    setIsSubmitting(true);
    const classesRef = collection(firestore, 'classes');
    addDocumentNonBlocking(classesRef, values);
    toast({ title: 'Class Added!', description: `"${values.name}" has been added.` });
    form.reset();
    onFormSubmit();
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Class Name</FormLabel>
            <FormControl><Input placeholder="e.g., CBSE Class 10" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
          Add Class
        </Button>
      </form>
    </Form>
  );
};


// Add Subject Form
const AddSubjectForm: FC<{ classes: Class[], onFormSubmit: () => void }> = ({ classes, onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '', classId: '' },
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
        <FormField control={form.control} name="classId" render={({ field }) => (
            <FormItem>
                <FormLabel>Class</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                    <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
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
const AddTopicForm: FC<{ classes: Class[]; subjects: Subject[]; onFormSubmit: () => void }> = ({ classes, subjects, onFormSubmit }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
  
    const form = useForm<z.infer<typeof topicSchema> & { classId: string }>({
      resolver: zodResolver(topicSchema),
      defaultValues: { name: '', description: '', subjectId: '', classId: '' },
    });

    const selectedClassId = form.watch('classId');

    const filteredSubjects = useMemo(() => {
        if (!selectedClassId) return [];
        return subjects.filter(s => s.classId === selectedClassId);
    }, [selectedClassId, subjects]);

    useEffect(() => {
        form.setValue('subjectId', '');
    }, [selectedClassId, form]);
  
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
            <FormField control={form.control} name="classId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                        <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="subjectId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedClassId}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl>
                        <SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
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
            <Button type="submit" disabled={isSubmitting || !form.watch('subjectId')}>
            {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            Add Topic
            </Button>
        </form>
      </Form>
    );
};

const EditForm: FC<{
  item: { type: 'class' | 'subject' | 'topic'; data: any };
  classes: Class[];
  subjects: Subject[];
  onFinished: () => void;
}> = ({ item, classes, subjects, onFinished }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isClass = item.type === 'class';
  const isSubject = item.type === 'subject';
  const isTopic = item.type === 'topic';

  let schema: z.ZodType<any> = z.object({});
  if (isClass) schema = classSchema;
  if (isSubject) schema = subjectSchema;
  if (isTopic) schema = topicSchema;

  let defaultValues: any = { ...item.data };
  if (isTopic) {
    const subject = subjects.find(s => s.id === item.data.subjectId);
    defaultValues.classId = subject?.classId || '';
  }

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const selectedClassId = form.watch('classId');
  
  const filteredSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    return subjects.filter(s => s.classId === selectedClassId);
  }, [selectedClassId, subjects]);

  useEffect(() => {
      if (isTopic) {
        const subject = subjects.find(s => s.id === form.getValues('subjectId'));
        if (subject && subject.classId !== selectedClassId) {
            form.setValue('subjectId', '');
        }
      }
  }, [selectedClassId, form, isTopic, subjects]);

  async function onSubmit(values: any) {
    setIsSubmitting(true);
    const { classId, ...dataToSave } = values;
    const docRef = doc(firestore, `${item.type}s`, item.data.id);

    try {
      await updateDocumentNonBlocking(docRef, dataToSave);
      toast({ title: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} Updated!` });
      onFinished();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {isClass && (
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem><FormLabel>Class Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        )}
        {isSubject && (
            <>
                <FormField control={form.control} name="classId" render={({ field }) => (
                    <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Subject Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </>
        )}
        {isTopic && (
            <>
                 <FormField control={form.control} name="classId" render={({ field }) => (
                    <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="subjectId" render={({ field }) => (
                    <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedClassId}><FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl><SelectContent>{filteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Topic Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Topic Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </form>
    </Form>
  );
};


export default function CurriculumPage() {
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formKey, setFormKey] = useState(0);
  const [itemToEdit, setItemToEdit] = useState<{type: 'class' | 'subject' | 'topic', data: any} | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{type: 'class' | 'subject' | 'topic', data: any} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);

  const curriculumTree = useMemo(() => {
    if (!classes || !subjects || !topics) return [];

    const sortedClasses = [...classes].sort((a,b) => a.name.localeCompare(b.name));
    
    return sortedClasses.map(c => {
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

  }, [classes, subjects, topics]);


  const isLoading = isTeacherLoading || areClassesLoading || areSubjectsLoading || areTopicsLoading;
  const onFormSubmit = () => setFormKey(prev => prev + 1);

  const handleEdit = (type: 'class' | 'subject' | 'topic', data: any) => {
    setItemToEdit({ type, data });
  };

  const handleDeleteRequest = (type: 'class' | 'subject' | 'topic', data: any) => {
    setItemToDelete({ type, data });
  };
  
  const confirmDelete = async () => {
    if (!itemToDelete || !firestore) return;
    setIsDeleting(true);

    try {
        const batch = writeBatch(firestore);
        const { type, data } = itemToDelete;

        if (type === 'class') {
            const classId = data.id;
            batch.delete(doc(firestore, 'classes', classId));

            const subjectsQuery = query(collection(firestore, 'subjects'), where('classId', '==', classId));
            const subjectsSnapshot = await getDocs(subjectsQuery);
            
            if (!subjectsSnapshot.empty) {
                const subjectIds = subjectsSnapshot.docs.map(d => d.id);
                subjectsSnapshot.docs.forEach(d => batch.delete(d.ref));
                
                for (let i = 0; i < subjectIds.length; i += 30) {
                    const chunk = subjectIds.slice(i, i + 30);
                    const topicsQuery = query(collection(firestore, 'topics'), where('subjectId', 'in', chunk));
                    const topicsSnapshot = await getDocs(topicsQuery);
                    topicsSnapshot.docs.forEach(d => batch.delete(d.ref));
                }
            }
        } else if (type === 'subject') {
            const subjectId = data.id;
            batch.delete(doc(firestore, 'subjects', subjectId));

            const topicsQuery = query(collection(firestore, 'topics'), where('subjectId', '==', subjectId));
            const topicsSnapshot = await getDocs(topicsQuery);
            topicsSnapshot.docs.forEach(d => batch.delete(d.ref));

        } else if (type === 'topic') {
            batch.delete(doc(firestore, 'topics', data.id));
        }

        await batch.commit();
        toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} Deleted`, description: `"${data.name}" and any associated children have been removed.` });
    } catch (error: any) {
        console.error("Deletion error: ", error);
        toast({ variant: 'destructive', title: 'Deletion Failed', description: error.message });
    } finally {
        setIsDeleting(false);
        setItemToDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Curriculum Management" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {isTeacher && (
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><BookCopy />Add New Class</CardTitle>
                <CardDescription>Add a new class, e.g., "Class 11".</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-24 w-full" /> : <AddClassForm key={`class-${formKey}`} onFormSubmit={onFormSubmit} />}
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><Book />Add New Subject</CardTitle>
                <CardDescription>Add a new subject to a class.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : <AddSubjectForm key={`subject-${formKey}`} classes={classes || []} onFormSubmit={onFormSubmit} />}
              </CardContent>
            </Card>
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-xl"><ListTree />Add New Topic</CardTitle>
                    <CardDescription>Add a new topic to a subject.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-48 w-full" /> : <AddTopicForm key={`topic-${formKey}`} classes={classes || []} subjects={subjects || []} onFormSubmit={onFormSubmit} />}
                </CardContent>
            </Card>
          </div>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><Library />Curriculum Overview</CardTitle>
            <CardDescription>Browse all classes, subjects, and topics.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : curriculumTree.length > 0 ? (
              <Accordion type="multiple" className="w-full space-y-2">
                {curriculumTree.map(c => (
                  <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                    <div className='flex items-center w-full'>
                      <AccordionTrigger className="text-xl font-semibold px-6 flex-1 hover:no-underline">{c.name}</AccordionTrigger>
                       {isTeacher && (
                          <div className="flex items-center gap-1 pr-4">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit('class', c); }}>
                                  <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteRequest('class', c); }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                          </div>
                       )}
                    </div>
                    <AccordionContent className="px-6">
                      {c.subjects.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-2" defaultValue={c.subjects.map(s => s.id)}>
                            {c.subjects.map(s => (
                                <AccordionItem value={s.id} key={s.id} className="border-l-2 pl-4 border-muted">
                                    <div className="flex items-center w-full">
                                      <AccordionTrigger className="text-lg font-medium flex-1 hover:no-underline">{s.name}</AccordionTrigger>
                                      {isTeacher && (
                                          <div className="flex items-center gap-1 pr-4">
                                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit('subject', s); }}>
                                                  <Edit2 className="h-4 w-4" />
                                              </Button>
                                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteRequest('subject', s); }}>
                                                  <Trash2 className="h-4 w-4 text-destructive" />
                                              </Button>
                                          </div>
                                      )}
                                    </div>
                                    <AccordionContent className="pl-4">
                                      {s.topics.length > 0 ? (
                                        <ul className="list-none space-y-2 pt-2">
                                            {s.topics.map(topic => (
                                                <li key={topic.id} className="flex items-center justify-between group">
                                                    <div>
                                                      <p className="font-medium">{topic.name}</p>
                                                      {topic.description && <p className="text-sm text-muted-foreground">{topic.description}</p>}
                                                    </div>
                                                     {isTeacher && (
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit('topic', topic); }}>
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteRequest('topic', topic); }}>
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </div>
                                                    )}
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
                        <div className="text-center text-muted-foreground py-4">
                          <p>No subjects have been added for this class yet.</p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>No curriculum available yet.</p>
                {isTeacher && <p className='text-sm'>Add a class above to get started!</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!itemToEdit} onOpenChange={(isOpen) => !isOpen && setItemToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {itemToEdit?.type}</DialogTitle>
          </DialogHeader>
          {itemToEdit && !isLoading && (
            <EditForm
              item={itemToEdit}
              classes={classes || []}
              subjects={subjects || []}
              topics={topics || []}
              onFinished={() => setItemToEdit(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.data.name}"
              {itemToDelete?.type !== 'topic' && ' and all of its children (subjects/topics)'}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
