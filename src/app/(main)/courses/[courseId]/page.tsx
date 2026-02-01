'use client';

import { useParams } from 'next/navigation';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CourseDetailPage() {
    const { courseId } = useParams() as { courseId: string };

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Course Details" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                 <Card>
                    <CardHeader>
                        <CardTitle>Course Detail Page</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Details for course with ID: {courseId}</p>
                        <p className="mt-4 text-muted-foreground">This is a placeholder page. More content will be added here soon!</p>
                    </CardContent>
                 </Card>
            </main>
        </div>
    );
}
