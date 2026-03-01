'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, orderBy, query, where } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Compass, Info, PlayCircle, RotateCcw, Search, SlidersHorizontal, Sparkles, Target, TrendingUp, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExamType = { id: string; name: string };
type ClassItem = { id: string; name: string; examTypeId: string };
type Subject = { id: string; name: string; classId: string };
type QuestionAlignment = { examTypeId?: string; classId?: string; subjectId?: string };
type PracticeQuestion = {
  id: string;
  teacherId?: string;
  examTypeId?: string;
  classId?: string;
  subjectId?: string;
  mockTestOnly?: boolean;
  alignments?: QuestionAlignment[];
};
type TeachingAssignment = {
  examTypeId: string;
  classId: string;
  allSubjects?: boolean;
  subjectIds?: string[];
};
type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  roleId?: 'student' | 'teacher' | 'admin';
  status?: 'active' | 'blocked';
  teachingAssignments?: TeachingAssignment[];
  teachesClassIds?: string[];
  teachesExamTypeIds?: string[];
  teachesSubjectIds?: string[];
  premiumPracticeQuestionPrice?: number;
  premiumPracticeQuestionPriceByDifficulty?: {
    easy?: number;
    medium?: number;
    hard?: number;
  };
};

export default function StartPracticeSessionPage() {
  const firestore = useFirestore();
  const router = useRouter();

  const examTypesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null), [firestore]);
  const classesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null), [firestore]);
  const subjectsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null), [firestore]);
  const usersQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'users'), orderBy('firstName')) : null), [firestore]);

  const { data: examTypes, isLoading: examLoading } = useCollection<ExamType>(examTypesQuery);
  const { data: classes, isLoading: classLoading } = useCollection<ClassItem>(classesQuery);
  const { data: subjects, isLoading: subjectLoading } = useCollection<Subject>(subjectsQuery);
  const { data: users, isLoading: userLoading } = useCollection<UserProfile>(usersQuery);

  const [examTypeId, setExamTypeId] = useState('');
  const [classId, setClassId] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<{ examTypeId: string; classId: string; subjectIds: string[] } | null>(null);

  const filteredClasses = useMemo(() => (classes || []).filter((c) => c.examTypeId === examTypeId), [classes, examTypeId]);
  const filteredSubjects = useMemo(() => (subjects || []).filter((s) => s.classId === classId), [subjects, classId]);
  const selectedExamName = useMemo(
    () => (examTypes || []).find((exam) => exam.id === examTypeId)?.name || '',
    [examTypes, examTypeId]
  );
  const selectedClassName = useMemo(
    () => (classes || []).find((classItem) => classItem.id === classId)?.name || '',
    [classes, classId]
  );

  useEffect(() => {
    if (classId && !filteredClasses.some((c) => c.id === classId)) setClassId('');
  }, [filteredClasses, classId]);

  useEffect(() => {
    setSelectedSubjectIds((curr) => curr.filter((id) => filteredSubjects.some((s) => s.id === id)));
  }, [filteredSubjects]);

  useEffect(() => {
    setAppliedFilters(null);
  }, [examTypeId, classId, selectedSubjectIds]);

  const practiceQuestionsQuery = useMemoFirebase(() => {
    if (!firestore || !appliedFilters) return null;
    return query(
      collection(firestore, 'practice_questions'),
      where('mockTestOnly', '==', false)
    );
  }, [firestore, appliedFilters]);

  const { data: matchingQuestions, isLoading: questionsLoading } = useCollection<PracticeQuestion>(practiceQuestionsQuery);

  const loading = examLoading || classLoading || subjectLoading || userLoading;
  const hasPendingFilterChanges =
    !appliedFilters ||
    appliedFilters.examTypeId !== examTypeId ||
    appliedFilters.classId !== classId ||
    JSON.stringify([...appliedFilters.subjectIds].sort()) !== JSON.stringify([...selectedSubjectIds].sort());
  const selectedSubjectLabel = selectedSubjectIds.length > 0
    ? `${selectedSubjectIds.length} subject filters`
    : 'All subjects';

  const toggleSubject = (subjectId: string, checked: boolean) => {
    setSelectedSubjectIds((curr) => (checked ? (curr.includes(subjectId) ? curr : [...curr, subjectId]) : curr.filter((id) => id !== subjectId)));
  };

  const resetFilters = () => {
    setExamTypeId('');
    setClassId('');
    setSelectedSubjectIds([]);
    setAppliedFilters(null);
  };

  const matchedTeachers = useMemo(() => {
    if (!appliedFilters || !users || !matchingQuestions) return [];
    const classSubjectIds = (subjects || []).filter((s) => s.classId === appliedFilters.classId).map((s) => s.id);
    const selectedSubjectSet = new Set(appliedFilters.subjectIds);
    const hasSubjectFilter = selectedSubjectSet.size > 0;

    const questionSubjectCoverageByTeacher = new Map<string, Set<string>>();
    matchingQuestions.forEach((question) => {
      if (!question.teacherId || question.mockTestOnly) return;
      const subjectCoverage = questionSubjectCoverageByTeacher.get(question.teacherId) || new Set<string>();

      if (
        question.examTypeId === appliedFilters.examTypeId &&
        question.classId === appliedFilters.classId &&
        question.subjectId &&
        (!hasSubjectFilter || selectedSubjectSet.has(question.subjectId))
      ) {
        subjectCoverage.add(question.subjectId);
      }

      (question.alignments || []).forEach((alignment) => {
        if (
          alignment.examTypeId === appliedFilters.examTypeId &&
          alignment.classId === appliedFilters.classId &&
          alignment.subjectId &&
          (!hasSubjectFilter || selectedSubjectSet.has(alignment.subjectId))
        ) {
          subjectCoverage.add(alignment.subjectId);
        }
      });

      if (subjectCoverage.size > 0) {
        questionSubjectCoverageByTeacher.set(question.teacherId, subjectCoverage);
      }
    });

    return users
      .filter((u) => u.roleId === 'teacher' && u.status !== 'blocked')
      .filter((u) => {
        const questionSubjectCoverage = questionSubjectCoverageByTeacher.get(u.id);
        if (!questionSubjectCoverage) return false;
        if (hasSubjectFilter && appliedFilters.subjectIds.some((subjectId) => !questionSubjectCoverage.has(subjectId))) return false;

        const assignments = Array.isArray(u.teachingAssignments) ? u.teachingAssignments : [];
        const assignmentMatches = assignments.filter((a) => a.examTypeId === appliedFilters.examTypeId && a.classId === appliedFilters.classId);

        const teachesClassFromLegacy = (u.teachesClassIds || []).includes(appliedFilters.classId);
        const teachesExamFromLegacy = (u.teachesExamTypeIds || []).includes(appliedFilters.examTypeId);
        const teachesSubjectsLegacy = new Set(u.teachesSubjectIds || []);

        const teachesSubjectsFromAssignments = new Set<string>();
        assignmentMatches.forEach((a) => {
          if (a.allSubjects) classSubjectIds.forEach((id) => teachesSubjectsFromAssignments.add(id));
          (a.subjectIds || []).forEach((id) => teachesSubjectsFromAssignments.add(id));
        });

        const merged = new Set<string>([...Array.from(teachesSubjectsFromAssignments), ...Array.from(teachesSubjectsLegacy)]);
        const classMatch = assignmentMatches.length > 0 || teachesClassFromLegacy;
        const examMatch = assignmentMatches.length > 0 || teachesExamFromLegacy;
        if (!classMatch || !examMatch) return false;

        if (appliedFilters.subjectIds.length === 0) return true;
        return appliedFilters.subjectIds.every((id) => merged.has(id));
      })
      .sort((a, b) => {
        const an = `${a.firstName || ''} ${a.lastName || ''}`.trim();
        const bn = `${b.firstName || ''} ${b.lastName || ''}`.trim();
        return an.localeCompare(bn);
      });
  }, [appliedFilters, users, subjects, matchingQuestions]);

  const getPracticeSetupHref = (teacherId: string, mode: 'regular' | 'premium') => {
    if (!appliedFilters) return '#';
    const params = new URLSearchParams();
    params.set('presetContext', 'practice_search');
    params.set('examTypeId', appliedFilters.examTypeId);
    params.set('classId', appliedFilters.classId);
    params.set('subjectIds', appliedFilters.subjectIds.join(','));
    params.set('examTypeName', selectedExamName);
    params.set('className', selectedClassName);
    params.set('practiceMode', mode);
    return `/start-practice-session/${encodeURIComponent(teacherId)}?${params.toString()}`;
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Start Practice Session" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <Card className="relative isolate overflow-hidden border-primary/35 bg-gradient-to-br from-emerald-950/40 via-teal-950/30 to-cyan-950/40 shadow-[0_24px_54px_-34px_rgba(20,184,166,0.72)]">
            <div className="pointer-events-none absolute right-[-95px] top-[-95px] h-56 w-56 rounded-full bg-teal-400/25 blur-3xl" />
            <CardContent className="relative p-5 md:p-7">
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  <p className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Practice Setup
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Find Matching Teachers for Practice Session</h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Select exam, curriculum, and subjects to find teachers and start your practice session.
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/35 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">How It Works</p>
                  <div className="space-y-2.5 text-xs text-slate-200/90">
                    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5">
                      <Compass className="mt-0.5 h-4 w-4 text-cyan-300" />
                      Set exam and class to match the right teacher pool.
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5">
                      <Target className="mt-0.5 h-4 w-4 text-sky-300" />
                      Add subjects to target exact practice outcomes.
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5">
                      <TrendingUp className="mt-0.5 h-4 w-4 text-emerald-300" />
                      Start free or premium practice from matched teachers.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-gradient-to-b from-card/90 via-card/80 to-slate-950/25">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Session Filters
              </CardTitle>
              <CardDescription>Choose your exam, curriculum, and subjects.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading ? (
                <Skeleton className="h-36 w-full" />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-slate-950/30 p-3.5">
                      <p className="text-[11px] uppercase tracking-[0.13em] text-cyan-200">Step 1 · Exam</p>
                      <Select value={examTypeId} onValueChange={setExamTypeId}>
                        <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue placeholder="Select exam" /></SelectTrigger>
                        <SelectContent>{(examTypes || []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-slate-950/30 p-3.5">
                      <p className="text-[11px] uppercase tracking-[0.13em] text-sky-200">Step 2 · Curriculum</p>
                      <Select value={classId} onValueChange={setClassId} disabled={!examTypeId}>
                        <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue placeholder="Select curriculum/class" /></SelectTrigger>
                        <SelectContent>{filteredClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className={cn(
                    'rounded-xl border p-4',
                    hasPendingFilterChanges
                      ? 'border-cyan-300/35 bg-cyan-500/10'
                      : 'border-emerald-300/35 bg-emerald-500/10'
                  )}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Current Selection</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-border/70 bg-background/35">{selectedExamName || 'Select exam'}</Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/35">{selectedClassName || 'Select curriculum'}</Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/35">{selectedSubjectLabel}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {hasPendingFilterChanges ? 'Filters changed. Click find to refresh teacher matches.' : 'Teacher results are synced with your current selection.'}
                    </p>
                  </div>
                  {examTypeId && filteredClasses.length === 0 ? (
                    <div className="rounded-xl border border-amber-300/35 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-transparent p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-full border border-amber-300/40 bg-amber-500/15 p-1.5">
                          <Info className="h-3.5 w-3.5 text-amber-100" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-amber-100">This exam track is opening soon on DCAM</p>
                          <p className="mt-0.5 text-xs text-amber-100/85">
                            Curriculum setup for this exam is in progress. Select another exam now, or check back shortly for fresh practice paths.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">Subjects (optional)</p>
                      <Badge variant="outline" className="rounded-full">{selectedSubjectIds.length} selected</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {filteredSubjects.length === 0 ? (
                        <p className="text-sm text-muted-foreground md:col-span-3">Select exam and curriculum to view subjects.</p>
                      ) : (
                        filteredSubjects.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-primary/5">
                            <Checkbox checked={selectedSubjectIds.includes(s.id)} onCheckedChange={(v) => toggleSubject(s.id, !!v)} />
                            <span>{s.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  {classId && filteredSubjects.length === 0 ? (
                    <div className="rounded-xl border border-amber-300/35 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-transparent p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-full border border-amber-300/40 bg-amber-500/15 p-1.5">
                          <Info className="h-3.5 w-3.5 text-amber-100" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-amber-100">Subjects for this curriculum are being prepared</p>
                          <p className="mt-0.5 text-xs text-amber-100/85">
                            Subject-level practice mapping is currently updating. Try another curriculum for instant practice, or revisit soon.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={resetFilters}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset Filters
                    </Button>
                    <Button type="button" className="h-11 rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 px-6 font-semibold text-slate-950 shadow-[0_10px_24px_-12px_rgba(56,189,248,0.9)] transition-all duration-300 hover:translate-y-[-1px] hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300" disabled={!examTypeId || !classId} onClick={() => setAppliedFilters({ examTypeId, classId, subjectIds: selectedSubjectIds })}>
                      <Search className="mr-2 h-4 w-4" />
                      Find Practice Teachers
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {appliedFilters ? (
            <Card className="border-border/70 bg-gradient-to-r from-slate-950/90 via-cyan-950/20 to-emerald-950/20">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Result Window</p>
                  <p className="mt-1 text-lg font-semibold">{matchedTeachers.length} teacher{matchedTeachers.length === 1 ? '' : 's'} matched</p>
                  <p className="text-xs text-muted-foreground">Pick free or premium mode based on your practice depth requirement.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/70 bg-background/35">{selectedExamName || 'Exam'}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{selectedClassName || 'Curriculum'}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">
                    {appliedFilters.subjectIds.length > 0 ? `${appliedFilters.subjectIds.length} filtered subjects` : 'All subjects'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!appliedFilters ? (
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CardContent className="p-10 text-center">
                <PlayCircle className="mx-auto mb-3 h-6 w-6 text-primary/80" />
                <p className="font-medium">Ready to start a session</p>
                <p className="mt-1 text-sm text-muted-foreground">Apply filters and find matching teachers.</p>
              </CardContent>
            </Card>
          ) : questionsLoading ? (
            <Card className="border-border/70 bg-card/70">
              <CardContent className="p-8">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ) : matchedTeachers.length === 0 ? (
            <Card className="border-dashed border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-10 text-center">
                <UserRound className="mx-auto mb-3 h-6 w-6 text-amber-300" />
                <p className="font-medium">No teachers found for these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Try changing subjects or curriculum, or choose filters where teachers uploaded questions with Student Use + Official Mock Test.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {matchedTeachers.map((t) => {
                const fullName = `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Teacher';
                const legacyPremiumPrice = Math.max(0, Number(t.premiumPracticeQuestionPrice ?? 0));
                const premiumPriceByDifficulty = {
                  easy: Math.max(0, Number(t.premiumPracticeQuestionPriceByDifficulty?.easy ?? legacyPremiumPrice)),
                  medium: Math.max(0, Number(t.premiumPracticeQuestionPriceByDifficulty?.medium ?? legacyPremiumPrice)),
                  hard: Math.max(0, Number(t.premiumPracticeQuestionPriceByDifficulty?.hard ?? legacyPremiumPrice)),
                };
                const canStartPremiumPractice = Object.values(premiumPriceByDifficulty).some((price) => price > 0);
                return (
                  <Card
                    key={t.id}
                    onClick={() => router.push(`/teachers/${t.id}`)}
                    className="group relative cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-blue-950/80 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:shadow-sky-950/40"
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(56,189,248,0.18),transparent_45%)]" />
                    </div>
                    <CardContent className="relative p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-12 w-12 ring-2 ring-sky-400/30">
                            <AvatarImage src={t.photoURL} />
                            <AvatarFallback>{fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <p className="text-base font-semibold">{fullName}</p>
                            <p className="text-xs text-muted-foreground">Matched with your selected exam/curriculum/subjects.</p>
                            <p className="text-[11px] text-amber-200/90">
                              Premium rate: {canStartPremiumPractice
                                ? `E/M/H: INR ${premiumPriceByDifficulty.easy.toLocaleString()} / ${premiumPriceByDifficulty.medium.toLocaleString()} / ${premiumPriceByDifficulty.hard.toLocaleString()}`
                                : 'Not configured by teacher yet'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button asChild size="sm" className="h-10 min-w-0 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 font-semibold text-slate-950 hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300">
                          <Link onClick={(e) => e.stopPropagation()} href={getPracticeSetupHref(t.id, 'regular')}>
                            Free Practice <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                          </Link>
                        </Button>
                        {canStartPremiumPractice ? (
                          <Button asChild size="sm" variant="outline" className="h-10 min-w-0 rounded-xl border border-amber-300/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20">
                            <Link onClick={(e) => e.stopPropagation()} href={getPracticeSetupHref(t.id, 'premium')}>
                              Premium Practice
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-10 min-w-0 rounded-xl" disabled>
                            Premium Unavailable
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
