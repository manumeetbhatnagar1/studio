'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, query, serverTimestamp, where } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, addDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useToast } from '@/hooks/use-toast';
import { calculateLiveBatchSessionCoverage, getConductedLiveBatchMeetings } from '@/lib/live-batch-session-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, BellRing, Lock, Medal, Users } from 'lucide-react';

type LiveBatch = {
  id: string;
  title?: string;
  teacherId?: string;
  teacherName?: string;
  accessLevel?: 'free' | 'paid';
  publicationStatus?: 'draft' | 'published' | 'deleted';
};

type SessionItem = {
  id: string;
  type?: 'meeting' | 'previous_session' | 'holiday' | 'cancelled' | string;
  date?: string;
  meetingTime?: string;
};

type EnrolledBatchRecord = {
  id: string;
  batchId?: string;
  enrolledAt?: string;
  paidAt?: string;
  accessLevel?: 'free' | 'paid';
  sessionsPurchased?: number;
  sessionPurchaseHistory?: unknown;
  studentId?: string;
};

type StudentProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
};
type UserDoc = {
  id: string;
  roleId?: string;
};

type ScheduledBatchTest = {
  id: string;
  title?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  startTime?: { toDate?: () => Date } | Date | string;
  publicationStatus?: 'draft' | 'published';
};

type TestAnalyticsAttempt = {
  studentId?: string;
  studentName?: string;
  score?: number;
  timeTaken?: number;
  submittedAt?: unknown;
};

type TestAnalyticsDoc = {
  attemptHistory?: TestAnalyticsAttempt[];
};

type LeaderboardRow = {
  studentId: string;
  studentName: string;
  bestScore: number;
  bestTime: number;
  rank: number;
};

type StudentRow = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  joinedAtLabel: string;
  sessionsRemainingLabel: string;
  classesAttended: number;
  rank: number | null;
  bestScore: number | null;
  isPaidEnrollment: boolean;
};

const parseYmdToLocalDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toLocalYmd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toLocalHm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const formatYmdForDisplay = (value?: string) => {
  const date = parseYmdToLocalDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const asDate = (value?: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      try {
        const parsed = candidate.toDate();
        return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof candidate.seconds === 'number') {
      const parsed = new Date(candidate.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
};

const parseYmdHmToLocalDateTime = (dateValue?: string, timeValue?: string) => {
  const date = parseYmdToLocalDate(dateValue);
  if (!date) return null;
  const normalizedTime = timeValue && /^\d{1,2}:\d{2}$/.test(timeValue) ? timeValue : '23:59';
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  date.setHours(hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getScheduledTestDateTime = (test: ScheduledBatchTest) => {
  let dateValue = test.scheduledDate || '';
  let timeValue = test.scheduledTime || '';

  if ((!dateValue || !timeValue) && test.startTime) {
    const parsed = asDate(test.startTime);
    if (parsed) {
      if (!dateValue) dateValue = toLocalYmd(parsed);
      if (!timeValue) timeValue = toLocalHm(parsed);
    }
  }

  return { date: dateValue, time: timeValue };
};

export default function LiveBatchManageStudentsPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = typeof params?.batchId === 'string' ? params.batchId : '';
  const firestore = useFirestore();
  const { user } = useUser();
  const { isTeacher } = useIsTeacher();
  const { toast } = useToast();

  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledBatchRecord[]>([]);
  const [isLoadingEnrolledStudents, setIsLoadingEnrolledStudents] = useState(true);
  const [studentProfilesById, setStudentProfilesById] = useState<Record<string, StudentProfile>>({});
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [sendingReminderToStudentId, setSendingReminderToStudentId] = useState<string | null>(null);

  const batchRef = useMemoFirebase(() => (firestore && batchId ? doc(firestore, 'live_batches', batchId) : null), [firestore, batchId]);
  const sessionsQ = useMemoFirebase(
    () => (firestore && batchId ? query(collection(firestore, 'live_batch_sessions'), where('batchId', '==', batchId)) : null),
    [firestore, batchId]
  );
  const testsQ = useMemoFirebase(
    () => (firestore && batchId ? query(collection(firestore, 'mock_tests'), where('liveBatchId', '==', batchId)) : null),
    [firestore, batchId]
  );
  const usersQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'users')) : null), [firestore]);

  const { data: batch, isLoading: isLoadingBatch } = useDoc<LiveBatch>(batchRef);
  const { data: sessionsData, isLoading: isLoadingSessions } = useCollection<SessionItem>(sessionsQ);
  const { data: testsData, isLoading: isLoadingTests } = useCollection<ScheduledBatchTest>(testsQ);
  const { data: usersData, isLoading: isLoadingUsers } = useCollection<UserDoc>(usersQ);

  useEffect(() => {
    if (!firestore || !batchId || !usersData) {
      setEnrolledStudents([]);
      setIsLoadingEnrolledStudents(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEnrolledStudents(true);

    const candidateStudentIds = usersData
      .map((item) => item.id)
      .filter((userId): userId is string => Boolean(userId));

    Promise.all(
      candidateStudentIds.map(async (studentId) => {
        try {
          const enrollmentSnap = await getDoc(doc(firestore, 'users', studentId, 'enrolled_live_batches', batchId));
          if (!enrollmentSnap.exists()) return null;
          const data = enrollmentSnap.data() as EnrolledBatchRecord;
          return {
            ...data,
            id: enrollmentSnap.id,
            studentId,
            batchId: data.batchId || enrollmentSnap.id,
          } as EnrolledBatchRecord;
        } catch {
          return null;
        }
      })
    )
      .then((rows) => {
        if (cancelled) return;
        const filteredRows = rows
          .filter((row): row is EnrolledBatchRecord => Boolean(row && row.studentId))
          .sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));
        setEnrolledStudents(filteredRows);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingEnrolledStudents(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, firestore, usersData]);

  const studentIds = useMemo(() => {
    return Array.from(new Set(enrolledStudents.map((row) => row.studentId).filter((id): id is string => Boolean(id))));
  }, [enrolledStudents]);

  const missingStudentIds = useMemo(
    () => studentIds.filter((studentId) => !studentProfilesById[studentId]),
    [studentIds, studentProfilesById]
  );

  useEffect(() => {
    if (!firestore || missingStudentIds.length === 0) return;

    let cancelled = false;
    setIsLoadingProfiles(true);

    Promise.all(
      missingStudentIds.map(async (studentId) => {
        try {
          const studentSnap = await getDoc(doc(firestore, 'users', studentId));
          if (!studentSnap.exists()) return [studentId, null] as const;
          const profileData = studentSnap.data() as Omit<StudentProfile, 'id'>;
          return [studentId, { ...profileData, id: studentId }] as const;
        } catch {
          return [studentId, null] as const;
        }
      })
    )
      .then((results) => {
        if (cancelled) return;
        setStudentProfilesById((prev) => {
          const next = { ...prev };
          results.forEach(([studentId, profile]) => {
            next[studentId] = profile || { id: studentId };
          });
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfiles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firestore, missingStudentIds]);

  const meetingSessions = useMemo(
    () => (sessionsData || []).filter((session) => session.type === 'meeting'),
    [sessionsData]
  );

  const conductedMeetings = useMemo(
    () => getConductedLiveBatchMeetings(meetingSessions),
    [meetingSessions]
  );

  const latestCompletedBatchTestId = useMemo(() => {
    const tests = testsData || [];
    if (tests.length === 0) return '';
    const nowMs = Date.now();

    const completedTests = tests
      .map((test) => {
        const resolved = getScheduledTestDateTime(test);
        return {
          id: test.id,
          publicationStatus: test.publicationStatus,
          dateTime: parseYmdHmToLocalDateTime(resolved.date, resolved.time),
        };
      })
      .filter((item) => !!item.dateTime && item.dateTime.getTime() <= nowMs && item.publicationStatus !== 'draft')
      .sort((a, b) => (b.dateTime as Date).getTime() - (a.dateTime as Date).getTime());

    return completedTests[0]?.id || '';
  }, [testsData]);

  useEffect(() => {
    let cancelled = false;

    const loadLeaderboard = async () => {
      if (!firestore || !latestCompletedBatchTestId) {
        if (!cancelled) {
          setLeaderboardRows([]);
          setIsLoadingLeaderboard(false);
        }
        return;
      }

      setIsLoadingLeaderboard(true);
      try {
        const analyticsSnap = await getDoc(doc(firestore, 'test_analytics', latestCompletedBatchTestId));
        const analytics = analyticsSnap.exists() ? (analyticsSnap.data() as TestAnalyticsDoc) : null;
        const attempts = Array.isArray(analytics?.attemptHistory) ? analytics.attemptHistory : [];

        const byStudent = new Map<string, { studentName: string; bestScore: number; bestTime: number; bestAttemptAtMs: number }>();
        attempts.forEach((attempt) => {
          const studentId = String(attempt.studentId || '').trim();
          if (!studentId) return;

          const score = Math.max(0, Number(attempt.score || 0));
          const timeTaken = Math.max(0, Number(attempt.timeTaken || 0));
          const attemptAtMs = asDate(attempt.submittedAt)?.getTime() || 0;
          const existing = byStudent.get(studentId);

          if (!existing) {
            byStudent.set(studentId, {
              studentName: attempt.studentName || 'Student',
              bestScore: score,
              bestTime: timeTaken,
              bestAttemptAtMs: attemptAtMs,
            });
            return;
          }

          const betterScore = score > existing.bestScore;
          const sameScoreBetterTime = score === existing.bestScore && timeTaken < existing.bestTime;
          const sameScoreTimeNewerAttempt = score === existing.bestScore && timeTaken === existing.bestTime && attemptAtMs > existing.bestAttemptAtMs;

          if (betterScore || sameScoreBetterTime || sameScoreTimeNewerAttempt) {
            byStudent.set(studentId, {
              studentName: attempt.studentName || existing.studentName || 'Student',
              bestScore: score,
              bestTime: timeTaken,
              bestAttemptAtMs: attemptAtMs,
            });
          }
        });

        const sorted = Array.from(byStudent.entries())
          .map(([studentId, values]) => ({ studentId, ...values }))
          .sort((a, b) => {
            if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
            if (a.bestTime !== b.bestTime) return a.bestTime - b.bestTime;
            return b.bestAttemptAtMs - a.bestAttemptAtMs;
          });

        let rankCounter = 0;
        let previousScore: number | null = null;
        let previousTime: number | null = null;
        const rankedRows: LeaderboardRow[] = sorted.map((row, index) => {
          if (previousScore === null || row.bestScore !== previousScore || row.bestTime !== previousTime) {
            rankCounter = index + 1;
            previousScore = row.bestScore;
            previousTime = row.bestTime;
          }

          return {
            studentId: row.studentId,
            studentName: row.studentName,
            bestScore: row.bestScore,
            bestTime: row.bestTime,
            rank: rankCounter,
          };
        });

        if (!cancelled) {
          setLeaderboardRows(rankedRows);
        }
      } catch {
        if (!cancelled) {
          setLeaderboardRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLeaderboard(false);
        }
      }
    };

    loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [firestore, latestCompletedBatchTestId]);

  const leaderboardByStudentId = useMemo(
    () => Object.fromEntries(leaderboardRows.map((row) => [row.studentId, row])),
    [leaderboardRows]
  );

  const studentsWithMetrics = useMemo<StudentRow[]>(() => {
    return enrolledStudents
      .map((record) => {
        const studentId = record.studentId || '';
        const profile = studentProfilesById[studentId];
        const fullName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
        const studentName = fullName || profile?.displayName || `Student ${studentId.slice(0, 6)}`;
        const studentEmail = profile?.email || 'Email not available';
        const joinedAtLabel = formatYmdForDisplay((record.enrolledAt || '').slice(0, 10));

        const isPaidEnrollment = batch?.accessLevel === 'paid';

        let sessionsRemainingLabel = 'Unlimited';
        let classesAttended = 0;

        if (isPaidEnrollment) {
          const coverage = calculateLiveBatchSessionCoverage({
            sessions: meetingSessions,
            enrollment: {
              paidAt: record.paidAt,
              enrolledAt: record.enrolledAt,
              sessionsPurchased: record.sessionsPurchased,
              sessionPurchaseHistory: record.sessionPurchaseHistory,
            },
          });
          sessionsRemainingLabel = String(coverage.remainingSessions);
          classesAttended = coverage.consumedSessions;
        } else {
          const enrolledAtDate = asDate(record.enrolledAt);
          classesAttended = conductedMeetings.filter((meeting) => {
            if (!enrolledAtDate) return true;
            return meeting.dateTime.getTime() >= enrolledAtDate.getTime();
          }).length;
        }

        const leaderboardRow = leaderboardByStudentId[studentId];

        return {
          studentId,
          studentName,
          studentEmail,
          joinedAtLabel,
          sessionsRemainingLabel,
          classesAttended,
          rank: leaderboardRow?.rank ?? null,
          bestScore: leaderboardRow?.bestScore ?? null,
          isPaidEnrollment,
        };
      })
      .sort((a, b) => {
        const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [batch?.accessLevel, conductedMeetings, enrolledStudents, leaderboardByStudentId, meetingSessions, studentProfilesById]);

  const paidStudentCount = studentsWithMetrics.filter((student) => student.isPaidEnrollment).length;
  const ownerTeacherAccess = Boolean(isTeacher && user?.uid && batch?.teacherId && user.uid === batch.teacherId);
  const isPaidBatch = batch?.accessLevel === 'paid';
  const pageLoading = isLoadingBatch || isLoadingUsers || isLoadingEnrolledStudents || isLoadingSessions || isLoadingTests;

  const sendBuySessionsReminder = async (student: StudentRow) => {
    if (!firestore || !batchId || !student.studentId) return;
    setSendingReminderToStudentId(student.studentId);

    try {
      await addDocumentNonBlocking(collection(firestore, 'notifications'), {
        title: 'Buy Sessions Reminder',
        message: `${batch?.title || 'Live batch'}: Your teacher asked you to buy/renew sessions to continue your live learning.`,
        href: `/live-batches/${batchId}`,
        recipientId: student.studentId,
        audience: 'students',
        batchId,
        notificationType: 'live_batch_buy_sessions',
        createdAt: serverTimestamp(),
      });

      toast({
        title: 'Reminder sent',
        description: `Notification sent to ${student.studentName}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send reminder',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setSendingReminderToStudentId(null);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex h-full flex-col">
        <DashboardHeader title="Manage Students" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-4">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!batch || batch.publicationStatus === 'draft' || batch.publicationStatus === 'deleted') {
    return (
      <div className="flex h-full flex-col">
        <DashboardHeader title="Manage Students" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Card className="border-border/70">
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">Batch not found or not published.</p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/live-batches">Back to Live Batches</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!ownerTeacherAccess) {
    return (
      <div className="flex h-full flex-col">
        <DashboardHeader title="Manage Students" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Card className="border-border/70">
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Only the batch owner teacher can manage students for this classroom.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/live-batches/${batchId}`}>Back to Classroom</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader title="Manage Students" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <Button asChild variant="outline" className="rounded-full">
          <Link href={`/live-batches/${batchId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classroom
          </Link>
        </Button>

        <Card className="border-border/70 bg-gradient-to-r from-slate-900/80 via-blue-950/55 to-slate-900/80">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-300" />
              {batch.title || 'Live Batch'} - Student Management
            </CardTitle>
            <CardDescription>
              {isPaidBatch
                ? 'View all enrolled students, track session usage, and send buy-session reminders individually.'
                : 'View all enrolled students with attendance and class performance insights.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Total Students</p>
              <p className="text-lg font-semibold">{studentsWithMetrics.length}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{isPaidBatch ? 'Paid Enrollments' : 'Enrollment Type'}</p>
              <p className="text-lg font-semibold">{isPaidBatch ? paidStudentCount : 'Free'}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Conducted Classes</p>
              <p className="text-lg font-semibold">{conductedMeetings.length}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Latest Leaderboard</p>
              <p className="text-lg font-semibold">{latestCompletedBatchTestId ? 'Available' : 'Not available'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-base">
              <Medal className="h-4 w-4 text-amber-300" />
              Student Insights
            </CardTitle>
            <CardDescription>
              {isPaidBatch
                ? 'Sessions remaining, classes attended, class rank, and per-student reminder action.'
                : 'Classes attended, class rank, and performance insights for enrolled students.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingProfiles || isLoadingLeaderboard ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : studentsWithMetrics.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                No enrolled students found for this batch yet.
              </div>
            ) : (
              studentsWithMetrics.map((student) => (
                <div key={student.studentId} className="rounded-lg border border-border/60 bg-background/40 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold">{student.studentName}</p>
                      <p className="truncate text-xs text-muted-foreground">{student.studentEmail}</p>
                      <p className="text-xs text-muted-foreground">Joined: {student.joinedAtLabel}</p>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Sessions Left</p>
                        <p className="text-sm font-semibold">{student.sessionsRemainingLabel}</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Classes Attended</p>
                        <p className="text-sm font-semibold">{student.classesAttended}</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Class Rank</p>
                        <p className="text-sm font-semibold">{student.rank ? `#${student.rank}` : 'N/A'}</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Best Score</p>
                        <p className="text-sm font-semibold">{student.bestScore !== null ? student.bestScore : 'N/A'}</p>
                      </div>
                    </div>

                    {isPaidBatch && student.isPaidEnrollment ? (
                      <Button
                        onClick={() => sendBuySessionsReminder(student)}
                        disabled={sendingReminderToStudentId === student.studentId}
                        className="h-10 rounded-full border border-amber-200/40 bg-gradient-to-r from-amber-300 via-orange-300 to-yellow-300 px-5 font-semibold text-slate-950 hover:from-amber-200 hover:via-orange-200 hover:to-yellow-200"
                      >
                        <BellRing className="mr-2 h-4 w-4" />
                        {sendingReminderToStudentId === student.studentId ? 'Sending...' : 'Send Buy Session Alert'}
                      </Button>
                    ) : isPaidBatch ? (
                      <Badge variant="outline" className="w-fit border-emerald-300/35 bg-emerald-500/10 text-emerald-100">
                        Free Batch Enrollment
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {isPaidBatch ? (
          <Card className="border-border/70 bg-muted/10">
            <CardContent className="p-4">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Students receive buy-session reminders in their bell notifications only when you send them from this page.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
