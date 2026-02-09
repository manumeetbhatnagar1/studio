'use client';

import { useState, useMemo, useEffect, FC } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, addDocumentNonBlocking, useMemoFirebase, updateDocumentNonBlocking, doc } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Film, LoaderCircle, Youtube, BookOpen, FileText, Lock, Edit } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const contentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  description: z.string().min(10, 'Description must be at least 10 characters long.'),
  type: z.enum(['video', 'pdf']),
  videoUrl: z.string().url('Please enter a valid video URL.').optional().or(z.literal('')),
  fileUrl: z.string().url('Please enter a valid PDF URL.').optional().or(z.literal('')),
  examTypeId: z.string().min(1, 'You must select an exam type.'),
  classId: z.string().min(1, 'You must select a class.'),
  subjectId: z.string().min(1, 'You must select a subject.'),
  topicId: z.string().min(1, 'You must select a topic.'),
  difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
  accessLevel: z.enum(['free', 'paid']),
}).superRefine((data, ctx) => {
    if (data.type === 'video' && (!data.videoUrl || data.videoUrl.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Video URL is required for video content.',
            path: ['videoUrl'],
        });
    }
    if (data.type === 'pdf' && (!data.fileUrl || data.fileUrl.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'PDF URL is required for PDF content.',
            path: ['fileUrl'],
        });
    }
});


type ExamType = { id: string; name: string; };
type Class = { id: string; name: string; examTypeId: string; };
type Subject = { id: string; name: string; classId: string; };
type Topic = { id: string; name: string; subjectId: string; };
type Content = {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'pdf';
  videoUrl?: string;
  fileUrl?: string;
  topicId: string;
  subjectId: string;
  classId: string;
  examTypeId: string;
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  accessLevel: 'free' | 'paid';
};

const getEmbedUrl = (url: string | undefined): { type: 'youtube' | 'direct' | null; src: string | null } => {
  if (!url) return { type: null, src: null };
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      const videoId = urlObj.hostname.includes('youtu.be')
        ? urlObj.pathname.slice(1)
        : urlObj.searchParams.get('v');
      if (videoId) return { type: 'youtube', src: `https://www.youtube.com/embed/${videoId}` };
    }
    if (url.match(/\.(mp4|webm|ogg)$/)) {
      return { type: 'direct', src: url };
    }
  } catch (error) {
    return { type: null, src: null };
  }
  return { type: null, src: null };
};

const SubscriptionPromptDialog = ({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader>
                 <div className="flex flex-col items-center justify-center text-center p-4">
                    <Lock className="w-16 h-16 text-amber-500 mb-4" />
                    <DialogTitle className="font-headline text-2xl font-semibold text-amber-600">Premium Content Locked</DialogTitle>
                    <DialogDescription className="text-amber-700/80 mt-2 max-w-md">
                        You need an active subscription to access this study material. Please subscribe to unlock all paid content.
                    </DialogDescription>
                </div>
            </DialogHeader>
            <div className="flex justify-center">
                <Button asChild className="mt-4 bg-amber-500 hover:bg-amber-600 text-white">
                    <Link href="/subscription">View Subscription Plans</Link>
                </Button>
            </div>
        </DialogContent>
    </Dialog>
);


function ContentForm({ examTypes, classes, subjects, topics, onFormFinished, contentToEdit }: { examTypes: ExamType[], classes: Class[], subjects: Subject[], topics: Topic[], onFormFinished: () => void, contentToEdit?: Content | null }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!contentToEdit;

  const form = useForm<z.infer<typeof contentSchema>>({
    resolver: zodResolver(contentSchema),
    defaultValues: isEditMode ? {} : {
      title: '',
      description: '',
      type: 'video',
      videoUrl: '',
      fileUrl: '',
      examTypeId: '',
      classId: '',
      subjectId: '',
      topicId: '',
      difficultyLevel: 'Medium',
      accessLevel: 'free',
    },
  });

  useEffect(() => {
    if (isEditMode && contentToEdit) {
      const topic = topics.find(t => t.id === contentToEdit.topicId);
      const subject = subjects.find(s => s.id === (topic?.subjectId || contentToEdit.subjectId));
      const classItem = classes.find(c => c.id === (subject?.classId || contentToEdit.classId));
      const examType = examTypes.find(et => et.id === (classItem?.examTypeId || contentToEdit.examTypeId));

      form.reset({
        ...contentToEdit,
        examTypeId: examType?.id || '',
        classId: classItem?.id || '',
        subjectId: subject?.id || '',
      });
    }
  }, [isEditMode, contentToEdit, topics, subjects, classes, examTypes, form]);


  const contentType = form.watch('type');
  const selectedExamType = form.watch('examTypeId');
  const selectedClass = form.watch('classId');
  const selectedSubject = form.watch('subjectId');

  useEffect(() => { if (!isEditMode || form.getValues('examTypeId') !== selectedExamType) { form.setValue('classId', ''); form.setValue('subjectId', ''); form.setValue('topicId', ''); } }, [selectedExamType, form, isEditMode]);
  useEffect(() => { if (!isEditMode || form.getValues('classId') !== selectedClass) { form.setValue('subjectId', ''); form.setValue('topicId', ''); } }, [selectedClass, form, isEditMode]);
  useEffect(() => { if (!isEditMode || form.getValues('subjectId') !== selectedSubject) { form.setValue('topicId', ''); } }, [selectedSubject, form, isEditMode]);

  const filteredClasses = useMemo(() => { if (!selectedExamType) return []; return classes.filter(c => c.examTypeId === selectedExamType); }, [selectedExamType, classes]);
  const filteredSubjects = useMemo(() => { if (!selectedClass) return []; return subjects.filter(subject => subject.classId === selectedClass); }, [selectedClass, subjects]);
  const filteredTopics = useMemo(() => { if (!selectedSubject) return []; return topics.filter(topic => topic.subjectId === selectedSubject); }, [selectedSubject, topics]);

  const onSubmit = async (values: z.infer<typeof contentSchema>) => {
    setIsSubmitting(true);
    const dataToSave: { [key: string]: any } = { ...values };
    if (dataToSave.type === 'video') {
        dataToSave.fileUrl = '';
    } else {
        dataToSave.videoUrl = '';
    }

    try {
        if (isEditMode && contentToEdit) {
            const contentRef = doc(firestore, 'content', contentToEdit.id);
            await updateDocumentNonBlocking(contentRef, dataToSave);
            toast({ title: 'Content Updated!', description: `${values.title} has been updated.` });
        } else {
            const contentRef = collection(firestore, 'content');
            await addDocumentNonBlocking(contentRef, dataToSave);
            toast({ title: 'Content Added!', description: `${values.title} has been added.` });
            form.reset();
        }
        onFormFinished();
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Operation Failed', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem className="space-y-3"><FormLabel>Content Type</FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-row space-x-4">
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="video" /></FormControl><FormLabel className="font-normal">Video</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="pdf" /></FormControl><FormLabel className="font-normal">PDF</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="accessLevel" render={({ field }) => (
                <FormItem className="space-y-3"><FormLabel>Access Level</FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-row space-x-4">
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="free" /></FormControl><FormLabel className="font-normal">Free</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="paid" /></FormControl><FormLabel className="font-normal">Paid</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g., Introduction to Kinematics" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the key concepts covered." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        {contentType === 'video' && (
            <FormField control={form.control} name="videoUrl" render={({ field }) => (
                <FormItem><FormLabel>Video URL</FormLabel><FormControl><Input placeholder="https://www.youtube.com/watch?v=..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        )}
        {contentType === 'pdf' && (
            <FormField control={form.control} name="fileUrl" render={({ field }) => (
                <FormItem><FormLabel>PDF URL</FormLabel><FormControl><Input placeholder="https://example.com/notes.pdf" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="examTypeId" render={({ field }) => (
            <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
           <FormField control={form.control} name="classId" render={({ field }) => (
            <FormItem><FormLabel>Class</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExamType}><FormControl><SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger></FormControl><SelectContent>{filteredClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="subjectId" render={({ field }) => (
            <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedClass}><FormControl><SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger></FormControl><SelectContent>{filteredSubjects.map(subject => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
           <FormField control={form.control} name="topicId" render={({ field }) => (
            <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedSubject}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{filteredTopics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
            <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
          )} />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> {isEditMode ? 'Saving...' : 'Adding...'}</> : <>{isEditMode ? 'Save Changes' : <><PlusCircle className="mr-2" /> Add Content</>}</>}
        </Button>
      </form>
    </Form>
  );
}

function ContentListItem({ contentItem, canViewPaidContent, canEdit, onEdit }: { contentItem: Content, canViewPaidContent: boolean, canEdit: boolean, onEdit: (item: Content) => void }) {
  const [showSubPrompt, setShowSubPrompt] = useState(false);
  const embed = getEmbedUrl(contentItem.videoUrl);
  const difficultyVariant = { Easy: 'default', Medium: 'secondary', Hard: 'destructive' } as const;
  
  const isLocked = contentItem.accessLevel === 'paid' && !canViewPaidContent;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(contentItem);
  };

  const itemContent = (
    <div className={cn("group flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-all hover:bg-muted/50", isLocked && "bg-muted/50 hover:bg-muted/50 cursor-not-allowed")}>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {isLocked ? <Lock /> : contentItem.type === 'video' ? (embed?.type === 'youtube' ? <Youtube /> : <Film />) : <FileText />}
        </div>
        <div className="flex-1">
            <div className="flex justify-between items-start">
                <h3 className={cn("font-semibold", !isLocked && "group-hover:underline")}>{contentItem.title}</h3>
                 <div className="flex items-center gap-2">
                    {contentItem.accessLevel === 'free' && <Badge variant="secondary">Free</Badge>}
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={handleEditClick}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                </div>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{contentItem.description}</p>
            <div className="mt-2 flex items-center gap-2">
                <Badge variant={difficultyVariant[contentItem.difficultyLevel]}>{contentItem.difficultyLevel}</Badge>
            </div>
        </div>
    </div>
  );

  if (isLocked) {
    return (
      <>
        <div onClick={() => setShowSubPrompt(true)}>
            {itemContent}
        </div>
        <SubscriptionPromptDialog open={showSubPrompt} onOpenChange={setShowSubPrompt} />
      </>
    )
  }

  if (contentItem.type === 'pdf') {
      return (
          <a href={contentItem.fileUrl} target="_blank" rel="noopener noreferrer">
              {itemContent}
          </a>
      )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {itemContent}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{contentItem.title}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video">
          {embed?.type === 'youtube' && embed.src && <iframe src={embed.src} title={contentItem.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="h-full w-full rounded-lg" />}
          {embed?.type === 'direct' && embed.src && <video controls src={embed.src} className="h-full w-full rounded-lg bg-black" />}
          {!embed?.src && <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-destructive-foreground"><p>Invalid or unsupported video URL.</p></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ContentPage() {
  const firestore = useFirestore();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { isSubscribed, isLoading: isSubscribedLoading } = useIsSubscribed();
  const [formKey, setFormKey] = useState(0);
  const [editingContent, setEditingContent] = useState<Content | null>(null);

  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
  const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
  const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  const contentQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'content'), orderBy('title')) : null, [firestore]);
  
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);
  const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
  const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);
  const { data: content, isLoading: areContentLoading } = useCollection<Content>(contentQuery);

  const contentTree = useMemo(() => {
    if (!content || !topics || !subjects || !classes || !examTypes) return [];

    return examTypes.map(et => ({
      ...et,
      classes: classes.filter(c => c.examTypeId === et.id).map(c => ({
        ...c,
        subjects: subjects.filter(s => s.classId === c.id).map(s => ({
          ...s,
          topics: topics.filter(t => t.subjectId === s.id).map(t => ({
            ...t,
            items: content.filter(item => item.topicId === t.id)
          })).filter(t => t.items.length > 0)
        })).filter(s => s.topics.length > 0)
      })).filter(c => c.subjects.length > 0)
    })).filter(et => et.classes.length > 0);
  }, [content, topics, subjects, classes, examTypes]);
  
  const isLoading = isTeacherLoading || isAdminLoading || areExamTypesLoading || areClassesLoading || areSubjectsLoading || areTopicsLoading || areContentLoading || isSubscribedLoading;
  const canEdit = isTeacher || isAdmin;
  const canViewPaidContent = canEdit || isSubscribed;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Study Materials" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {canEdit && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline text-2xl"><PlusCircle /> Add New Content</CardTitle>
              <CardDescription>Fill out the form to add a new video lecture or PDF to the content library.</CardDescription>
            </CardHeader>
            <CardContent>
              {areTopicsLoading || areSubjectsLoading || areClassesLoading || areExamTypesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-1/3" />
                </div>
              ) : (
                <ContentForm key={formKey} examTypes={examTypes || []} classes={classes || []} subjects={subjects || []} topics={topics || []} onFormFinished={() => setFormKey(prev => prev + 1)} />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><BookOpen /> Content Library</CardTitle>
            <CardDescription>Browse materials organized by exam type, class, subject, and topic.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : contentTree.length > 0 ? (
              <Accordion type="multiple" className="w-full space-y-2">
                {contentTree.map(et => (
                  <AccordionItem value={et.id} key={et.id} className="border rounded-lg">
                    <AccordionTrigger className="text-xl font-semibold px-6">{et.name}</AccordionTrigger>
                    <AccordionContent className="px-6 pb-2">
                       <Accordion type="multiple" className="w-full space-y-2" defaultValue={et.classes.map(c => c.id)}>
                        {et.classes.map(c => (
                          <AccordionItem value={c.id} key={c.id} className="border rounded-lg">
                            <AccordionTrigger className="text-lg font-medium px-4">{c.name}</AccordionTrigger>
                            <AccordionContent className="px-4 pb-2">
                              <Accordion type="multiple" className="w-full space-y-2" defaultValue={c.subjects.map(s => s.id)}>
                                {c.subjects.map(s => (
                                <AccordionItem value={s.id} key={s.id} className="border-l-2 pl-4 border-muted">
                                  <AccordionTrigger className="font-medium">{s.name}</AccordionTrigger>
                                  <AccordionContent className="pl-4 pt-2">
                                     <Accordion type="multiple" className="w-full space-y-1" defaultValue={s.topics.map(t => t.id)}>
                                      {s.topics.map(t => (
                                        <AccordionItem value={t.id} key={t.id} className="border-none">
                                          <AccordionTrigger className="text-sm py-2">{t.name}</AccordionTrigger>
                                          <AccordionContent className="pl-4">
                                              <div className="grid gap-4 pt-2">
                                                {t.items.map(item => <ContentListItem key={item.id} contentItem={item} canViewPaidContent={canViewPaidContent} canEdit={canEdit} onEdit={setEditingContent} />)}
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
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>No study materials available yet.</p>
                <p className='text-sm'>{canEdit ? 'Add some content above to get started!' : 'Please check back later.'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editingContent} onOpenChange={(open) => !open && setEditingContent(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>
          {editingContent && !isLoading && (
            <ContentForm
              contentToEdit={editingContent}
              examTypes={examTypes || []}
              classes={classes || []}
              subjects={subjects || []}
              topics={topics || []}
              onFormFinished={() => setEditingContent(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
