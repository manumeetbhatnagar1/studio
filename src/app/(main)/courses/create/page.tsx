'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import DashboardHeader from '@/components/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { LoaderCircle, Book, GraduationCap } from 'lucide-react';

const courseSchema = z.object({
    title: z.string().min(5, 'Title must be at least 5 characters.'),
    description: z.string().min(20, 'Description must be at least 20 characters.'),
    price: z.coerce.number().min(0, 'Price cannot be negative.'),
    imageUrl: z.string().url('Please enter a valid image URL.'),
    classLevel: z.enum(['Class 11', 'Class 12', 'Dropper', 'All']),
    subjectIds: z.array(z.string()).refine((value) => value.length > 0, {
        message: 'You must select at least one subject.',
    }),
    contentIds: z.array(z.string()).optional(),
});

type Subject = { id: string; name: string; classId: string; };
type Class = { id: string; name: string; };
type Content = {
  id: string;
  title: string;
  subjectId: string;
};


export default function CreateCoursePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const subjectsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null, [firestore]);
    const classesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null, [firestore]);
    const contentQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'content'), orderBy('title')) : null, [firestore]);

    const { data: subjects, isLoading: areSubjectsLoading } = useCollection<Subject>(subjectsQuery);
    const { data: classes, isLoading: areClassesLoading } = useCollection<Class>(classesQuery);
    const { data: allContent, isLoading: areContentLoading } = useCollection<Content>(contentQuery);

    const form = useForm<z.infer<typeof courseSchema>>({
        resolver: zodResolver(courseSchema),
        defaultValues: {
            title: '',
            description: '',
            price: 0,
            imageUrl: '',
            classLevel: 'All',
            subjectIds: [],
            contentIds: [],
        },
    });

    const selectedClass = form.watch('classLevel');
    const selectedSubjects = form.watch('subjectIds');

    const filteredSubjects = useMemo(() => {
        if (selectedClass === 'All' || !subjects || !classes) {
            return subjects || [];
        }
        const targetClass = classes.find(c => c.name === selectedClass);
        if (!targetClass) return [];
        return subjects.filter(s => s.classId === targetClass.id);
    }, [selectedClass, subjects, classes]);

    const filteredContent = useMemo(() => {
        if (!selectedSubjects || selectedSubjects.length === 0 || !allContent) {
            return [];
        }
        return allContent.filter(content => selectedSubjects.includes(content.subjectId));
    }, [selectedSubjects, allContent]);


    async function onSubmit(values: z.infer<typeof courseSchema>) {
        if (!user) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to create a course.' });
            return;
        }
        setIsSubmitting(true);

        try {
            const coursesRef = collection(firestore, 'courses');
            await addDocumentNonBlocking(coursesRef, {
                ...values,
                teacherId: user.uid,
                teacherName: user.displayName || 'Anonymous Teacher',
                createdAt: serverTimestamp(),
            });

            toast({ title: 'Course Created!', description: `"${values.title}" is now available.` });
            router.push('/courses');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Failed to create course',
                description: error.message || 'An unexpected error occurred.',
            });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const isLoading = areSubjectsLoading || areClassesLoading || areContentLoading;

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Create a New Course" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <CardTitle className="font-headline text-2xl flex items-center gap-2"><GraduationCap /> Course Details</CardTitle>
                            <CardDescription>Fill out the form to create a new paid course for students.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-6">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-10 w-1/2" />
                                </div>
                            ) : (
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                        <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>Course Title</FormLabel><FormControl><Input placeholder="e.g., Ultimate JEE Advanced Physics" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Course Description</FormLabel><FormControl><Textarea placeholder="Describe what students will learn in this course..." {...field} rows={5} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Promotional Image URL</FormLabel><FormControl><Input placeholder="https://example.com/course-image.png" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField control={form.control} name="price" render={({ field }) => (<FormItem><FormLabel>Price (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 4999" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={form.control} name="classLevel" render={({ field }) => (<FormItem><FormLabel>Target Class Level</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Class 11">Class 11</SelectItem><SelectItem value="Class 12">Class 12</SelectItem><SelectItem value="Dropper">Dropper</SelectItem><SelectItem value="All">All</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                        </div>

                                        <FormField control={form.control} name="subjectIds" render={() => (
                                            <FormItem>
                                                <div className="mb-4"><FormLabel>Included Subjects</FormLabel></div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 rounded-md border p-4">
                                                    {filteredSubjects.map((item) => (
                                                        <FormField key={item.id} control={form.control} name="subjectIds" render={({ field }) => (
                                                            <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                                <FormControl>
                                                                    <Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {
                                                                        return checked ? field.onChange([...field.value, item.id]) : field.onChange(field.value?.filter((value) => value !== item.id));
                                                                    }}/>
                                                                </FormControl>
                                                                <FormLabel className="font-normal">{item.name}</FormLabel>
                                                            </FormItem>
                                                        )} />
                                                    ))}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )} />

                                        <FormField
                                            control={form.control}
                                            name="contentIds"
                                            render={() => (
                                                <FormItem>
                                                    <div className="mb-4">
                                                        <FormLabel>Included Content</FormLabel>
                                                        <FormDescription>
                                                            Select content to include in this course. Content will be filtered based on the subjects you selected above.
                                                        </FormDescription>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4 max-h-96 overflow-y-auto">
                                                        {filteredContent.length > 0 ? filteredContent.map((item) => (
                                                            <FormField
                                                                key={item.id}
                                                                control={form.control}
                                                                name="contentIds"
                                                                render={({ field }) => (
                                                                    <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                                        <FormControl>
                                                                            <Checkbox
                                                                                checked={field.value?.includes(item.id)}
                                                                                onCheckedChange={(checked) => {
                                                                                    return checked
                                                                                        ? field.onChange([...(field.value || []), item.id])
                                                                                        : field.onChange(field.value?.filter((value) => value !== item.id));
                                                                                }}
                                                                            />
                                                                        </FormControl>
                                                                        <FormLabel className="font-normal">{item.title}</FormLabel>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )) : (
                                                            <p className="text-muted-foreground col-span-2 text-center">Select subjects to see available content.</p>
                                                        )}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <Button type="submit" disabled={isSubmitting} size="lg">
                                            {isSubmitting ? (<><LoaderCircle className="mr-2 animate-spin" /> Creating Course...</>) : (<>Create Course</>)}
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
