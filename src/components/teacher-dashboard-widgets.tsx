'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Video } from 'lucide-react';

type LiveClass = {
  startTime: { toDate: () => Date };
  teacherId: string;
};

export default function TeacherDashboardWidgets() {
    const { user } = useUser();
    const firestore = useFirestore();

    const liveClassesQuery = useMemoFirebase(
        () => user ? query(collection(firestore, 'live_classes'), where('teacherId', '==', user.uid)) : null,
        [firestore, user]
    );
    const { data: liveClasses, isLoading } = useCollection<LiveClass>(liveClassesQuery);

    const classStats = useMemo(() => {
        if (!liveClasses) return { upcoming: 0, past: 0 };
        const now = new Date();
        return {
            upcoming: liveClasses.filter(c => c.startTime.toDate() >= now).length,
            past: liveClasses.filter(c => c.startTime.toDate() < now).length,
        };
    }, [liveClasses]);

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Upcoming Classes</CardTitle>
                        <Video className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16" />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Past Classes</CardTitle>
                        <Video className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16" />
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Upcoming Classes</CardTitle>
                    <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{classStats.upcoming}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Past Classes Taught</CardTitle>
                    <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{classStats.past}</div>
                </CardContent>
            </Card>
        </div>
    );
}
