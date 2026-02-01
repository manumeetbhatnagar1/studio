'use client';

import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, documentId } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, BookOpen, Clock, GraduationCap, IndianRupee } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type Course = {
    id: string;
    title: string;
    description: string;
    teacherName: string;
    price: number;
    imageUrl?: string;
    classLevel: string;
    subjectIds: string[];
    contentIds?: string[];
};

type Content = {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'pdf';
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
};

function ContentListItem({ contentItem }: { contentItem: Content }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md hover:bg-muted">
        <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
                <p className="font-semibold">{contentItem.title}</p>
                <p className="text-sm text-muted-foreground">{contentItem.description}</p>
            </div>
        </div>
        <Badge variant="outline">{contentItem.difficultyLevel}</Badge>
    </div>
  );
}

export default function CourseDetailPage() {
    const { courseId } = useParams() as { courseId: string };
    const firestore = useFirestore();

    const courseDocRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return doc(firestore, 'courses', courseId);
    }, [firestore, courseId]);

    const { data: course, isLoading: isCourseLoading } = useDoc<Course>(courseDocRef);

    const contentQuery = useMemoFirebase(() => {
        if (!firestore || !course?.contentIds || course.contentIds.length === 0) return null;
        // Firestore 'in' query is limited to 30 items
        return query(collection(firestore, 'content'), where(documentId(), 'in', course.contentIds.slice(0, 30)));
    }, [firestore, course]);
    
    const { data: courseContent, isLoading: isContentLoading } = useCollection<Content>(contentQuery);

    const isLoading = isCourseLoading || isContentLoading;
    const placeholder = PlaceHolderImages.find(img => img.id === 'content-delivery');

    if (isLoading) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Course Details" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
                        <div className="md:col-span-2 space-y-6">
                            <Skeleton className="h-12 w-3/4" />
                            <Skeleton className="h-6 w-1/2" />
                            <Skeleton className="h-32 w-full" />
                            <Skeleton className="h-48 w-full" />
                        </div>
                        <div className="space-y-6">
                            <Skeleton className="h-64 w-full" />
                        </div>
                    </div>
                </main>
            </div>
        );
    }
    
    if (!course) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Course Not Found" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Course Not Found</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>The course you are looking for does not exist or has been removed.</p>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }


    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title={course.title} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
                    {/* Main content */}
                    <div className="lg:col-span-2 space-y-8">
                        <div>
                            <p className="text-sm text-primary font-semibold">{course.classLevel}</p>
                            <h1 className="font-headline text-4xl font-bold mt-1">{course.title}</h1>
                            <p className="mt-2 text-lg text-muted-foreground">Taught by {course.teacherName}</p>
                        </div>
                        <Card>
                            <CardHeader>
                                <CardTitle>About this course</CardTitle>
                            </CardHeader>
                            <CardContent className="prose max-w-none text-muted-foreground">
                                <p>{course.description}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>What you'll learn</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {courseContent && courseContent.length > 0 ? (
                                    courseContent.map(content => <ContentListItem key={content.id} contentItem={content} />)
                                ) : (
                                    <p className="text-muted-foreground text-center p-4">No specific learning materials have been added to this course yet.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="overflow-hidden shadow-lg sticky top-24">
                            <div className="relative h-56 w-full">
                                <Image
                                    src={course.imageUrl || placeholder?.imageUrl || 'https://picsum.photos/seed/course/600/400'}
                                    alt={course.title}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <CardContent className="p-6 space-y-4">
                               <div className="flex items-center gap-2">
                                    <p className="text-4xl font-bold flex items-center"><IndianRupee className="h-7 w-7" />{course.price.toLocaleString()}</p>
                               </div>
                               <Button size="lg" className="w-full">Enroll in course <ArrowRight className="ml-2" /></Button>
                               <div className="text-sm text-muted-foreground space-y-3 pt-4">
                                   <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /><span>Full course access</span></div>
                                   <div className="flex items-center gap-2"><BookOpen className="h-5 w-5" /><span>Lectures and study material</span></div>
                                   <div className="flex items-center gap-2"><Clock className="h-5 w-5" /><span>Learn at your own pace</span></div>
                               </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
