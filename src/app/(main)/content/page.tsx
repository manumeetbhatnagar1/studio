'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, addDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Film, LoaderCircle, Youtube, BookOpen } from 'lucide-react';

const contentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  description: z.string().min(10, 'Description must be at least 10 characters long.'),
  url: z.string().url('Please enter a valid video URL.'),
  topicId: z.string().min(1, 'You must select a topic.'),
  difficultyLevel: z.enum(['Easy', 'Medium', 'Hard']),
  examCategory: z.enum(['JEE Main', 'JEE Advanced', 'Both']),
  type: z.literal('video'),
});

type Topic = { id: string; name: string; subjectId: string; };
type Content = z.infer<typeof contentSchema> & { id: string; };

const getEmbedUrl = (url: string): { type: 'youtube' | 'direct' | null; src: string | null } => {
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

function ContentForm({ topics, onFormReset }: { topics: Topic[]; onFormReset: () => void }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<z.infer<typeof contentSchema>>({
    resolver: zodResolver(contentSchema),
    defaultValues: {
      title: '',
      description: '',
      url: '',
      topicId: '',
      difficultyLevel: 'Medium',
      examCategory: 'Both',
      type: 'video',
    },
  });

  const onSubmit = (values: z.infer<typeof contentSchema>) => {
    setIsSubmitting(true);
    const contentRef = collection(firestore, 'content');
    addDocumentNonBlocking(contentRef, values);
    toast({
      title: 'Video Added!',
      description: `${values.title} has been added to the library.`,
    });
    form.reset();
    onFormReset();
    setIsSubmitting(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem><FormLabel>Video Title</FormLabel><FormControl><Input placeholder="e.g., Introduction to Kinematics" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the key concepts covered in the video." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="url" render={({ field }) => (
          <FormItem><FormLabel>Video URL</FormLabel><FormControl><Input placeholder="https://www.youtube.com/watch?v=..." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="topicId" render={({ field }) => (
            <FormItem><FormLabel>Topic</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a topic" /></SelectTrigger></FormControl><SelectContent>{topics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="difficultyLevel" render={({ field }) => (
            <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent></Select><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="examCategory" render={({ field }) => (
            <FormItem><FormLabel>Exam Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="JEE Main">JEE Main</SelectItem><SelectItem value="JEE Advanced">JEE Advanced</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select><FormMessage /></FormItem>
          )} />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : <><PlusCircle className="mr-2" /> Add Video</>}
        </Button>
      </form>
    </Form>
  );
}

function VideoListItem({ contentItem }: { contentItem: Content }) {
  const embed = getEmbedUrl(contentItem.url);
  const difficultyVariant = { Easy: 'default', Medium: 'secondary', Hard: 'destructive' } as const;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="group flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-all hover:bg-muted/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {embed?.type === 'youtube' ? <Youtube /> : <Film />}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold group-hover:underline">{contentItem.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{contentItem.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={difficultyVariant[contentItem.difficultyLevel]}>{contentItem.difficultyLevel}</Badge>
              <Badge variant="outline">{contentItem.examCategory}</Badge>
            </div>
          </div>
        </div>
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
  const [formKey, setFormKey] = useState(0);

  const topicsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'topics'), orderBy('name')) : null, [firestore]);
  const contentQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'content'), orderBy('topicId')) : null, [firestore]);

  const { data: topics, isLoading: areTopicsLoading } = useCollection<Topic>(topicsQuery);
  const { data: content, isLoading: areContentLoading } = useCollection<Content>(contentQuery);

  const contentByTopic = useMemo(() => {
    if (!content || !topics) return {};
    return content.reduce((acc, item) => {
      const topic = topics.find(t => t.id === item.topicId);
      const topicName = topic ? topic.name : "Uncategorized";
      (acc[topicName] = acc[topicName] || []).push(item);
      return acc;
    }, {} as Record<string, Content[]>);
  }, [content, topics]);
  
  const sortedTopics = useMemo(() => Object.keys(contentByTopic).sort(), [contentByTopic]);

  const isLoading = isTeacherLoading || areTopicsLoading || areContentLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Video Lectures" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid gap-8">
        {isTeacher && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline text-2xl"><PlusCircle /> Add New Video</CardTitle>
              <CardDescription>Fill out the form to add a new video lecture to the content library.</CardDescription>
            </CardHeader>
            <CardContent>
              {areTopicsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-1/3" />
                </div>
              ) : (
                <ContentForm key={formKey} topics={topics || []} onFormReset={() => setFormKey(prev => prev + 1)} />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><BookOpen /> Content Library</CardTitle>
            <CardDescription>Browse video lectures organized by topic.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : sortedTopics.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {sortedTopics.map(topicName => (
                  <AccordionItem value={topicName} key={topicName}>
                    <AccordionTrigger className="text-lg font-medium">{topicName}</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 pt-2">
                        {contentByTopic[topicName].map(item => <VideoListItem key={item.id} contentItem={item} />)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p className='font-medium'>No video lectures available yet.</p>
                <p className='text-sm'>{isTeacher ? 'Add a video above to get started!' : 'Please check back later.'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

    