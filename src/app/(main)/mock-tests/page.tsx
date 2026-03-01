'use client';

import DashboardHeader from '@/components/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowRight, CalendarClock, CheckCircle2, Compass, Filter, Info, Layers, Lock, PencilLine, PlusCircle, RotateCcw, Search, Sparkles, Target, Trash2, TrendingUp, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { collection, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSubscribed } from '@/hooks/useIsSubscribed';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useToast } from '@/hooks/use-toast';
import { isStandaloneMockTest } from '@/lib/mock-test-visibility';
import { cn } from '@/lib/utils';

type ExamType = { id: string; name: string };
type ClassItem = { id: string; name: string; examTypeId: string };
type Subject = { id: string; name: string; classId: string };
type TestSection = {
  subjectId: string;
  questionType: '' | 'All' | 'MCQ' | 'Numerical' | 'Text';
  difficultyLevel: '' | 'All' | 'Easy' | 'Medium' | 'Hard';
};
type OfficialTest = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  startTime: { toDate: () => Date };
  examTypeId: string;
  classId?: string;
  examLevel?: 'All' | 'weak' | 'medium' | 'strong';
  teacherId?: string;
  isCourseOnly?: boolean;
  courseId?: string;
  accessLevel: 'free' | 'paid';
  publicationStatus?: 'draft' | 'published' | 'deleted';
  subscriptionAttached?: boolean;
  isLiveBatchTest?: boolean;
  liveBatchId?: string;
  scheduledDate?: string;
  accessEndTime?: string;
  accessWindowEndAt?: { toDate?: () => Date } | Date | string;
  accessWindowStartAt?: { toDate?: () => Date } | Date | string;
  config: { questionIds: string[]; duration: number; subjectConfigs?: Array<{ subjectId: string; questionType: TestSection['questionType']; difficultyLevel: TestSection['difficultyLevel'] }> };
};
type CustomTest = { id: string; title: string; createdAt: { toDate: () => Date }; config: { questionIds: string[]; duration: number } };
const ALL_SUBJECTS_VALUE = '__all_subjects__';
const ALL_SUBJECTS_LABEL = 'All subjects';

const normalizeText = (value?: string) => (value || '').trim().toLowerCase();
const isAllSubjectsToken = (value?: string) => {
  const normalized = normalizeText(value);
  return (
    normalized === normalizeText(ALL_SUBJECTS_VALUE) ||
    normalized === 'all' ||
    normalized === 'all_subjects' ||
    normalized === 'all subjects'
  );
};

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

export default function MockTestsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const isStudent = !isTeacher && !isAdmin;
  const { isSubscribed, subscriptionPlan, isLoading: isSubscribedLoading } = useIsSubscribed();

  const examTypesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null), [firestore]);
  const classesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'classes'), orderBy('name')) : null), [firestore]);
  const subjectsQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'subjects'), orderBy('name')) : null), [firestore]);
  const testsQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'mock_tests'), orderBy('startTime', 'desc')) : null), [firestore]);
  const customQ = useMemoFirebase(() => (firestore && user ? query(collection(firestore, 'users', user.uid, 'custom_tests'), orderBy('createdAt', 'desc')) : null), [firestore, user]);

  const { data: examTypes, isLoading: examLoading } = useCollection<ExamType>(examTypesQ);
  const { data: classes, isLoading: classLoading } = useCollection<ClassItem>(classesQ);
  const { data: subjects, isLoading: subjectLoading } = useCollection<Subject>(subjectsQ);
  const { data: tests, isLoading: testsLoading } = useCollection<OfficialTest>(testsQ);
  const { data: customTests, isLoading: customLoading } = useCollection<CustomTest>(customQ);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [examLevel, setExamLevel] = useState<'' | 'All' | 'weak' | 'medium' | 'strong'>('');
  const [sections, setSections] = useState<TestSection[]>([{ subjectId: '', questionType: '', difficultyLevel: '' }]);
  const [applied, setApplied] = useState<{ examId: string; classId: string; examLevel: 'All' | 'weak' | 'medium' | 'strong'; sections: TestSection[] } | null>(null);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const view = searchParams.get('view');

  const filteredClasses = useMemo(
    () => (examId ? (classes || []).filter((c) => c.examTypeId === examId) : []),
    [classes, examId]
  );
  const filteredSubjects = useMemo(
    () => (classId ? (subjects || []).filter((s) => s.classId === classId) : []),
    [subjects, classId]
  );
  const examNameById = useMemo(() => Object.fromEntries((examTypes || []).map((e) => [e.id, e.name])), [examTypes]);
  const classNameById = useMemo(() => Object.fromEntries((classes || []).map((c) => [c.id, c.name])), [classes]);
  const subjectNameById = useMemo(() => Object.fromEntries((subjects || []).map((s) => [s.id, s.name])), [subjects]);
  const subjectIdByNameKey = useMemo(
    () =>
      Object.fromEntries(
        (subjects || [])
          .filter((s) => !!s.name)
          .map((s) => [normalizeText(s.name), s.id])
      ),
    [subjects]
  );

  const examTypeOptions = useMemo(() => examTypes || [], [examTypes]);

  useEffect(() => {
    if (!filteredClasses.length) return setClassId('');
    if (classId && !filteredClasses.some((c) => c.id === classId)) setClassId('');
  }, [filteredClasses, classId]);

  useEffect(() => {
    setSections((curr) =>
      curr.map((section) =>
        section.subjectId &&
        section.subjectId !== ALL_SUBJECTS_VALUE &&
        !filteredSubjects.some((subject) => subject.id === section.subjectId)
          ? { ...section, subjectId: '' }
          : section
      )
    );
  }, [filteredSubjects]);

  const updateSection = (i: number, patch: Partial<TestSection>) => setSections((curr) => curr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeSection = (i: number) => setSections((curr) => (curr.length === 1 ? curr : curr.filter((_, idx) => idx !== i)));
  const addSection = () => setSections((curr) => [...curr, { subjectId: '', questionType: '', difficultyLevel: '' }]);

  const studentVisibleTests = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const published = (tests || []).filter(
      (t) =>
        isStandaloneMockTest(t) &&
        t.publicationStatus !== 'draft' &&
        t.publicationStatus !== 'deleted' &&
        !(t.accessLevel === 'paid' && t.subscriptionAttached !== true)
    );
    if (!applied) return [];
    return published.filter((t) => {
      if (t.isLiveBatchTest && t.scheduledDate !== todayKey) return false;
      const selectedExamName = examNameById[applied.examId];
      const selectedClassName = classNameById[applied.classId];
      const matchesExam = t.examTypeId === applied.examId || normalizeText(t.examTypeId) === normalizeText(selectedExamName);
      const matchesClass = t.classId === applied.classId || normalizeText(t.classId) === normalizeText(selectedClassName);
      if (!matchesExam || !matchesClass) return false;
      const level = normalizeText(t.examLevel || 'medium');
      if (applied.examLevel !== 'All' && level !== applied.examLevel) return false;
      const cfg = t.config?.subjectConfigs || [];

      const classSubjectIds = (subjects || [])
        .filter((s) => s.classId === applied.classId)
        .map((s) => s.id);

      const matchesSectionConfig = (config: { subjectId: string; questionType: TestSection['questionType']; difficultyLevel: TestSection['difficultyLevel'] }, section: TestSection) => {
        return (
          (section.questionType === 'All' || config.questionType === 'All' || config.questionType === section.questionType) &&
          (section.difficultyLevel === 'All' || config.difficultyLevel === 'All' || config.difficultyLevel === section.difficultyLevel)
        );
      };

      return applied.sections.every((s) =>
        s.subjectId === ALL_SUBJECTS_VALUE
          ? classSubjectIds.length > 0 &&
            classSubjectIds.every((subjectId) =>
              cfg.some((c) => {
                const configuredSubjectId = subjectIdByNameKey[normalizeText(c.subjectId)] || c.subjectId;
                const sameSubject = isAllSubjectsToken(c.subjectId) || configuredSubjectId === subjectId;
                if (!sameSubject) return false;
                return matchesSectionConfig(c, s);
              })
            )
          : cfg.some((c) => {
              const selectedSubjectName = subjectNameById[s.subjectId];
              const configuredSubjectId = subjectIdByNameKey[normalizeText(c.subjectId)] || c.subjectId;
              const sameSubject =
                isAllSubjectsToken(c.subjectId) ||
                configuredSubjectId === s.subjectId ||
                normalizeText(c.subjectId) === normalizeText(selectedSubjectName);
              if (!sameSubject) return false;
              return matchesSectionConfig(c, s);
            })
      );
    });
  }, [tests, applied, examNameById, classNameById, subjectNameById, subjectIdByNameKey, subjects]);

  const loading = isTeacherLoading || isAdminLoading || isSubscribedLoading || examLoading || classLoading || subjectLoading || testsLoading || customLoading;

  const teacherTests = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const base = (tests || []).filter((t) => {
      if (!isStandaloneMockTest(t)) return false;
      if (t.isLiveBatchTest && t.scheduledDate !== todayKey) return false;
      if (t.publicationStatus === 'deleted') return false;
      return true;
    });

    const isWaitingForSubscription = (t: OfficialTest) => t.accessLevel === 'paid' && t.subscriptionAttached !== true;
    const isOwnedByCurrentUser = (t: OfficialTest) => isAdmin || t.teacherId === user?.uid;

    if (view === 'waiting-subscription') {
      return base.filter((t) => isOwnedByCurrentUser(t) && isWaitingForSubscription(t));
    }

    if (view === 'draft') {
      return base.filter((t) => isOwnedByCurrentUser(t) && t.publicationStatus === 'draft' && !isWaitingForSubscription(t));
    }

    if (view === 'your') {
      return base.filter((t) => isOwnedByCurrentUser(t) && t.publicationStatus !== 'draft' && !isWaitingForSubscription(t));
    }

    return base.filter((t) => t.publicationStatus !== 'draft' || isAdmin || t.teacherId === user?.uid);
  }, [tests, isAdmin, user?.uid, view]);

  const deletableTeacherTests = useMemo(
    () => teacherTests.filter((t) => isAdmin || t.teacherId === user?.uid),
    [teacherTests, isAdmin, user?.uid]
  );

  const normalizeSectionForSearch = (section: TestSection) => ({
    subjectId: section.subjectId,
    questionType: (section.questionType || 'All') as TestSection['questionType'],
    difficultyLevel: (section.difficultyLevel || 'All') as TestSection['difficultyLevel'],
  });
  const preparedSections = sections.map(normalizeSectionForSearch);
  const examDifficultyLabel = examLevel || 'All';
  const currentFilterSignature = JSON.stringify({
    examId,
    classId,
    examLevel: examDifficultyLabel,
    sections: preparedSections,
  });
  const appliedFilterSignature = applied
    ? JSON.stringify({
        examId: applied.examId,
        classId: applied.classId,
        examLevel: applied.examLevel,
        sections: applied.sections.map(normalizeSectionForSearch),
      })
    : '';
  const hasPendingFilterChanges = !applied || currentFilterSignature !== appliedFilterSignature;
  const selectedExamLabel = examId ? (examNameById[examId] || 'Selected exam') : 'Select exam';
  const selectedClassLabel = classId ? (classNameById[classId] || 'Selected curriculum') : 'Select curriculum';
  const selectedSectionsLabel = `${sections.length} section${sections.length > 1 ? 's' : ''}`;
  const appliedSectionSubjects = applied
    ? Array.from(
        new Set(
          applied.sections
            .map((section) => {
              if (section.subjectId === ALL_SUBJECTS_VALUE) return ALL_SUBJECTS_LABEL;
              return subjectNameById[section.subjectId] || '';
            })
            .filter(Boolean)
        )
      )
    : [];
  const canSearch =
    !!examId &&
    !!classId &&
    sections.length > 0 &&
    sections.every((section) => !!section.subjectId);
  const sectionGuideSteps = [
    {
      title: 'Choose exam',
      description: 'Set your target exam to activate relevant mock tests.',
      icon: Compass,
    },
    {
      title: 'Configure sections',
      description: 'Pick subject, question type, and difficulty for each section.',
      icon: Layers,
    },
    {
      title: 'Start improving',
      description: 'Run test attempts and track your exam readiness consistently.',
      icon: TrendingUp,
    },
  ];

  const applySearchFilters = () => {
    setApplied({
      examId,
      classId,
      examLevel: (examLevel || 'All') as 'All' | 'weak' | 'medium' | 'strong',
      sections: preparedSections,
    });
  };

  const resetFilters = () => {
    setExamId('');
    setClassId('');
    setExamLevel('');
    setSections([{ subjectId: '', questionType: '', difficultyLevel: '' }]);
    setApplied(null);
  };

  if (isStudent) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Mock Tests" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
          <Card className="relative isolate overflow-hidden border-sky-300/25 bg-gradient-to-br from-slate-950 via-blue-950/60 to-indigo-950/55 shadow-[0_26px_60px_-34px_rgba(56,189,248,0.62)]">
            <div className="pointer-events-none absolute right-[-90px] top-[-85px] h-56 w-56 rounded-full bg-cyan-400/30 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-90px] left-[-80px] h-56 w-56 rounded-full bg-blue-500/25 blur-3xl" />
            <CardContent className="relative p-6 md:p-8">
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Practice Discovery
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl xl:text-[2rem]">Explore Mock Tests</h2>
                  <p className="max-w-3xl text-sm leading-relaxed text-slate-200/90 md:text-base">
                    Apply the same test-building logic teachers use so every result is accurate, relevant, and exam-ready.
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="rounded-xl border border-sky-300/25 bg-sky-500/[0.1] p-3">
                      <p className="text-[11px] uppercase tracking-wide text-sky-200">Filter</p>
                      <p className="mt-1 text-sm font-semibold">Exam</p>
                    </div>
                    <div className="rounded-xl border border-indigo-300/25 bg-indigo-500/[0.12] p-3">
                      <p className="text-[11px] uppercase tracking-wide text-indigo-200">Mode</p>
                      <p className="mt-1 text-sm font-semibold">Section Wise</p>
                    </div>
                    <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/[0.1] p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cyan-200">Goal</p>
                      <p className="mt-1 text-sm font-semibold">Accuracy</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-300/20 bg-slate-900/50 p-4 sm:p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-sky-200">How It Works</p>
                  <div className="space-y-3">
                    {sectionGuideSteps.map((step, index) => {
                      const StepIcon = step.icon;
                      return (
                        <div key={step.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-200/55 bg-cyan-500/18 text-xs font-semibold text-cyan-100">
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

          <Card className="border-border/70 bg-gradient-to-b from-slate-900/70 via-slate-900/40 to-slate-950/25 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.9)]">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-xl md:text-2xl">
                <Filter className="h-5 w-5" />
                Search Filters
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground/95">Choose exam, curriculum, and one or more sections to match tests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-slate-950/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.13em] text-sky-200">Step 1 · Exam</p>
                  <Select value={examId} onValueChange={setExamId}>
                    <SelectTrigger className="mt-2 h-11 rounded-xl border-border/70 bg-background/40">
                      <SelectValue placeholder="Select exam" />
                    </SelectTrigger>
                    <SelectContent>{examTypeOptions.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border border-border/70 bg-slate-950/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.13em] text-indigo-200">Step 2 · Curriculum</p>
                  <Select value={classId} onValueChange={setClassId} disabled={!examId}>
                    <SelectTrigger className="mt-2 h-11 rounded-xl border-border/70 bg-background/40">
                      <SelectValue placeholder="Select curriculum/class" />
                    </SelectTrigger>
                    <SelectContent>{filteredClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/[0.08] p-4">
                  <p className="text-[11px] uppercase tracking-[0.13em] text-cyan-200">Step 3 · Difficulty</p>
                  <Select value={examLevel} onValueChange={(v) => setExamLevel(v as typeof examLevel)}>
                    <SelectTrigger className="mt-2 h-11 rounded-xl border-border/70 bg-background/40">
                      <SelectValue placeholder="Exam difficulty" />
                    </SelectTrigger>
                    <SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="weak">Weak</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="strong">Strong</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              <div className={cn(
                'rounded-xl border p-4',
                hasPendingFilterChanges
                  ? 'border-cyan-300/40 bg-cyan-500/10'
                  : 'border-emerald-300/35 bg-emerald-500/10'
              )}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Current Selection</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/70 bg-background/35">{selectedExamLabel}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{selectedClassLabel}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{examDifficultyLabel} level</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{selectedSectionsLabel}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {hasPendingFilterChanges ? 'You changed filters. Click search to refresh test results.' : 'Results are synced with your current filter selection.'}
                </p>
              </div>
              {examId && filteredClasses.length === 0 ? (
                <div className="rounded-xl border border-amber-300/35 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-transparent p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 rounded-full border border-amber-300/40 bg-amber-500/15 p-1.5">
                      <Info className="h-3.5 w-3.5 text-amber-100" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-100">This exam track is opening soon on DCAM</p>
                      <p className="mt-0.5 text-xs text-amber-100/85">
                        Curriculum setup for this exam is in progress. Select another exam now, or check back shortly for fresh mock paths.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {sections.map((s, i) => (
                  <div key={`sec-${i}`} className="rounded-2xl border border-border/70 bg-slate-950/30 p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="inline-flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                        Section {i + 1}
                      </p>
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        className="rounded-full border-rose-300/35 bg-rose-500/10 px-3 text-rose-100 hover:bg-rose-500/20"
                        onClick={() => removeSection(i)}
                        disabled={sections.length === 1}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                      <div className="md:col-span-4">
                        <Select value={s.subjectId} onValueChange={(v) => updateSection(i, { subjectId: v })} disabled={!classId || filteredSubjects.length === 0}>
                          <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/30">
                            <SelectValue placeholder={!classId ? 'Select curriculum/class first' : 'Subject'} />
                          </SelectTrigger>
                          <SelectContent><SelectItem value={ALL_SUBJECTS_VALUE}>{ALL_SUBJECTS_LABEL}</SelectItem>{filteredSubjects.map((sub) => <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-3">
                        <Select value={s.questionType} onValueChange={(v) => updateSection(i, { questionType: v as TestSection['questionType'] })}>
                          <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/30">
                            <SelectValue placeholder="Question type" />
                          </SelectTrigger>
                          <SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="MCQ">MCQ</SelectItem><SelectItem value="Numerical">Numerical</SelectItem><SelectItem value="Text">Text</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-3">
                        <Select value={s.difficultyLevel} onValueChange={(v) => updateSection(i, { difficultyLevel: v as TestSection['difficultyLevel'] })}>
                          <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/30">
                            <SelectValue placeholder="Question difficulty" />
                          </SelectTrigger>
                          <SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Badge variant="outline" className="w-full justify-center border-border/60 bg-background/25 py-2 text-center">
                          Section {i + 1}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
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
                        Subject-level mock setup is currently updating. Try another curriculum for instant practice, or revisit soon.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" type="button" onClick={addSection} className="h-11 rounded-full border-cyan-300/35 bg-cyan-500/10 px-5 text-cyan-100 hover:bg-cyan-500/20"><PlusCircle className="mr-2 h-4 w-4" />Add Section</Button>
                <Button type="button" variant="outline" onClick={resetFilters} className="h-11 rounded-full border-border/70 bg-background/35 px-5">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 px-6 font-semibold text-slate-950 shadow-[0_12px_28px_-12px_rgba(56,189,248,0.82)] transition-all duration-300 hover:translate-y-[-1px] hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300 hover:shadow-[0_16px_30px_-12px_rgba(56,189,248,0.9)]"
                  onClick={applySearchFilters}
                  disabled={!canSearch}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search Mock Tests
                </Button>
              </div>
            </CardContent>
          </Card>

          {applied ? (
            <Card className="border-border/70 bg-gradient-to-r from-slate-950/90 via-cyan-950/24 to-blue-950/16">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Result Window</p>
                  <p className="mt-1 text-lg font-semibold">
                    {studentVisibleTests.length} {studentVisibleTests.length === 1 ? 'Mock Test' : 'Mock Tests'} matched
                  </p>
                  <p className="text-xs text-muted-foreground">Results match your latest applied sections and exam filters.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/70 bg-background/35">{examNameById[applied.examId] || 'Exam'}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{classNameById[applied.classId] || 'Curriculum'}</Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/35">{applied.examLevel} level</Badge>
                  {appliedSectionSubjects.length > 0 ? (
                    <Badge variant="outline" className="border-border/70 bg-background/35">{appliedSectionSubjects.length} subject scope</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {!applied ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="space-y-2 p-10 text-center text-muted-foreground">
                  <Target className="mx-auto h-6 w-6" />
                  <p className="text-sm font-medium text-foreground">Set your filters and run search to unlock matched tests.</p>
                  <p className="text-xs text-muted-foreground">Use section filters to target exactly the question pattern you want to practice.</p>
                </CardContent>
              </Card>
            ) : null}
            {applied && !loading && studentVisibleTests.length === 0 ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="space-y-3 p-10 text-center text-muted-foreground">
                  <p className="text-sm">No matching tests found for this configuration.</p>
                  <p className="text-xs text-muted-foreground">Try reducing section constraints or clear filters to discover more options.</p>
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" className="rounded-full" onClick={resetFilters}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Clear All Filters
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {loading ? <><Skeleton className="h-52 w-full" /><Skeleton className="h-52 w-full" /></> : null}
            {studentVisibleTests.map((t) => {
              const paid = t.accessLevel === 'paid';
              const unlocked = !paid || (isSubscribed && subscriptionPlan?.examTypeId === t.examTypeId);
              const startDate = toDateSafe(t.startTime);
              const accessEndDate =
                toDateSafe(t.accessWindowEndAt)
                || (
                  t.scheduledDate && t.accessEndTime
                    ? toDateSafe(`${t.scheduledDate}T${t.accessEndTime}:00`)
                    : null
                );
              const upcoming = startDate ? startDate > new Date() : false;
              const accessClosed = accessEndDate ? accessEndDate.getTime() < Date.now() : false;
              const subjectsText =
                Array.from(
                  new Set(
                    (t.config.subjectConfigs || [])
                      .map((c) => {
                        if (isAllSubjectsToken(c.subjectId)) return ALL_SUBJECTS_LABEL;
                        return subjectNameById[c.subjectId] || c.subjectId || '';
                      })
                      .filter(Boolean)
                  )
                ).join(', ') || 'N/A';
              const thumb = t.thumbnailUrl || t.imageUrl;
              const statusLabel = upcoming && startDate
                ? `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`
                : (accessClosed ? 'Access Closed' : 'Ready to Start');
              return (
                <Card key={t.id} className="group relative flex flex-col overflow-hidden border-border/70 bg-gradient-to-b from-slate-900/95 via-slate-900/88 to-blue-950/78 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-300/55 hover:shadow-[0_20px_42px_-24px_rgba(34,211,238,0.55)]">
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.2),transparent_48%)]" />
                  </div>

                  {thumb ? (
                    <div className="relative h-32 w-full overflow-hidden border-b border-border/60">
                      <img src={thumb} alt={t.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                    </div>
                  ) : null}

                  <CardHeader className="relative space-y-2 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-xl font-semibold leading-tight tracking-tight">{t.title}</CardTitle>
                      <Badge className={paid ? 'border-rose-300/45 bg-rose-500/15 text-rose-100' : 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100'}>
                        {paid ? 'Premium' : 'Free'}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm text-slate-300">
                      {(examNameById[t.examTypeId] || 'General')} | {startDate ? format(startDate, 'PPP p') : 'Schedule pending'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="relative space-y-3 pt-0">
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {statusLabel}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-muted-foreground">
                        Questions
                        <p className="mt-1 text-sm font-semibold text-foreground">{t.config.questionIds?.length || 0}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-muted-foreground">
                        Duration
                        <p className="mt-1 text-sm font-semibold text-foreground">{t.config.duration || 0} min</p>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">Subjects: {subjectsText}</p>
                  </CardContent>

                  <CardFooter className="grid grid-cols-2 gap-2 pt-1">
                    {unlocked ? (
                      <>
                        <Button asChild variant="outline" className="rounded-full border-slate-600/80 bg-slate-900/75 hover:bg-slate-800/85" disabled={upcoming}>
                          <Link href={`/mock-tests/${t.id}`}>View Test</Link>
                        </Button>
                        <Button asChild className="rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 font-semibold text-slate-950 hover:from-cyan-300 hover:via-sky-300 hover:to-blue-300" disabled={upcoming || accessClosed}>
                          <Link href={`/mock-tests/${t.id}/start`}>
                            {upcoming && startDate
                              ? `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`
                              : accessClosed
                                ? 'Access Closed'
                                : 'Start Test'}
                            {!upcoming && !accessClosed ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild variant="outline" className="rounded-full border-slate-600/80 bg-slate-900/75 hover:bg-slate-800/85">
                          <Link href={`/mock-tests/${t.id}`}>View Test</Link>
                        </Button>
                        <Button asChild variant="secondary" className="rounded-full border border-amber-300/45 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20">
                          <Link href="/subscription"><Lock className="mr-2 h-4 w-4" />Subscribe</Link>
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const toggleSelectTest = (testId: string) => {
    setSelectedTestIds((prev) => (prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]));
  };

  const clearSelection = () => setSelectedTestIds([]);

  const handleDeleteSelected = async () => {
    if (!firestore || selectedTestIds.length === 0) return;
    setIsDeleting(true);
    try {
      const selectedSet = new Set(selectedTestIds);
      const selectedTests = deletableTeacherTests.filter((t) => selectedSet.has(t.id));
      let archivedCount = 0;
      let failedCount = 0;

      for (const test of selectedTests) {
        const testRef = doc(firestore, 'mock_tests', test.id);
        try {
          await updateDoc(testRef, {
            publicationStatus: 'deleted',
            deletedAt: new Date().toISOString(),
            deletedBy: user?.uid || null,
          });
          archivedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      const linkedPlanIds: string[] = [];
      for (const test of selectedTests) {
        const plansQ = query(
          collection(firestore, 'subscription_plans'),
          where('linkedContentType', '==', 'mock_test'),
          where('linkedContentId', '==', test.id)
        );
        const plansSnap = await getDocs(plansQ);
        plansSnap.forEach((planDoc) => linkedPlanIds.push(planDoc.id));
      }

      for (const planId of linkedPlanIds) {
        try {
          await updateDoc(doc(firestore, 'subscription_plans', planId), {
            linkedContentId: null,
            linkedContentType: null,
            status: 'archived',
            archivedAt: new Date().toISOString(),
          });
        } catch {
          // Plan archival is best-effort.
        }
      }

      if (archivedCount > 0) {
        toast({
          title: 'Mock tests removed',
          description:
            failedCount > 0
              ? `${archivedCount} test(s) archived and hidden. ${failedCount} failed due to permissions.`
              : `${archivedCount} test(s) archived and hidden successfully.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Delete failed',
          description: 'No selected tests could be removed due to permission restrictions.',
        });
      }
      clearSelection();
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Could not delete selected tests.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Mock Tests" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-headline text-2xl font-semibold">Available Mock Tests</h2>
          <div className="flex gap-2">
            {selectedTestIds.length > 0 ? (
              <>
                <Button variant="outline" onClick={clearSelection}>
                  Clear ({selectedTestIds.length})
                </Button>
                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
              </>
            ) : null}
            <Button asChild variant="outline"><Link href="/mock-tests/create"><PlusCircle className="mr-2 h-4 w-4" />Create Mock Test</Link></Button>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {loading ? <><Skeleton className="h-52 w-full" /><Skeleton className="h-52 w-full" /></> : null}
          {!loading && teacherTests.length === 0 ? <Card className="col-span-full p-8 text-center border-dashed"><p className="text-muted-foreground">No tests available.</p></Card> : null}
          {teacherTests.map((t) => {
            const startDate = toDateSafe(t.startTime);
            return (
              <Card key={t.id} className="group relative flex flex-col overflow-hidden border-border/70 bg-gradient-to-b from-slate-900/95 via-slate-900/85 to-blue-950/75 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/50 hover:shadow-sky-950/40">
              {(isAdmin || t.teacherId === user?.uid) ? (
                <label className="absolute right-3 top-3 z-20 inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-500/70 bg-slate-950/85 px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedTestIds.includes(t.id)}
                    onChange={() => toggleSelectTest(t.id)}
                    className="h-3.5 w-3.5 accent-sky-500"
                  />
                  <span>Select</span>
                </label>
              ) : null}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.2),transparent_48%)]" />
              </div>

              {(t.thumbnailUrl || t.imageUrl) ? (
                <div className="relative h-32 w-full overflow-hidden border-b border-border/60">
                  <img src={t.thumbnailUrl || t.imageUrl} alt={t.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                </div>
              ) : null}

              <CardHeader className="relative space-y-2 pb-3">
                <CardTitle className="line-clamp-2 text-2xl font-semibold leading-tight tracking-tight">{t.title}</CardTitle>
                <CardDescription className="text-sm text-slate-300">
                  {startDate ? format(startDate, 'PPP p') : 'Schedule pending'}
                </CardDescription>
              </CardHeader>

              <CardContent className="relative space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-muted-foreground">
                    Questions
                    <p className="mt-1 text-sm font-semibold text-foreground">{t.config.questionIds?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-muted-foreground">
                    Duration
                    <p className="mt-1 text-sm font-semibold text-foreground">{t.config.duration || 0} min</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Badge className={t.accessLevel === 'paid' ? 'border-red-400/60 bg-red-500/20 text-red-100' : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'}>
                    {t.accessLevel === 'paid' ? 'Paid' : 'Free'}
                  </Badge>
                </div>
              </CardContent>

              <CardFooter className="grid grid-cols-2 gap-2 pt-1">
                <Button asChild variant="outline" className="rounded-full border-slate-600/80 bg-slate-900/75 hover:bg-slate-800/85">
                  <Link href={`/mock-tests/edit/${t.id}`}><PencilLine className="mr-2 h-4 w-4" />Edit</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full border-slate-600/80 bg-slate-900/75 hover:bg-slate-800/85">
                  <Link href={`/mock-tests/${t.id}`}>View Test</Link>
                </Button>
              </CardFooter>
              </Card>
            );
          })}
        </div>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected mock tests?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {selectedTestIds.length} selected test(s) and linked subscription plans.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteSelected} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
