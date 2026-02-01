'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, ArrowRight, GraduationCap } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type Course = {
    id: string;
    title: string;
    description: string;
    teacherName: string;
    price: number;
    imageUrl?: string;
    classLevel: string;
};

function CourseCard({ course }: { course: Course }) {
    const placeholder = PlaceHolderImages.find(img => img.id === 'content-delivery');
    return (
        <Card className="flex flex-col overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
            <div className="relative h-48 w-full">
                <Image
                    src={course.imageUrl || placeholder?.imageUrl || 'https://picsum.photos/seed/course/600/400'}
                    alt={course.title}
                    fill
                    className="object-cover"
                />
            </div>
            <CardHeader>
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="font-headline text-xl">{course.title}</CardTitle>
                    <Badge variant="secondary">{course.classLevel}</Badge>
                </div>
                <CardDescription>by {course.teacherName}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>
            </CardContent>
            <CardFooter className="flex justify-between items-center bg-muted/50 p-4">
                <p className="text-xl font-bold text-primary">₹{course.price.toLocaleString()}</p>
                <Button asChild>
                    <Link href={`/courses/${course.id}`}>
                        View Details <ArrowRight className="ml-2" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
}


export default function CoursesPage() {
    const firestore = useFirestore();
    const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

    const coursesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'courses'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const { data: courses, isLoading: areCoursesLoading } = useCollection<Course>(coursesQuery);

    const isLoading = isTeacherLoading || areCoursesLoading;

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Courses" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-headline text-2xl font-semibold">Explore Our Courses</h2>
                    {isTeacher && (
                        <Button asChild>
                            <Link href="/courses/create">
                                <PlusCircle className="mr-2" /> Create New Course
                            </Link>
                        </Button>
                    )}
                </div>

                {isLoading ? (
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        <Skeleton className="h-96 w-full" />
                        <Skeleton className="h-96 w-full" />
                        <Skeleton className="h-96 w-full" />
                    </div>
                ) : courses && courses.length > 0 ? (
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {courses.map(course => (
                            <CourseCard key={course.id} course={course} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg bg-muted/50 h-full">
                        <GraduationCap className="w-20 h-20 text-muted-foreground mb-4" />
                        <h3 className="font-headline text-2xl font-semibold">No Courses Available Yet</h3>
                        <p className="text-muted-foreground mt-2 max-w-md">
                            {isTeacher ? "Create the first course to get started!" : "Please check back later for new and exciting courses."}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
