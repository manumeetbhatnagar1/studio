'use client';

import { useState, useMemo, FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useCollection, addDocumentNonBlocking, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { useIsAdmin } from '@/hooks/useIsAdmin';
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
import { PlusCircle, LoaderCircle, Book, Library, ListTree, BookCopy, Edit2, Trash2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

// Zod schemas
const examTypeSchema = z.object({
    name: z.string().min(2, 'Exam Type name must be at least 2 characters.'),
});

const classSchema = z.object({
  name: z.string().min(2, 'Class name must be at least 2 characters.'),
  examTypeId: z.string().min(1, 'You must select an exam type.'),
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
type ExamType = { id: string; name: string; };
type Class = { id: string; name: string; examTypeId: string; };
type Subject = { id: string; name: string; classId: string };
type Topic = { id: string; name: string; description?: string; subjectId: string; };

// Add Exam Type Form
const AddExamTypeForm: FC<{ onFormSubmit: () => void }> = ({ onFormSubmit }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
  
    const form = useForm<z.infer<typeof examTypeSchema>>({
      resolver: zodResolver(examTypeSchema),
      defaultValues: { name: '' },
    });
  
    function onSubmit(values: z.infer<typeof examTypeSchema>) {
      setIsSubmitting(true);
      const examTypesRef = collection(firestore, 'exam_types');
      addDocumentNonBlocking(examTypesRef, values);
      toast({ title: 'Exam Type Added!', description: `"${values.name}" has been added.` });
      form.reset();
      onFormSubmit();
      setIsSubmitting(false);
    }
  
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Exam Type Name</FormLabel>
              <FormControl><Input placeholder="e.g., IIT-JEE" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            Add Exam Type
          </Button>
        </form>
      </Form>
    );
};

// Add Class Form
const AddClassForm: FC<{ examTypes: ExamType[], onFormSubmit: () => void }> = ({ examTypes, onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof classSchema>>({
    resolver: zodResolver(classSchema),
    defaultValues: { name: '', examTypeId: '' },
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
        <FormField control={form.control} name="examTypeId" render={({ field }) => (
            <FormItem>
                <FormLabel>Exam Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                    <SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
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
const AddSubjectForm: FC<{ examTypes: ExamType[], classes: Class[], onFormSubmit: () => void }> = ({ examTypes, classes, onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof subjectSchema> & { examTypeId: string }>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '', classId: '', examTypeId: '' },
  });

  const selectedExamTypeId = form.watch('examTypeId');

  const filteredClasses = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classes.filter(c => c.examTypeId === selectedExamTypeId);
  }, [selectedExamTypeId, classes]);

  useEffect(() => {
    form.setValue('classId', '');
  }, [selectedExamTypeId, form]);

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
        <FormField control={form.control} name="examTypeId" render={({ field }) => (
            <FormItem>
                <FormLabel>Exam Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                    <SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
        <FormField control={form.control} name="classId" render={({ field }) => (
            <FormItem>
                <FormLabel>Class</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamTypeId}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                    <SelectContent>{filteredClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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
const AddTopicForm: FC<{ examTypes: ExamType[], classes: Class[], subjects: Subject[], onFormSubmit: () => void }> = ({ examTypes, classes, subjects, onFormSubmit }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
  
    const form = useForm<z.infer<typeof topicSchema> & { classId: string, examTypeId: string }>({
      resolver: zodResolver(topicSchema),
      defaultValues: { name: '', description: '', subjectId: '', classId: '', examTypeId: '' },
    });

    const selectedExamTypeId = form.watch('examTypeId');
    const selectedClassId = form.watch('classId');

    const filteredClasses = useMemo(() => {
        if (!selectedExamTypeId) return [];
        return classes.filter(c => c.examTypeId === selectedExamTypeId);
    }, [selectedExamTypeId, classes]);

    const filteredSubjects = useMemo(() => {
        if (!selectedClassId) return [];
        return subjects.filter(s => s.classId === selectedClassId);
    }, [selectedClassId, subjects]);

    useEffect(() => {
        form.setValue('classId', '');
        form.setValue('subjectId', '');
    }, [selectedExamTypeId, form]);

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
            <FormField control={form.control} name="examTypeId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Exam Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl>
                        <SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="classId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamTypeId}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl>
                        <SelectContent>{filteredClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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
  item: { type: 'examType' | 'class' | 'subject' | 'topic'; data: any };
  examTypes: ExamType[];
  classes: Class[];
  subjects: Subject[];
  onFinished: () => void;
}> = ({ item, examTypes, classes, subjects, onFinished }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isExamType = item.type === 'examType';
  const isClass = item.type === 'class';
  const isSubject = item.type === 'subject';
  const isTopic = item.type === 'topic';

  let schema: z.ZodType<any> = z.object({});
  if (isExamType) schema = examTypeSchema;
  if (isClass) schema = classSchema;
  if (isSubject) schema = subjectSchema;
  if (isTopic) schema = topicSchema;

  let defaultValues: any = { ...item.data };
  if (isSubject) {
    const classItem = classes.find(c => c.id === item.data.classId);
    defaultValues.examTypeId = classItem?.examTypeId || '';
  } else if (isTopic) {
    const subject = subjects.find(s => s.id === item.data.subjectId);
    const classItem = classes.find(c => c.id === subject?.classId);
    defaultValues.examTypeId = classItem?.examTypeId || '';
    defaultValues.classId = subject?.classId || '';
  }

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const selectedExamTypeId = form.watch('examTypeId');
  const selectedClassId = form.watch('classId');
  
  const filteredClasses = useMemo(() => {
    if (!selectedExamTypeId) return [];
    return classes.filter(c => c.examTypeId === selectedExamTypeId);
  }, [selectedExamTypeId, classes]);

  const filteredSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    return subjects.filter(s => s.classId === selectedClassId);
  }, [selectedClassId, subjects]);

  useEffect(() => {
    if (isSubject) {
        const classItem = classes.find(c => c.id === form.getValues('classId'));
        if (classItem && classItem.examTypeId !== selectedExamTypeId) {
            form.setValue('classId', '');
        }
    } else if (isTopic) {
        const subjectItem = subjects.find(s => s.id === form.getValues('subjectId'));
        const classItem = classes.find(c => c.id === subjectItem?.classId);
        if (classItem && classItem.examTypeId !== selectedExamTypeId) {
            form.setValue('classId', '');
            form.setValue('subjectId', '');
        } else if (subjectItem && subjectItem.classId !== selectedClassId) {
            form.setValue('subjectId', '');
        }
    }
  }, [selectedExamTypeId, selectedClassId, form, isSubject, isTopic, classes, subjects]);

  async function onSubmit(values: any) {
    setIsSubmitting(true);
    const { examTypeId, classId, ...dataToSave } = values;
    const collectionName = item.type === 'examType' ? 'exam_types' : `${item.type}s`;
    const docRef = doc(firestore, collectionName, item.data.id);

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
        {isExamType && (
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Exam Type Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        )}
        {isClass && (
            <>
                <FormField control={form.control} name="examTypeId" render={({ field }) => (
                    <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Class Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </>
        )}
        {isSubject && (
            <>
                <FormField control={form.control} name="examTypeId" render={({ field }) => (
                    <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{examTypes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="classId" render={({ field }) => (
                    <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamTypeId}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{filteredClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Subject Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </>
        )}
        {isTopic && (
            <>
                <FormField control={form.control} name="examTypeId" render={({ field }) => (
                    <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{examTypes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="classId" render={({ field }) => (
                    <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamTypeId}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{filteredClasses.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
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
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formKey, setFormKey] = useState(0);
  const [itemToEdit, setItemToEdit] = useState<{type: 'examType' | 'class' | 'subject' | 'topic', data: any} | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{type: 'examType' | 'class' | 'subject' | 'topic', data: any} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);

  const curriculumTree = useMemo(() => {
    if (!examTypes || !classes || !subjects || !topics) return [];

    const sortedExamTypes = [...examTypes].sort((a,b) => a.name.localeCompare(b.name));
    
    return sortedExamTypes.map(et => {
        const examClasses = [...classes]
            .filter(c => c.examTypeId === et.id)
            .sort((a,b) => a.name.localeCompare(b.name));

        const classesWithSubjects = examClasses.map(c => {
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

        return { ...et, classes: classesWithSubjects };
    });

  }, [examTypes, classes, subjects, topics]);


  const isLoading = isAdminLoading || areExamTypesLoading || areClassesLoading || areSubjectsLoading || areTopicsLoading;
  const onFormSubmit = () => setFormKey(prev => prev + 1);

  const handleEdit = (type: 'examType' | 'class' | 'subject' | 'topic', data: any) => {
    setItemToEdit({ type, data });
  };

  const handleDeleteRequest = (type: 'examType' | 'class' | 'subject' | 'topic', data: any) => {
    setItemToDelete({ type, data });
  };
  
  const confirmDelete = async () => {
    if (!itemToDelete || !firestore) return;
    setIsDeleting(true);

    try {
        const batch = writeBatch(firestore);
        const { type, data } = itemToDelete;

        if (type === 'examType') {
            const examTypeId = data.id;
            batch.delete(doc(firestore, 'exam_types', examTypeId));

            const classesQuerySnapshot = await getDocs(query(collection(firestore, 'classes'), where('examTypeId', '==', examTypeId)));
            if (!classesQuerySnapshot.empty) {
                const classIds = classesQuerySnapshot.docs.map(d => d.id);
                classesQuerySnapshot.docs.forEach(d => batch.delete(d.ref));

                for (let i = 0; i < classIds.length; i+=30) {
                    const classChunk = classIds.slice(i, i+30);
                    const subjectsQuerySnapshot = await getDocs(query(collection(firestore, 'subjects'), where('classId', 'in', classChunk)));
                    if (!subjectsQuerySnapshot.empty) {
                        const subjectIds = subjectsQuerySnapshot.docs.map(d => d.id);
                        subjectsQuerySnapshot.docs.forEach(d => batch.delete(d.ref));
                        
                        for (let j = 0; j < subjectIds.length; j += 30) {
                            const subjectChunk = subjectIds.slice(j, j + 30);
                            const topicsQuery = query(collection(firestore, 'topics'), where('subjectId', 'in', subjectChunk));
                            const topicsSnapshot = await getDocs(topicsQuery);
                            topicsSnapshot.docs.forEach(d => batch.delete(d.ref));
                        }
                    }
                }
            }
        } else if (type === 'class') {
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
        toast({ title: `${type.charAt(0).toUpperCase() + itemToDelete.type.slice(1)} Deleted`, description: `"${data.name}" and any associated children have been removed.` });
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
        {isAdmin && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-xl"><Tag />Add Exam Type</CardTitle>
                    <CardDescription>Add a new exam type, e.g., "NEET".</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-24 w-full" /> : <AddExamTypeForm key={`examType-${formKey}`} onFormSubmit={onFormSubmit} />}
                </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><BookCopy />Add New Class</CardTitle>
                <CardDescription>Add a new class, e.g., "Class 11".</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-24 w-full" /> : <AddClassForm key={`class-${formKey}`} examTypes={examTypes || []} onFormSubmit={onFormSubmit} />}
              </CardContent>
            </Card>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><Book />Add New Subject</CardTitle>
                <CardDescription>Add a new subject to a class.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : <AddSubjectForm key={`subject-${formKey}`} examTypes={examTypes || []} classes={classes || []} onFormSubmit={onFormSubmit} />}
              </CardContent>
            </Card>
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-xl"><ListTree />Add New Topic</CardTitle>
                    <CardDescription>Add a new topic to a subject.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Skeleton className="h-48 w-full" /> : <AddTopicForm key={`topic-${formKey}`} examTypes={examTypes || []} classes={classes || []} subjects={subjects || []} onFormSubmit={onFormSubmit} />}
                </CardContent>
            </Card>
          </div>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><Library />Curriculum Overview</CardTitle>
            <CardDescription>Browse all exam types, classes, subjects, and topics.</CardDescription>
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
                {curriculumTree.map(et => (
                  <AccordionItem value={et.id} key={et.id} className="border rounded-lg">
                    <div className='flex items-center w-full'>
                      <AccordionTrigger className="text-2xl font-semibold px-6 flex-1 hover:no-underline">{et.name}</AccordionTrigger>
                       {isAdmin && (
                          <div className="flex items-center gap-1 pr-4">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit('examType', et); }}>
                                  <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteRequest('examType', et); }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                          </div>
                       )}
                    </div>
                    <AccordionContent className="px-6">
                        {et.classes.length > 0 ? (
                            <Accordion type="multiple" className="w-full space-y-2" defaultValue={et.classes.map(c => c.id)}>
                                {et.classes.map(c => (
                                <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                                    <div className='flex items-center w-full'>
                                    <AccordionTrigger className="text-xl font-semibold px-6 flex-1 hover:no-underline">{c.name}</AccordionTrigger>
                                    {isAdmin && (
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
                                                    {isAdmin && (
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
                                                                    {isAdmin && (
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
                            <div className="text-center text-muted-foreground py-4">
                                <p>No classes have been added for this exam type yet.</p>
                            </div>
                        )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>No curriculum available yet.</p>
                {isAdmin && <p className='text-sm'>Add an exam type above to get started!</p>}
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
              examTypes={examTypes || []}
              classes={classes || []}
              subjects={subjects || []}
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
              {itemToDelete?.type !== 'topic' && ' and all of its children (classes, subjects, topics)'}. This action cannot be undone.
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
