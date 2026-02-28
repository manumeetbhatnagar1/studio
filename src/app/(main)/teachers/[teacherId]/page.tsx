'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, query, where } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Crown, PlayCircle, Sparkles, Star, Video, BookOpenText, FileText } from 'lucide-react';
import { isStandaloneMockTest } from '@/lib/mock-test-visibility';

type TeachingAssignment = {
  examTypeId: string;
  classId: string;
  allSubjects?: boolean;
  subjectIds?: string[];
};

type TeacherProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  roleId?: 'student' | 'teacher' | 'admin';
  status?: 'active' | 'blocked';
  platformRating?: number;
  rating?: number;
  totalRatings?: number;
  bio?: string;
  about?: string;
  teachingAssignments?: TeachingAssignment[];
};

type ExamType = { id: string; name: string };
type ClassItem = { id: string; name: string; examTypeId: string };
type Subject = { id: string; name: string; classId: string };

type Course = {
  id: string;
  title?: string;
  description?: string;
  teacherId?: string;
  accessLevel?: 'free' | 'paid';
  subscriptionAttached?: boolean;
  publicationStatus?: 'draft' | 'published';
  examTypeId?: string;
  classId?: string;
  subjectIds?: string[];
  createdAt?: { toDate?: () => Date } | Date | string;
};

type MockTest = {
  id: string;
  title?: string;
  teacherId?: string;
  accessLevel?: 'free' | 'paid';
  publicationStatus?: 'draft' | 'published';
  isCourseOnly?: boolean;
  courseId?: string;
  examTypeId?: string;
  classId?: string;
  examLevel?: 'All' | 'weak' | 'medium' | 'strong';
  startTime?: { toDate?: () => Date } | Date | string;
};

type LiveBatch = {
  id: string;
  title?: string;
  description?: string;
  teacherId?: string;
  accessLevel?: 'free' | 'paid';
  publicationStatus?: 'draft' | 'published';
  subscriptionAttached?: boolean;
  examTypeId?: string;
  classId?: string;
  subjectIds?: string[];
  createdAt?: { toDate?: () => Date } | Date | string;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function TeacherProfilePage() {
  const params = useParams<{ teacherId: string }>();
  const teacherId = typeof params?.teacherId === 'string' ? params.teacherId : '';
  const firestore = useFirestore();

  const teacherDocRef = useMemoFirebase(() => (firestore && teacherId ? doc(firestore, 'users', teacherId) : null), [firestore, teacherId]);
  const examTypesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'exam_types')) : null), [firestore]);
  const classesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'classes')) : null), [firestore]);
  const subjectsQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'subjects')) : null), [firestore]);

  const freeCoursesQ = useMemoFirebase(
    () => (firestore && teacherId ? query(collection(firestore, 'courses'), where('teacherId', '==', teacherId), where('accessLevel', '==', 'free')) : null),
    [firestore, teacherId]
  );
  const paidLiveCoursesQ = useMemoFirebase(
    () =>
      firestore && teacherId
        ? query(
            collection(firestore, 'courses'),
            where('teacherId', '==', teacherId),
            where('accessLevel', '==', 'paid'),
            where('subscriptionAttached', '==', true)
          )
        : null,
    [firestore, teacherId]
  );
  const publishedTestsQ = useMemoFirebase(
    () =>
      firestore && teacherId
        ? query(collection(firestore, 'mock_tests'), where('teacherId', '==', teacherId), where('publicationStatus', '==', 'published'))
        : null,
    [firestore, teacherId]
  );
  const publishedBatchesQ = useMemoFirebase(
    () =>
      firestore && teacherId
        ? query(collection(firestore, 'live_batches'), where('teacherId', '==', teacherId), where('publicationStatus', '==', 'published'))
        : null,
    [firestore, teacherId]
  );

  const { data: teacher, isLoading: teacherLoading } = useDoc<TeacherProfile>(teacherDocRef);
  const { data: examTypes } = useCollection<ExamType>(examTypesQ);
  const { data: classes } = useCollection<ClassItem>(classesQ);
  const { data: subjects } = useCollection<Subject>(subjectsQ);
  const { data: freeCourses, isLoading: freeCoursesLoading } = useCollection<Course>(freeCoursesQ);
  const { data: paidLiveCourses, isLoading: paidCoursesLoading } = useCollection<Course>(paidLiveCoursesQ);
  const { data: publishedTests, isLoading: testsLoading } = useCollection<MockTest>(publishedTestsQ);
  const { data: publishedBatches, isLoading: batchesLoading } = useCollection<LiveBatch>(publishedBatchesQ);

  const examNameById = useMemo(() => Object.fromEntries((examTypes || []).map((e) => [e.id, e.name])), [examTypes]);
  const classNameById = useMemo(() => Object.fromEntries((classes || []).map((c) => [c.id, c.name])), [classes]);
  const subjectNameById = useMemo(() => Object.fromEntries((subjects || []).map((s) => [s.id, s.name])), [subjects]);

  const courses = useMemo(() => {
    const merged = [...(freeCourses || []), ...(paidLiveCourses || [])];
    const unique = Array.from(new Map(merged.map((course) => [course.id, course])).values());
    return unique
      .filter((course) => course.publicationStatus !== 'draft')
      .sort((a, b) => {
        const ad = toDate(a.createdAt)?.getTime() || 0;
        const bd = toDate(b.createdAt)?.getTime() || 0;
        return bd - ad;
      });
  }, [freeCourses, paidLiveCourses]);

  const tests = useMemo(
    () =>
      (publishedTests || [])
        .filter((test) => isStandaloneMockTest(test))
        .sort((a, b) => {
        const ad = toDate(a.startTime)?.getTime() || 0;
        const bd = toDate(b.startTime)?.getTime() || 0;
        return bd - ad;
      }),
    [publishedTests]
  );

  const liveBatches = useMemo(
    () =>
      (publishedBatches || [])
        .filter((batch) => batch.accessLevel !== 'paid' || batch.subscriptionAttached === true)
        .sort((a, b) => {
          const ad = toDate(a.createdAt)?.getTime() || 0;
          const bd = toDate(b.createdAt)?.getTime() || 0;
          return bd - ad;
        }),
    [publishedBatches]
  );

  const loading = teacherLoading || freeCoursesLoading || paidCoursesLoading || testsLoading || batchesLoading;

  const fullName = `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || 'Teacher';
  const aboutText = teacher?.about || teacher?.bio || 'No teacher description added yet.';
  const rating = typeof teacher?.platformRating === 'number' ? teacher.platformRating : typeof teacher?.rating === 'number' ? teacher.rating : null;

  const scope = useMemo(() => {
    if (!teacher?.teachingAssignments?.length) return [];
    return teacher.teachingAssignments.map((assignment) => {
      const examName = examNameById[assignment.examTypeId] || 'Exam';
      const className = classNameById[assignment.classId] || 'Curriculum';
      const classSubjects = (subjects || []).filter((subject) => subject.classId === assignment.classId);
      const subjectNames = assignment.allSubjects
        ? ['All Subjects']
        : (assignment.subjectIds || []).map((id) => subjectNameById[id]).filter(Boolean);
      const fallbackSubjects = assignment.allSubjects ? [] : classSubjects.map((subject) => subject.name);
      const finalSubjects = subjectNames.length > 0 ? subjectNames : fallbackSubjects;
      return `${examName} - ${className} - ${finalSubjects.join(', ') || 'Subjects not specified'}`;
    });
  }, [teacher, examNameById, classNameById, subjects, subjectNameById]);

  const primaryAssignmentContext = useMemo(() => {
    const firstAssignment = teacher?.teachingAssignments?.[0];
    if (!firstAssignment) return null;

    const examTypeId = firstAssignment.examTypeId || '';
    const classId = firstAssignment.classId || '';
    if (!examTypeId || !classId) return null;

    const classSubjects = (subjects || []).filter((subject) => subject.classId === classId);
    const subjectIds = firstAssignment.allSubjects
      ? classSubjects.map((subject) => subject.id)
      : (firstAssignment.subjectIds || []).filter(Boolean);

    return {
      examTypeId,
      classId,
      subjectIds,
      examTypeName: examNameById[examTypeId] || '',
      className: classNameById[classId] || '',
    };
  }, [teacher?.teachingAssignments, subjects, examNameById, classNameById]);

  const practiceSessionBaseHref = useMemo(() => {
    if (!primaryAssignmentContext) return '/start-practice-session';

    const params = new URLSearchParams();
    params.set('examTypeId', primaryAssignmentContext.examTypeId);
    params.set('classId', primaryAssignmentContext.classId);
    params.set('subjectIds', primaryAssignmentContext.subjectIds.join(','));
    if (primaryAssignmentContext.examTypeName) params.set('examTypeName', primaryAssignmentContext.examTypeName);
    if (primaryAssignmentContext.className) params.set('className', primaryAssignmentContext.className);
    return `/start-practice-session/${encodeURIComponent(teacherId)}?${params.toString()}`;
  }, [primaryAssignmentContext, teacherId]);

  const customMockFreeHref = `/custom-mock-tests/create?mode=free&teacherId=${encodeURIComponent(teacherId)}`;
  const customMockPremiumHref = `/premium-mock-test/${encodeURIComponent(teacherId)}`;
  const practiceRegularHref = `${practiceSessionBaseHref}${practiceSessionBaseHref.includes('?') ? '&' : '?'}practiceMode=regular`;
  const practicePremiumHref = `${practiceSessionBaseHref}${practiceSessionBaseHref.includes('?') ? '&' : '?'}practiceMode=premium`;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Teacher Profile" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : !teacher || teacher.roleId !== 'teacher' || teacher.status === 'blocked' ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">Teacher profile not found.</CardContent>
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-sky-950/35 via-blue-950/25 to-indigo-950/35">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start">
                      <Avatar className="h-20 w-20 ring-2 ring-primary/25">
                        <AvatarImage src={teacher.photoURL} />
                        <AvatarFallback>{fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-3 flex-1">
                        <div>
                          <h2 className="text-2xl font-semibold">{fullName}</h2>
                          <p className="text-sm text-muted-foreground">DCAM Teacher</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="inline-flex items-center gap-1 rounded-full">
                            <Star className="h-3 w-3" />
                            {rating !== null ? `${rating.toFixed(1)} / 5` : 'New'}
                          </Badge>
                          {typeof teacher.totalRatings === 'number' ? (
                            <span className="text-xs text-muted-foreground">({teacher.totalRatings} ratings)</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{aboutText}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-center">
                        <p className="text-xs text-muted-foreground">Courses</p>
                        <p className="text-lg font-semibold">{courses.length}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-center">
                        <p className="text-xs text-muted-foreground">Tests</p>
                        <p className="text-lg font-semibold">{tests.length}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-center">
                        <p className="text-xs text-muted-foreground">Batches</p>
                        <p className="text-lg font-semibold">{liveBatches.length}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {scope.length > 0 ? (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle>Teaching Scope</CardTitle>
                    <CardDescription>Curriculum assignments added by this teacher.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {scope.map((item, index) => (
                      <Badge key={`${item}-${index}`} variant="outline" className="rounded-full">
                        {item}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-border/70 bg-gradient-to-r from-slate-950/75 via-blue-950/50 to-slate-950/70">
                <CardHeader>
                  <CardTitle className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>
                    Build from this teacher&apos;s question bank with free or premium mode.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
                    <p className="text-sm font-semibold">Create Custom Mock Test</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Free uses free teacher questions. Premium uses paid teacher questions.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button asChild className="h-10 rounded-lg border border-cyan-300/35 bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 text-slate-950 hover:from-cyan-200 hover:via-sky-300 hover:to-blue-400">
                        <Link href={customMockFreeHref}>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Free Mock
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-10 rounded-lg border-amber-300/45 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50">
                        <Link href={customMockPremiumHref}>
                          <Crown className="mr-2 h-4 w-4" />
                          Premium Mock
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-indigo-300/20 bg-indigo-500/5 p-4">
                    <p className="text-sm font-semibold">Create Practice Session</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Start regular or premium practice session from this teacher profile.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button asChild className="h-10 rounded-lg border border-cyan-300/35 bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 text-slate-950 hover:from-cyan-200 hover:via-sky-300 hover:to-blue-400">
                        <Link href={practiceRegularHref}>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Free Practice
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-10 rounded-lg border-amber-300/45 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50">
                        <Link href={practicePremiumHref}>
                          <Crown className="mr-2 h-4 w-4" />
                          Premium Practice
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <Link href={`/teachers/${teacherId}/courses`} className="block">
                  <Card className="border-border/70 bg-card/90 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <BookOpenText className="h-5 w-5 text-primary" />
                          Courses
                        </span>
                        <Badge variant="secondary" className="rounded-full">{courses.length}</Badge>
                      </CardTitle>
                      <CardDescription>View all courses published by this teacher.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Open course catalog</span>
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </CardContent>
                  </Card>
                </Link>

                <Link href={`/teachers/${teacherId}/mock-tests`} className="block">
                  <Card className="border-border/70 bg-card/90 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          Mock Tests
                        </span>
                        <Badge variant="secondary" className="rounded-full">{tests.length}</Badge>
                      </CardTitle>
                      <CardDescription>View all mock tests created by this teacher.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Open test library</span>
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </CardContent>
                  </Card>
                </Link>

                <Link href={`/teachers/${teacherId}/live-batches`} className="block">
                  <Card className="border-border/70 bg-card/90 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <Video className="h-5 w-5 text-primary" />
                          Live Batches
                        </span>
                        <Badge variant="secondary" className="rounded-full">{liveBatches.length}</Badge>
                      </CardTitle>
                      <CardDescription>View all active live batches taught by this teacher.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Open batch list</span>
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
