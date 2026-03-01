'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ArrowRight, BookOpen, CheckCircle2, Compass, Filter, Flame, GraduationCap, Info, Layers, RotateCcw, Search, Sparkles, Target, TrendingUp, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCourseExpiryStatus } from '@/lib/course-expiry';

type ExamType = {
  id: string;
  name: string;
};

type ClassItem = {
  id: string;
  name: string;
  examTypeId?: string;
};

type Subject = {
  id: string;
  name: string;
  classId: string;
};

type Course = {
  id: string;
  title?: string;
  description?: string;
  teacherName?: string;
  isCrashCourse?: boolean;
  accessLevel?: 'free' | 'paid';
  publicationStatus?: 'draft' | 'published';
  subscriptionAttached?: boolean;
  expiryDate?: string | number | { seconds?: number; toDate?: () => Date };
  examTypeId?: string;
  classId?: string;
  classLevel?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  subjectIds?: string[];
  modules?: Array<{
    subjectId?: string;
    subjectName?: string;
  }>;
  createdAt?: { seconds?: number } | string | number;
  updatedAt?: { seconds?: number } | string | number;
};

type SearchFilters = {
  examTypeId: string;
  classId: string;
  subjectIds: string[];
};

type StudentCurriculumMarketplaceProps = {
  onlyCrashCourses?: boolean;
};

const toMillis = (value: Course['createdAt'] | Course['updatedAt']) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

export default function StudentCurriculumMarketplace({ onlyCrashCourses = false }: StudentCurriculumMarketplaceProps) {
  const firestore = useFirestore();
  const DiscoveryIcon = onlyCrashCourses ? Flame : Sparkles;

  const examTypesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'exam_types')) : null),
    [firestore]
  );
  const classesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'classes')) : null),
    [firestore]
  );
  const subjectsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'subjects')) : null),
    [firestore]
  );
  const freeCoursesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'courses'), where('accessLevel', '==', 'free')) : null),
    [firestore]
  );
  const subscribedCoursesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'courses'), where('subscriptionAttached', '==', true)) : null),
    [firestore]
  );
  const allCoursesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'courses')) : null),
    [firestore]
  );

  const { data: examTypes, isLoading: isExamLoading } = useCollection<ExamType>(examTypesQuery);
  const { data: classes, isLoading: isClassLoading } = useCollection<ClassItem>(classesQuery);
  const { data: subjects, isLoading: isSubjectLoading } = useCollection<Subject>(subjectsQuery);
  const { data: freeCourses, isLoading: isFreeCoursesLoading } = useCollection<Course>(freeCoursesQuery);
  const { data: subscribedCourses, isLoading: isSubscribedCoursesLoading } = useCollection<Course>(subscribedCoursesQuery);
  const { data: allCourses, isLoading: isAllCoursesLoading } = useCollection<Course>(allCoursesQuery);

  const courses = useMemo(() => {
    const merged = onlyCrashCourses
      ? [...(allCourses || [])]
      : [...(freeCourses || []), ...(subscribedCourses || [])];
    const byId = new Map<string, Course>();
    for (const course of merged) byId.set(course.id, course);
    const deduped = Array.from(byId.values());
    if (!onlyCrashCourses) return deduped;
    return deduped.filter((course) => course.isCrashCourse === true);
  }, [allCourses, freeCourses, subscribedCourses, onlyCrashCourses]);

  const discoveryLabel = onlyCrashCourses ? 'Crash Course Discovery' : 'Course Discovery';
  const discoveryHeading = onlyCrashCourses ? 'Find Crash Courses by Exam and Curriculum' : 'Find Courses by Exam and Curriculum';
  const discoveryDescription = onlyCrashCourses
    ? 'Select exam and curriculum, then choose one or more subjects to discover crash courses created by teachers.'
    : 'Select exam and curriculum, then choose one or more subjects as a combination to discover matching courses.';
  const discoveryGoal = onlyCrashCourses ? 'Crash Courses' : 'Courses';
  const searchButtonLabel = onlyCrashCourses ? 'Search Crash Courses' : 'Search Courses';
  const searchHint = onlyCrashCourses
    ? 'Choose filters, then click Search Crash Courses.'
    : 'Choose filters, then click Search Courses.';
  const emptyResultLabel = onlyCrashCourses
    ? 'No matching crash courses found for this filter combination.'
    : 'No matching courses found for this filter combination.';
  const filterDescription = onlyCrashCourses
    ? 'Use exact filter combinations to match crash-course configurations created by teachers.'
    : 'Use exact filter combinations to match course configurations created by teachers.';
  const journeySteps = [
    {
      title: 'Choose exam',
      description: 'Start with your target exam to unlock the right learning path.',
      icon: Compass,
    },
    {
      title: 'Set curriculum',
      description: 'Pick your class/curriculum so recommendations stay relevant.',
      icon: Target,
    },
    {
      title: onlyCrashCourses ? 'Find revision modules' : 'Discover full courses',
      description: onlyCrashCourses
        ? 'Search focused crash programs built for quick score improvement.'
        : 'Search complete courses mapped to your selected subjects.',
      icon: TrendingUp,
    },
  ];
  const heroCardClass = onlyCrashCourses
    ? 'relative isolate overflow-hidden border-red-400/35 bg-gradient-to-br from-slate-950 via-red-950/40 to-orange-950/35 shadow-[0_26px_60px_-34px_rgba(251,113,133,0.72)]'
    : 'relative isolate overflow-hidden border-sky-300/25 bg-gradient-to-br from-slate-950 via-blue-950/55 to-indigo-950/55 shadow-[0_26px_60px_-34px_rgba(56,189,248,0.6)]';
  const filterCardClass = onlyCrashCourses
    ? 'border-red-400/20 bg-gradient-to-b from-red-950/20 via-slate-900/50 to-slate-950/35 shadow-[0_18px_42px_-30px_rgba(251,113,133,0.65)]'
    : 'border-border/70 bg-gradient-to-b from-slate-900/70 via-slate-900/35 to-slate-950/20 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.9)]';
  const selectedSubjectCardClass = onlyCrashCourses
    ? 'rounded-xl border border-red-300/35 bg-red-500/[0.1] px-4 py-3'
    : 'rounded-xl border border-sky-300/20 bg-blue-500/[0.08] px-4 py-3';
  const checkedSubjectPillClass = onlyCrashCourses
    ? 'border-red-300/55 bg-red-500/20'
    : 'border-cyan-300/55 bg-cyan-500/20';
  const uncheckedSubjectPillClass = onlyCrashCourses
    ? 'border-border/60 bg-background/20 hover:border-red-300/45 hover:bg-red-500/12'
    : 'border-border/60 bg-background/20 hover:border-cyan-300/45 hover:bg-cyan-500/10';
  const searchButtonClass = onlyCrashCourses
    ? 'h-11 rounded-full border border-red-300/45 bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 px-6 font-semibold text-slate-950 shadow-[0_12px_28px_-12px_rgba(251,113,133,0.82)] transition-all duration-300 hover:translate-y-[-1px] hover:from-rose-200 hover:via-orange-200 hover:to-amber-200 hover:shadow-[0_16px_30px_-12px_rgba(251,113,133,0.9)] disabled:cursor-not-allowed disabled:opacity-60'
    : 'h-11 rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 px-6 font-semibold text-slate-950 shadow-[0_12px_28px_-12px_rgba(56,189,248,0.82)] transition-all duration-300 hover:translate-y-[-1px] hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300 hover:shadow-[0_16px_30px_-12px_rgba(56,189,248,0.9)] disabled:cursor-not-allowed disabled:opacity-60';
  const resetButtonClass = onlyCrashCourses
    ? 'h-11 rounded-full border border-red-300/35 bg-red-500/12 px-5 text-red-100 hover:bg-red-500/22'
    : 'h-11 rounded-full border border-cyan-300/35 bg-cyan-500/12 px-5 text-cyan-100 hover:bg-cyan-500/22';
  const courseCardClass = onlyCrashCourses
    ? 'group overflow-hidden border border-border/70 bg-gradient-to-b from-slate-900/95 via-red-950/26 to-slate-950/92 transition-all duration-300 hover:-translate-y-1 hover:border-red-300/55 hover:shadow-[0_20px_42px_-24px_rgba(251,113,133,0.65)]'
    : 'group overflow-hidden border border-border/70 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-blue-950/42 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/55 hover:shadow-[0_20px_42px_-24px_rgba(34,211,238,0.55)]';
  const fallbackBannerClass = onlyCrashCourses
    ? 'h-full w-full bg-gradient-to-r from-red-950/60 via-orange-950/50 to-slate-900/80'
    : 'h-full w-full bg-gradient-to-r from-cyan-950/60 via-blue-950/60 to-slate-900/80';
  const viewCourseButtonClass = onlyCrashCourses
    ? 'group/cta h-10 rounded-full border border-red-300/45 bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 px-4 font-medium text-slate-950 shadow-[0_10px_22px_-10px_rgba(251,113,133,0.78)] transition-all hover:from-rose-200 hover:via-orange-200 hover:to-amber-200 hover:shadow-[0_14px_26px_-10px_rgba(251,113,133,0.86)]'
    : 'group/cta h-10 rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 px-4 font-medium text-slate-950 shadow-[0_10px_22px_-10px_rgba(56,189,248,0.78)] transition-all hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300 hover:shadow-[0_14px_26px_-10px_rgba(56,189,248,0.84)]';

  const sortedExamTypes = useMemo(
    () => [...(examTypes || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [examTypes]
  );
  const sortedClasses = useMemo(
    () => [...(classes || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [classes]
  );
  const sortedSubjects = useMemo(
    () => [...(subjects || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [subjects]
  );

  const [selectedExamTypeId, setSelectedExamTypeId] = useState('all');
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    examTypeId: 'all',
    classId: 'all',
    subjectIds: [],
  });

  const filteredClasses = useMemo(() => {
    if (selectedExamTypeId === 'all') return sortedClasses;
    return sortedClasses.filter((c) => (c.examTypeId || '') === selectedExamTypeId);
  }, [sortedClasses, selectedExamTypeId]);

  const hasSpecificExamAndCurriculum = selectedExamTypeId !== 'all' && selectedClassId !== 'all';
  const showNoCurriculumWarning = selectedExamTypeId !== 'all' && filteredClasses.length === 0;

  const filteredSubjects = useMemo(() => {
    if (!hasSpecificExamAndCurriculum) return [];
    return sortedSubjects.filter((s) => s.classId === selectedClassId);
  }, [sortedSubjects, selectedClassId, hasSpecificExamAndCurriculum]);
  const showNoSubjectsWarning = hasSpecificExamAndCurriculum && filteredSubjects.length === 0;

  const subjectNameById = useMemo(
    () =>
      sortedSubjects.reduce((acc, subject) => {
        acc[subject.id] = subject.name;
        return acc;
      }, {} as Record<string, string>),
    [sortedSubjects]
  );

  const examNameById = useMemo(
    () =>
      sortedExamTypes.reduce((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {} as Record<string, string>),
    [sortedExamTypes]
  );

  const classNameById = useMemo(
    () =>
      sortedClasses.reduce((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {} as Record<string, string>),
    [sortedClasses]
  );

  const classExamTypeById = useMemo(
    () =>
      sortedClasses.reduce((acc, item) => {
        if (item.examTypeId) acc[item.id] = item.examTypeId;
        return acc;
      }, {} as Record<string, string>),
    [sortedClasses]
  );

  useEffect(() => {
    if (selectedExamTypeId !== 'all' && !sortedExamTypes.some((et) => et.id === selectedExamTypeId)) {
      setSelectedExamTypeId('all');
    }
  }, [sortedExamTypes, selectedExamTypeId]);

  useEffect(() => {
    if (selectedClassId !== 'all' && !filteredClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('all');
    }
  }, [filteredClasses, selectedClassId]);

  useEffect(() => {
    setSelectedSubjectIds((current) => current.filter((id) => filteredSubjects.some((s) => s.id === id)));
  }, [filteredSubjects]);

  useEffect(() => {
    if (!hasSpecificExamAndCurriculum && selectedSubjectIds.length > 0) {
      setSelectedSubjectIds([]);
    }
  }, [hasSpecificExamAndCurriculum, selectedSubjectIds.length]);

  const isLoading = isExamLoading
    || isClassLoading
    || isSubjectLoading
    || (onlyCrashCourses ? isAllCoursesLoading : (isFreeCoursesLoading || isSubscribedCoursesLoading));
  const selectedSubjectKey = useMemo(
    () => [...selectedSubjectIds].sort().join(','),
    [selectedSubjectIds]
  );
  const appliedSubjectKey = useMemo(
    () => [...searchFilters.subjectIds].sort().join(','),
    [searchFilters.subjectIds]
  );
  const hasPendingFilterChanges =
    selectedExamTypeId !== searchFilters.examTypeId
    || selectedClassId !== searchFilters.classId
    || selectedSubjectKey !== appliedSubjectKey;
  const selectedExamLabel = selectedExamTypeId === 'all'
    ? 'All exams'
    : examNameById[selectedExamTypeId] || 'Selected exam';
  const selectedCurriculumLabel = selectedClassId === 'all'
    ? 'All curricula'
    : classNameById[selectedClassId] || 'Selected curriculum';
  const selectedSubjectNames = selectedSubjectIds
    .map((subjectId) => subjectNameById[subjectId])
    .filter(Boolean);
  const appliedExamLabel = searchFilters.examTypeId === 'all'
    ? 'All exams'
    : examNameById[searchFilters.examTypeId] || 'Selected exam';
  const appliedCurriculumLabel = searchFilters.classId === 'all'
    ? 'All curricula'
    : classNameById[searchFilters.classId] || 'Selected curriculum';
  const appliedSubjectNames = searchFilters.subjectIds
    .map((subjectId) => subjectNameById[subjectId])
    .filter(Boolean);
  const filterStateMessage = hasPendingFilterChanges
    ? 'You changed filters. Click search to refresh the results.'
    : 'Results are synced with your current filter selection.';

  const handleSubjectToggle = (subjectId: string, checked: boolean) => {
    setSelectedSubjectIds((current) => {
      if (checked) {
        if (current.includes(subjectId)) return current;
        return [...current, subjectId];
      }
      return current.filter((id) => id !== subjectId);
    });
  };

  const runSearch = () => {
    setSearchFilters({
      examTypeId: selectedExamTypeId,
      classId: selectedClassId,
      subjectIds: selectedSubjectIds,
    });
  };
  const resetAllFilters = () => {
    setSelectedExamTypeId('all');
    setSelectedClassId('all');
    setSelectedSubjectIds([]);
    setSearchFilters({
      examTypeId: 'all',
      classId: 'all',
      subjectIds: [],
    });
  };

  const matchedCourses = useMemo(() => {
    if (!courses) return [];

    const normalize = (value?: string) => String(value || '').trim().toLowerCase();
    const normalizeKey = (value?: string) => normalize(value).replace(/[^a-z0-9]/g, '');
    const selectedClassName = searchFilters.classId === 'all' ? '' : classNameById[searchFilters.classId];
    const selectedClassNameKey = normalizeKey(selectedClassName);
    const selectedSubjectNameKeys = searchFilters.subjectIds
      .map((id) => normalizeKey(subjectNameById[id]))
      .filter(Boolean);

    const visibleLiveCourses = courses
      .filter((course) => {
        if (course.publicationStatus === 'draft') return false;
        if (!onlyCrashCourses && course.accessLevel === 'paid' && course.subscriptionAttached !== true) return false;
        if (getCourseExpiryStatus(course.expiryDate).isExpired) return false;
        return true;
      })
      .sort((a, b) => {
        const bTime = toMillis(b.updatedAt || b.createdAt);
        const aTime = toMillis(a.updatedAt || a.createdAt);
        if (bTime !== aTime) return bTime - aTime;
        return (a.title || '').localeCompare(b.title || '');
      });

    const baseMatches = visibleLiveCourses.filter((course) => {
      const courseClassId = String(course.classId || '').trim();
      const courseExamTypeId = String(course.examTypeId || '').trim();
      const courseClassNameKey = normalizeKey(course.classLevel);

      const classMatches =
        searchFilters.classId === 'all'
        || courseClassId === searchFilters.classId
        || (!!selectedClassNameKey && courseClassNameKey === selectedClassNameKey);
      if (!classMatches) return false;

      const inferredExamTypeId =
        courseExamTypeId
        || (courseClassId ? classExamTypeById[courseClassId] : '')
        || (searchFilters.classId !== 'all' ? classExamTypeById[searchFilters.classId] : '')
        || '';
      if (searchFilters.examTypeId !== 'all' && inferredExamTypeId && inferredExamTypeId !== searchFilters.examTypeId) return false;

      return true;
    });

    if (baseMatches.length === 0) return [];

    if (searchFilters.subjectIds.length === 0) return baseMatches;

    const withSubjectMatches = baseMatches.filter((course) => {
      const moduleSubjectIdsRaw = Array.isArray(course.modules)
        ? course.modules.map((item) => item?.subjectId)
        : [];
      const moduleSubjectNamesRaw = Array.isArray(course.modules)
        ? course.modules.map((item) => item?.subjectName)
        : [];

      const moduleSubjectIds = moduleSubjectIdsRaw.filter((value): value is string => Boolean(value));
      const moduleSubjectNames = moduleSubjectNamesRaw.filter((value): value is string => Boolean(value));

      const courseSubjectIds = Array.from(
        new Set([...(Array.isArray(course.subjectIds) ? course.subjectIds : []), ...moduleSubjectIds])
      );
      const courseSubjectNameKeys = new Set<string>(
        [
          ...courseSubjectIds.map((id) => normalizeKey(subjectNameById[id])),
          ...moduleSubjectNames.map((name) => normalizeKey(name)),
        ].filter((value): value is string => Boolean(value))
      );

      // Strict behavior: if subject filter is applied and course has no subject mapping, do not show it.
      if (courseSubjectIds.length === 0 && courseSubjectNameKeys.size === 0) return false;

      return searchFilters.subjectIds.every((subjectId, index) => {
        if (courseSubjectIds.includes(subjectId)) return true;
        const selectedKey = selectedSubjectNameKeys[index];
        return !!selectedKey && courseSubjectNameKeys.has(selectedKey);
      });
    });

    return withSubjectMatches;
  }, [courses, searchFilters, classExamTypeById, classNameById, subjectNameById, onlyCrashCourses]);

  return (
    <div className="space-y-5">
      <Card className={heroCardClass}>
        <div className={cn(
          'pointer-events-none absolute right-[-85px] top-[-80px] h-56 w-56 rounded-full blur-3xl',
          onlyCrashCourses ? 'bg-rose-500/30' : 'bg-cyan-400/30'
        )} />
        <div className={cn(
          'pointer-events-none absolute bottom-[-90px] left-[-70px] h-56 w-56 rounded-full blur-3xl',
          onlyCrashCourses ? 'bg-orange-500/25' : 'bg-blue-500/30'
        )} />
        <CardContent className="relative p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <p className={cn(
                'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]',
                onlyCrashCourses ? 'text-red-200' : 'text-sky-200'
              )}>
                <DiscoveryIcon className="h-3.5 w-3.5" />
                {discoveryLabel}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl xl:text-[2rem]">
                {discoveryHeading}
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-200/90 md:text-base">
                {discoveryDescription}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className={cn(
                  'rounded-xl border p-3 backdrop-blur-sm',
                  onlyCrashCourses ? 'border-red-300/30 bg-red-500/[0.08]' : 'border-sky-300/30 bg-sky-500/[0.09]'
                )}>
                  <p className={cn('text-[11px] uppercase tracking-wide', onlyCrashCourses ? 'text-red-200' : 'text-sky-200')}>Filter</p>
                  <p className="mt-1 text-sm font-semibold">Exam</p>
                </div>
                <div className={cn(
                  'rounded-xl border p-3 backdrop-blur-sm',
                  onlyCrashCourses ? 'border-orange-300/30 bg-orange-500/[0.08]' : 'border-indigo-300/30 bg-indigo-500/[0.1]'
                )}>
                  <p className={cn('text-[11px] uppercase tracking-wide', onlyCrashCourses ? 'text-orange-200' : 'text-indigo-200')}>Scope</p>
                  <p className="mt-1 text-sm font-semibold">Subjects</p>
                </div>
                <div className={cn(
                  'rounded-xl border p-3 backdrop-blur-sm',
                  onlyCrashCourses ? 'border-amber-300/30 bg-amber-500/[0.08]' : 'border-cyan-300/30 bg-cyan-500/[0.09]'
                )}>
                  <p className={cn('text-[11px] uppercase tracking-wide', onlyCrashCourses ? 'text-amber-200' : 'text-cyan-200')}>Goal</p>
                  <p className="mt-1 text-sm font-semibold">{discoveryGoal}</p>
                </div>
              </div>
            </div>
            <div className={cn(
              'rounded-2xl border p-4 sm:p-5',
              onlyCrashCourses ? 'border-red-300/30 bg-red-500/[0.08]' : 'border-sky-300/25 bg-slate-900/45'
            )}>
              <p className={cn(
                'mb-4 text-xs font-semibold uppercase tracking-[0.15em]',
                onlyCrashCourses ? 'text-red-200' : 'text-sky-200'
              )}>
                How It Works
              </p>
              <div className="space-y-3">
                {journeySteps.map((step, index) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={step.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                      <span className={cn(
                        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        onlyCrashCourses ? 'border-red-200/55 bg-red-500/18 text-red-100' : 'border-sky-200/55 bg-cyan-500/18 text-cyan-100'
                      )}>
                        {index + 1}
                      </span>
                      <div className="space-y-1">
                        <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                          <StepIcon className="h-3.5 w-3.5 text-slate-300" />
                          {step.title}
                        </p>
                        <p className="text-xs leading-relaxed text-slate-300/95">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={filterCardClass}>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-xl md:text-2xl">
            <Filter className="h-5 w-5" />
            Search Filters
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground/95">{filterDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-slate-950/35 p-4">
                  <p className={cn('text-[11px] uppercase tracking-[0.13em]', onlyCrashCourses ? 'text-red-200' : 'text-sky-200')}>
                    Step 1 · Exam
                  </p>
                  <Select value={selectedExamTypeId} onValueChange={setSelectedExamTypeId}>
                    <SelectTrigger className="mt-2 h-11 rounded-xl border-border/70 bg-background/40">
                      <SelectValue placeholder="Select exam" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All exams</SelectItem>
                      {sortedExamTypes.map((examType) => (
                        <SelectItem key={examType.id} value={examType.id}>
                          {examType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">Choose the exam goal you are preparing for.</p>
                </div>

                <div className="rounded-xl border border-border/70 bg-slate-950/35 p-4">
                  <p className={cn('text-[11px] uppercase tracking-[0.13em]', onlyCrashCourses ? 'text-orange-200' : 'text-indigo-200')}>
                    Step 2 · Curriculum
                  </p>
                  <Select
                    value={selectedClassId}
                    onValueChange={setSelectedClassId}
                    disabled={filteredClasses.length === 0}
                  >
                    <SelectTrigger className="mt-2 h-11 rounded-xl border-border/70 bg-background/40">
                      <SelectValue placeholder="Select curriculum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All curricula</SelectItem>
                      {filteredClasses.map((classItem) => (
                        <SelectItem key={classItem.id} value={classItem.id}>
                          {classItem.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">Select your class/curriculum for tighter matches.</p>
                </div>

                <div className={cn(selectedSubjectCardClass, 'space-y-1.5')}>
                  <p className={cn('text-[11px] uppercase tracking-[0.13em]', onlyCrashCourses ? 'text-amber-200' : 'text-cyan-200')}>
                    Step 3 · Subjects
                  </p>
                  <p className="text-sm font-semibold">
                    {selectedSubjectIds.length > 0 ? `${selectedSubjectIds.length} selected` : 'Optional refinement'}
                  </p>
                  <p className="text-xs text-muted-foreground">Add subjects below to narrow to highly relevant options.</p>
                </div>
              </div>

              <div className={cn(
                'rounded-xl border p-4',
                hasPendingFilterChanges
                  ? (onlyCrashCourses ? 'border-amber-300/45 bg-amber-500/10' : 'border-cyan-300/40 bg-cyan-500/10')
                  : 'border-emerald-300/35 bg-emerald-500/10'
              )}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Current Selection</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/60 bg-background/30">{selectedExamLabel}</Badge>
                  <Badge variant="outline" className="border-border/60 bg-background/30">{selectedCurriculumLabel}</Badge>
                  {selectedSubjectNames.length > 0 ? (
                    selectedSubjectNames.slice(0, 3).map((name) => (
                      <Badge key={`selected-subject-${name}`} variant="outline" className="border-border/60 bg-background/30">
                        {name}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="border-border/60 bg-background/30">Any subject</Badge>
                  )}
                  {selectedSubjectNames.length > 3 ? (
                    <Badge variant="outline" className="border-border/60 bg-background/30">+{selectedSubjectNames.length - 3} more</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{filterStateMessage}</p>
              </div>

              {showNoCurriculumWarning ? (
                <div className="rounded-xl border border-amber-300/35 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-transparent p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 rounded-full border border-amber-300/40 bg-amber-500/15 p-1.5">
                      <Info className="h-3.5 w-3.5 text-amber-100" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-100">This exam track is opening soon on DCAM</p>
                      <p className="mt-0.5 text-xs text-amber-100/85">
                        Curriculum setup for this exam is in progress. Select another exam now, or check back shortly for fresh course paths.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {hasSpecificExamAndCurriculum ? (
                <div className="space-y-3 rounded-2xl border border-border/70 bg-slate-950/28 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Subjects (optional)</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSubjectIds([])}
                      disabled={selectedSubjectIds.length === 0}
                      className={cn(
                        'rounded-full px-3',
                        onlyCrashCourses
                          ? 'border-red-300/35 bg-red-500/10 text-red-100 hover:bg-red-500/20'
                          : 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
                      )}
                    >
                      Clear Subjects
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Pick one or more subjects to refine your discovery list.</p>
                  {showNoSubjectsWarning ? (
                    <div className="rounded-xl border border-amber-300/35 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-transparent p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-full border border-amber-300/40 bg-amber-500/15 p-1.5">
                          <Info className="h-3.5 w-3.5 text-amber-100" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-amber-100">Subjects for this curriculum are being prepared</p>
                          <p className="mt-0.5 text-xs text-amber-100/85">
                            Subject-level course mapping is currently updating. Try another curriculum for instant discovery, or revisit soon.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                      {filteredSubjects.map((subject) => {
                        const checked = selectedSubjectIds.includes(subject.id);
                        return (
                          <label
                            key={subject.id}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
                              checked ? checkedSubjectPillClass : uncheckedSubjectPillClass
                            )}
                          >
                            <Checkbox checked={checked} onCheckedChange={(value) => handleSubjectToggle(subject.id, !!value)} />
                            <span className="line-clamp-1 flex-1">{subject.name}</span>
                            {checked ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                  Select both exam and curriculum to view subjects.
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  onClick={runSearch}
                  disabled={!hasPendingFilterChanges}
                  className={searchButtonClass}
                >
                  <Search className="mr-2 h-4 w-4" />
                  {searchButtonLabel}
                </Button>
                <Button type="button" variant="outline" onClick={resetAllFilters} className={resetButtonClass}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
                <p className="text-xs text-muted-foreground sm:ml-1">{searchHint}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!isLoading && sortedExamTypes.length > 0 ? (
        <Card className={cn(
          'border-border/70',
          onlyCrashCourses
            ? 'bg-gradient-to-r from-slate-950/90 via-red-950/22 to-orange-950/16'
            : 'bg-gradient-to-r from-slate-950/90 via-cyan-950/24 to-blue-950/16'
        )}>
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Result Window</p>
              <p className="mt-1 text-lg font-semibold">
                {matchedCourses.length} {matchedCourses.length === 1 ? discoveryGoal.slice(0, -1) : discoveryGoal} matched
              </p>
              <p className="text-xs text-muted-foreground">{hasPendingFilterChanges ? 'New filters are ready to search.' : 'These results are fully up to date.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border/70 bg-background/35">{appliedExamLabel}</Badge>
              <Badge variant="outline" className="border-border/70 bg-background/35">{appliedCurriculumLabel}</Badge>
              {appliedSubjectNames.length > 0 ? (
                appliedSubjectNames.slice(0, 2).map((name) => (
                  <Badge key={`applied-subject-${name}`} variant="outline" className="border-border/70 bg-background/35">
                    {name}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="border-border/70 bg-background/35">Any subject</Badge>
              )}
              {appliedSubjectNames.length > 2 ? (
                <Badge variant="outline" className="border-border/70 bg-background/35">+{appliedSubjectNames.length - 2} more</Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && sortedExamTypes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">No exams or curriculum available yet.</CardContent>
        </Card>
      ) : null}

      {!isLoading ? (
        matchedCourses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchedCourses.map((course) => {
              const courseTitle = course.title || 'Untitled Course';
              const courseDescription = course.description || 'No description added for this course yet.';
              const bannerImage = course.thumbnailUrl || course.imageUrl || '';
              const subjectNames = (course.subjectIds || [])
                .map((subjectId) => subjectNameById[subjectId])
                .filter(Boolean);
              const visibleSubjects = subjectNames.slice(0, 3);
              const moreSubjectsCount = Math.max(0, subjectNames.length - visibleSubjects.length);
              const resolvedClassName = classNameById[course.classId || ''] || course.classLevel || 'Class not tagged';
              const resolvedExamName = examNameById[course.examTypeId || classExamTypeById[course.classId || ''] || ''] || 'Exam not tagged';
              const accessLabel = course.accessLevel === 'paid' ? 'Premium' : 'Free';
              const showCrashTag = onlyCrashCourses || course.isCrashCourse === true;
              const fitStatement = searchFilters.subjectIds.length > 0
                ? 'Matches your selected subject combination'
                : (searchFilters.classId !== 'all'
                  ? `Aligned for ${appliedCurriculumLabel}`
                  : 'Relevant to your current exam/curriculum filters');
              const lastUpdatedAt = toMillis(course.updatedAt || course.createdAt);
              const isRecentlyUpdated = lastUpdatedAt > 0 && (Date.now() - lastUpdatedAt) <= (21 * 24 * 60 * 60 * 1000);

              return (
                <Card
                  key={course.id}
                  className={courseCardClass}
                >
                  <div className="relative h-32 overflow-hidden border-b border-border/60">
                    {bannerImage ? (
                      <Image
                        src={bannerImage}
                        alt={courseTitle}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className={fallbackBannerClass} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />
                    <div className="absolute left-3 top-3 flex items-center gap-2">
                      {showCrashTag ? (
                        <Badge className="bg-red-500/90 text-white">
                          Crash
                        </Badge>
                      ) : null}
                      <Badge className={course.accessLevel === 'paid' ? 'bg-rose-500/90 text-white' : 'bg-cyan-500/90 text-slate-950'}>
                        {accessLabel}
                      </Badge>
                      {isRecentlyUpdated ? (
                        <Badge className="bg-emerald-500/90 text-slate-950">
                          Updated
                        </Badge>
                      ) : null}
                    </div>
                    <p className="absolute bottom-2 left-3 right-3 line-clamp-1 text-[17px] font-semibold text-white drop-shadow">
                      {courseTitle}
                    </p>
                  </div>

                  <CardContent className="space-y-3.5 p-4">
                    <div className={cn(
                      'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                      onlyCrashCourses
                        ? 'border-red-300/40 bg-red-500/10 text-red-100'
                        : 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                    )}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {fitStatement}
                    </div>

                    <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{courseDescription}</p>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        <GraduationCap className="h-3.5 w-3.5 text-cyan-300" />
                        <span className="line-clamp-1">{resolvedExamName}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        <Layers className="h-3.5 w-3.5 text-blue-300" />
                        <span className="line-clamp-1">{resolvedClassName}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {visibleSubjects.length > 0 ? (
                        <>
                          {visibleSubjects.map((name) => (
                            <Badge key={`${course.id}-${name}`} variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                              {name}
                            </Badge>
                          ))}
                          {moreSubjectsCount > 0 ? (
                            <Badge variant="outline" className="border-border/70 bg-muted/20 text-muted-foreground">
                              +{moreSubjectsCount} more
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          Subjects not specified
                        </p>
                      )}
                    </div>
                  </CardContent>

                  <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-slate-900/55 p-3.5">
                    <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <UserRound className="h-4 w-4 text-cyan-300" />
                      <span className="line-clamp-1 max-w-[170px]">{course.teacherName || 'Unknown teacher'}</span>
                    </p>
                    <Button
                      asChild
                      className={viewCourseButtonClass}
                    >
                      <Link href={`/courses/${course.id}`}>
                        <span>Open Course</span>
                        <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/20 transition-transform group-hover/cta:translate-x-0.5">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{emptyResultLabel}</p>
              <p className="text-xs text-muted-foreground">Try broadening your filters or clear everything to explore all available options.</p>
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={resetAllFilters} className="rounded-full">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Clear All Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : null}
    </div>
  );
}
