'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateLiveBatchSessionCoverage, type LiveBatchSessionPurchaseHistoryItem } from '@/lib/live-batch-session-access';
import {
  Activity,
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  Clock3,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  History,
  Lock,
  ListChecks,
  Sparkles,
  Trophy,
  User2,
  Users,
  Video,
} from 'lucide-react';

type ExamType = { id: string; name: string };
type ClassItem = { id: string; name: string };
type Subject = { id: string; name: string };

type LiveBatch = {
  id: string;
  title?: string;
  description?: string;
  outcomes?: string;
  explanationVideoUrl?: string;
  examTypeId?: string;
  classId?: string;
  batchStartDate?: string;
  subjectIds?: string[];
  subjectSchedules?: Array<{
    subjectId: string;
    daysOfWeek: string[];
    startTime: string;
    endTime: string;
    useDifferentTimingPerDay?: boolean;
    dayTimings?: Record<string, { startTime: string; endTime: string }>;
  }>;
  accessLevel?: 'free' | 'paid';
  teacherId?: string;
  teacherName?: string;
  thumbnailUrl?: string;
  publicationStatus?: 'draft' | 'published' | 'deleted';
  totalSessions?: number;
  perSessionFee?: number;
};

type SessionItem = {
  id: string;
  type?: 'meeting' | 'previous_session' | 'holiday' | 'cancelled';
  date?: string;
  holidayEndDate?: string;
  meetingTime?: string;
  subjectId?: string;
  subjectName?: string;
  meetingTitle?: string;
  zoomLink?: string;
  previousSessionUrl?: string;
  reason?: string;
  sessionLabel?: string;
};

type ScheduledBatchTest = {
  id: string;
  title?: string;
  liveBatchId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  accessStartTime?: string;
  accessEndTime?: string;
  accessWindowStartAt?: { toDate?: () => Date } | Date | string;
  accessWindowEndAt?: { toDate?: () => Date } | Date | string;
  startTime?: { toDate?: () => Date } | Date | string;
  publicationStatus?: 'draft' | 'published';
};
type ResolvedScheduledBatchTest = ScheduledBatchTest & {
  resolvedDate: string;
  resolvedTime: string;
};

type EnrolledBatchRecord = {
  id: string;
  batchId?: string;
  enrolledAt?: string;
  paidAt?: string;
  sessionsPurchased?: number;
  sessionFee?: number;
  totalSessionsInBatch?: number;
  amountPaid?: number;
  sessionPurchaseHistory?: LiveBatchSessionPurchaseHistoryItem[];
};

type SubscriptionPlan = {
  id: string;
  linkedContentType?: 'course' | 'mock_test' | 'live_batch' | null;
  linkedContentId?: string | null;
  createdByTeacherId?: string;
  price?: number;
  sessionFee?: number;
  totalSessions?: number;
  numberOfLiveClasses?: number;
};

type UpcomingSessionSlot = {
  date: string;
  dayName: string;
  subjectName: string;
  startTime: string;
  endTime?: string;
  noticeType?: 'holiday' | 'cancelled';
  noticeText?: string;
};
type NextClassCandidate = {
  dateTime: Date;
  date: string;
  time: string;
  title: string;
  subjectLabel: string;
  zoomLink?: string;
};
type SubjectTimingRow = {
  dayName: string;
  dayShort: string;
  startTime: string;
  endTime?: string;
};
type SubjectTimingCard = {
  key: string;
  subjectName: string;
  slotsPerWeek: number;
  daysLabel: string;
  startsAtLabel: string;
  endsAtLabel: string;
  usesDayWiseTiming: boolean;
  dayRows: SubjectTimingRow[];
};
type AttemptHistoryItem = {
  studentId?: string;
  studentName?: string;
  score?: number;
  timeTaken?: number;
  submittedAt?: unknown;
};
type TestAnalyticsDoc = {
  attemptHistory?: AttemptHistoryItem[];
};
type TestResultSummary = {
  attempts: number;
  uniqueStudents: number;
  bestScore: number | null;
  lastAttemptAt: Date | null;
};
type ClassroomLeaderboardRow = {
  studentId: string;
  studentName: string;
  bestScore: number;
  bestTime: number;
  attempts: number;
  lastAttemptAt: Date | null;
  rank: number;
};
type ClassroomLeaderboardRankGroup = {
  rank: number;
  score: number;
  entries: ClassroomLeaderboardRow[];
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const UPCOMING_SLOT_WINDOW_DAYS = 10;
type LiveBatchClassroomPageProps = {
  classroomOnly?: boolean;
};

const pad2 = (value: number) => String(value).padStart(2, '0');
const toLocalYmd = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const toLocalHm = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseYmdToLocalDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const asDate = (value?: string | Date | { toDate?: () => Date }) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    const dt = value.toDate();
    return dt instanceof Date && !Number.isNaN(dt.getTime()) ? dt : null;
  }
  return null;
};

const expandYmdDateRange = (startValue?: string, endValue?: string) => {
  const startDate = parseYmdToLocalDate(startValue);
  if (!startDate) return [] as string[];
  const endDateParsed = parseYmdToLocalDate(endValue);
  const normalizedEndDate = !endDateParsed || endDateParsed.getTime() < startDate.getTime() ? startDate : endDateParsed;

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor.getTime() <= normalizedEndDate.getTime()) {
    dates.push(toLocalYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const formatYmdRange = (startValue?: string, endValue?: string) => {
  if (!startValue) return 'N/A';
  if (!endValue || endValue === startValue) return startValue;
  return `${startValue} to ${endValue}`;
};

const formatYmdForDisplay = (value?: string) => {
  const date = parseYmdToLocalDate(value);
  if (!date) return value || 'N/A';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const toMinutes = (value?: string) => {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const formatMinutesForDisplay = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const formatTimeForDisplay = (value?: string) => {
  const minutes = toMinutes(value);
  if (minutes === null) return value || 'Time TBA';
  return formatMinutesForDisplay(minutes);
};

const parseYmdHmToLocalDateTime = (dateValue?: string, timeValue?: string) => {
  const date = parseYmdToLocalDate(dateValue);
  if (!date) return null;
  const normalizedTime = (timeValue && /^\d{1,2}:\d{2}$/.test(timeValue)) ? timeValue : '23:59';
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  date.setHours(hours, minutes, 0, 0);
  return date;
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

const getYoutubeEmbedUrl = (raw?: string) => {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
  } catch {
    return '';
  }
  return '';
};

export default function LiveBatchClassroomPage({ classroomOnly = false }: LiveBatchClassroomPageProps = {}) {
  const params = useParams<{ batchId: string }>();
  const batchId = typeof params?.batchId === 'string' ? params.batchId : '';
  const router = useRouter();
  const { user } = useUser();
  const { isTeacher } = useIsTeacher();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [hasEnrolledNow, setHasEnrolledNow] = useState(false);
  const [requestedSessionsForPurchase, setRequestedSessionsForPurchase] = useState(1);
  const [showTeacherActivity, setShowTeacherActivity] = useState(false);
  const [testResultsById, setTestResultsById] = useState<Record<string, TestResultSummary>>({});
  const [isLoadingTestResults, setIsLoadingTestResults] = useState(false);
  const [latestTestLeaderboardRows, setLatestTestLeaderboardRows] = useState<ClassroomLeaderboardRow[]>([]);
  const [isLoadingLatestTestLeaderboard, setIsLoadingLatestTestLeaderboard] = useState(false);

  const batchRef = useMemoFirebase(() => (firestore && batchId ? doc(firestore, 'live_batches', batchId) : null), [firestore, batchId]);
  const enrollmentRef = useMemoFirebase(
    () => (firestore && user?.uid && batchId ? doc(firestore, 'users', user.uid, 'enrolled_live_batches', batchId) : null),
    [firestore, user?.uid, batchId]
  );
  const examTypesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'exam_types')) : null), [firestore]);
  const classesQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'classes')) : null), [firestore]);
  const subjectsQ = useMemoFirebase(() => (firestore ? query(collection(firestore, 'subjects')) : null), [firestore]);
  const sessionsQ = useMemoFirebase(
    () => (firestore && batchId ? query(collection(firestore, 'live_batch_sessions'), where('batchId', '==', batchId)) : null),
    [firestore, batchId]
  );
  const testsQ = useMemoFirebase(
    () => (firestore && batchId ? query(collection(firestore, 'mock_tests'), where('liveBatchId', '==', batchId)) : null),
    [firestore, batchId]
  );
  const subscriptionPlansQ = useMemoFirebase(
    () =>
      firestore && batchId
        ? query(
            collection(firestore, 'subscription_plans'),
            where('linkedContentType', '==', 'live_batch'),
            where('linkedContentId', '==', batchId)
          )
        : null,
    [firestore, batchId]
  );

  const { data: batch, isLoading: batchLoading } = useDoc<LiveBatch>(batchRef);
  const { data: enrollmentRecord, isLoading: enrollmentLoading } = useDoc<EnrolledBatchRecord>(enrollmentRef);
  const { data: examTypes } = useCollection<ExamType>(examTypesQ);
  const { data: classes } = useCollection<ClassItem>(classesQ);
  const { data: subjects } = useCollection<Subject>(subjectsQ);
  const { data: sessionsData, isLoading: sessionsLoading } = useCollection<SessionItem>(sessionsQ);
  const { data: scheduledTestsData, isLoading: testsLoading } = useCollection<ScheduledBatchTest>(testsQ);
  const { data: linkedPlanData, isLoading: linkedPlanLoading } = useCollection<SubscriptionPlan>(subscriptionPlansQ);
  const sessions = sessionsData || [];
  const scheduledTests = scheduledTestsData || [];
  const isOwnerTeacher = Boolean(isTeacher && user?.uid && batch?.teacherId && user.uid === batch.teacherId);

  const todayYmd = useMemo(() => toLocalYmd(new Date()), []);
  const examNameById = useMemo(() => Object.fromEntries((examTypes || []).map((e) => [e.id, e.name])), [examTypes]);
  const classNameById = useMemo(() => Object.fromEntries((classes || []).map((c) => [c.id, c.name])), [classes]);
  const subjectNameById = useMemo(() => Object.fromEntries((subjects || []).map((s) => [s.id, s.name])), [subjects]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const keyA = `${a.date || ''} ${a.meetingTime || ''}`;
        const keyB = `${b.date || ''} ${b.meetingTime || ''}`;
        return keyA.localeCompare(keyB);
      }),
    [sessions]
  );

  const scheduleNoticesByDate = useMemo(() => {
    const byDate: Record<string, { type: 'holiday' | 'cancelled'; text: string }> = {};
    sessions.forEach((session) => {
      if (!session?.date) return;
      if (session.type === 'holiday') {
        const startDate = session.date;
        const endDate = session.holidayEndDate || session.date;
        const holidayRangeLabel = formatYmdRange(startDate, endDate);
        const holidayText = `Holiday${holidayRangeLabel !== session.date ? ` (${holidayRangeLabel})` : ''}${session.reason ? ` - ${session.reason}` : ''}`;
        expandYmdDateRange(startDate, endDate).forEach((date) => {
          byDate[date] = { type: 'holiday', text: holidayText };
        });
        return;
      }
      if (session.type === 'cancelled' && !byDate[session.date]) {
        byDate[session.date] = {
          type: 'cancelled',
          text: `Cancelled${session.sessionLabel ? ` - ${session.sessionLabel}` : ''}${session.reason ? ` (${session.reason})` : ''}`,
        };
      }
    });
    return byDate;
  }, [sessions]);

  const upcomingScheduleSlots = useMemo(() => {
    if (!batch?.subjectSchedules || batch.subjectSchedules.length === 0) return [] as UpcomingSessionSlot[];

    const windowStart = (() => {
      const today = parseYmdToLocalDate(todayYmd) || new Date();
      const batchStart = parseYmdToLocalDate(batch.batchStartDate);
      if (!batchStart) return today;
      return batchStart.getTime() > today.getTime() ? batchStart : today;
    })();

    const generated: UpcomingSessionSlot[] = [];
    for (let offset = 0; offset < UPCOMING_SLOT_WINDOW_DAYS; offset += 1) {
      const date = new Date(windowStart);
      date.setDate(windowStart.getDate() + offset);
      const dayName = DAY_NAMES[date.getDay()];
      const dateYmd = toLocalYmd(date);

      (batch.subjectSchedules || []).forEach((schedule) => {
        if (!(schedule.daysOfWeek || []).includes(dayName)) return;
        const perDayTiming = schedule.useDifferentTimingPerDay ? schedule.dayTimings?.[dayName] : undefined;
        const startTime = schedule.useDifferentTimingPerDay ? (perDayTiming?.startTime || '') : (schedule.startTime || '');
        const endTime = schedule.useDifferentTimingPerDay ? (perDayTiming?.endTime || '') : (schedule.endTime || '');
        if (!startTime) return;
        const dateNotice = scheduleNoticesByDate[dateYmd];

        generated.push({
          date: dateYmd,
          dayName,
          subjectName: subjectNameById[schedule.subjectId] || schedule.subjectId || 'Subject',
          startTime,
          endTime,
          noticeType: dateNotice?.type,
          noticeText: dateNotice?.text,
        });
      });
    }

    return generated
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
      .slice(0, 12);
  }, [batch?.batchStartDate, batch?.subjectSchedules, scheduleNoticesByDate, subjectNameById, todayYmd]);

  const upcomingMeetings = useMemo(
    () =>
      sortedSessions
        .filter((session) => session.type === 'meeting' && (session.date || '') >= todayYmd)
        .sort((a, b) => `${a.date || ''} ${a.meetingTime || ''}`.localeCompare(`${b.date || ''} ${b.meetingTime || ''}`)),
    [sortedSessions, todayYmd]
  );

  const scheduledBatchTests = useMemo(
    () =>
      scheduledTests
        .map((test) => {
          const resolved = getScheduledTestDateTime(test);
          return {
            ...test,
            resolvedDate: resolved.date,
            resolvedTime: resolved.time,
          };
        })
        .sort((a, b) => `${a.resolvedDate || ''} ${a.resolvedTime || ''}`.localeCompare(`${b.resolvedDate || ''} ${b.resolvedTime || ''}`)),
    [scheduledTests]
  ) as ResolvedScheduledBatchTest[];

  const nextUpcomingClass = useMemo(() => {
    const now = new Date();
    const candidates: NextClassCandidate[] = [];

    upcomingMeetings.forEach((meeting) => {
      const meetingDateTime = parseYmdHmToLocalDateTime(meeting.date, meeting.meetingTime);
      if (!meetingDateTime || meetingDateTime.getTime() < now.getTime()) return;
      const subjectLabel = meeting.subjectName || (meeting.subjectId ? (subjectNameById[meeting.subjectId] || meeting.subjectId) : 'All Subjects');
      candidates.push({
        dateTime: meetingDateTime,
        date: meeting.date || '',
        time: meeting.meetingTime || '',
        title: meeting.meetingTitle || 'Live Session',
        subjectLabel,
        zoomLink: meeting.zoomLink,
      });
    });

    upcomingScheduleSlots.forEach((slot) => {
      if (slot.noticeType) return;
      const slotDateTime = parseYmdHmToLocalDateTime(slot.date, slot.startTime);
      if (!slotDateTime || slotDateTime.getTime() < now.getTime()) return;
      candidates.push({
        dateTime: slotDateTime,
        date: slot.date,
        time: slot.startTime,
        title: `${slot.subjectName} Class`,
        subjectLabel: slot.subjectName,
      });
    });

    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0];
  }, [subjectNameById, upcomingMeetings, upcomingScheduleSlots]);

  const nextUpcomingTest = useMemo(() => {
    const now = new Date();
    return (
      scheduledBatchTests
        .map((test) => ({
          test,
          dateTime: parseYmdHmToLocalDateTime(test.resolvedDate, test.resolvedTime),
        }))
        .filter((item): item is { test: ResolvedScheduledBatchTest; dateTime: Date } => !!item.dateTime && item.dateTime.getTime() >= now.getTime())
        .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0] || null
    );
  }, [scheduledBatchTests]);

  const latestCompletedBatchTest = useMemo(() => {
    const nowMs = Date.now();
    return (
      scheduledBatchTests
        .map((test) => ({
          test,
          dateTime: parseYmdHmToLocalDateTime(test.resolvedDate, test.resolvedTime),
        }))
        .filter(
          (item): item is { test: ResolvedScheduledBatchTest; dateTime: Date } =>
            !!item.dateTime && item.dateTime.getTime() <= nowMs && item.test.publicationStatus !== 'draft'
        )
        .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())[0]?.test || null
    );
  }, [scheduledBatchTests]);

  const nextClassroomSession = useMemo(() => {
    const candidates: Array<
      | { kind: 'meeting'; dateTime: Date; classItem: NextClassCandidate }
      | { kind: 'test'; dateTime: Date; test: ResolvedScheduledBatchTest }
    > = [];

    if (nextUpcomingClass) {
      candidates.push({ kind: 'meeting', dateTime: nextUpcomingClass.dateTime, classItem: nextUpcomingClass });
    }
    if (nextUpcomingTest) {
      candidates.push({ kind: 'test', dateTime: nextUpcomingTest.dateTime, test: nextUpcomingTest.test });
    }
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0];
  }, [nextUpcomingClass, nextUpcomingTest]);

  const linkedLiveBatchPlan = useMemo(() => {
    const plans = linkedPlanData || [];
    if (plans.length === 0) return null;
    if (batch?.teacherId) {
      const teacherPlan = plans.find((plan) => !plan.createdByTeacherId || plan.createdByTeacherId === batch.teacherId);
      if (teacherPlan) return teacherPlan;
    }
    return plans[0];
  }, [linkedPlanData, batch?.teacherId]);

  const totalSessionsInBatch = Math.max(
    0,
    Number(batch?.totalSessions ?? linkedLiveBatchPlan?.totalSessions ?? linkedLiveBatchPlan?.numberOfLiveClasses ?? 0)
  );
  const perSessionFee = Math.max(
    0,
    Number(linkedLiveBatchPlan?.sessionFee ?? linkedLiveBatchPlan?.price ?? 0)
  );

  const normalizedRequestedSessions = Math.max(1, Math.floor(Number(requestedSessionsForPurchase || 1)));

  const liveBatchSessionCoverage = useMemo(
    () => calculateLiveBatchSessionCoverage({
      sessions: sortedSessions,
      enrollment: enrollmentRecord
        ? {
            paidAt: enrollmentRecord.paidAt,
            enrolledAt: enrollmentRecord.enrolledAt,
            sessionsPurchased: enrollmentRecord.sessionsPurchased,
            sessionPurchaseHistory: enrollmentRecord.sessionPurchaseHistory,
          }
        : null,
    }),
    [
      enrollmentRecord?.enrolledAt,
      enrollmentRecord?.paidAt,
      enrollmentRecord?.sessionPurchaseHistory,
      enrollmentRecord?.sessionsPurchased,
      sortedSessions,
    ]
  );
  const purchasedSessions = liveBatchSessionCoverage.totalPurchasedSessions;
  const remainingPaidSessions = liveBatchSessionCoverage.remainingSessions;
  const consumedPaidSessions = liveBatchSessionCoverage.consumedSessions;
  const sessionTrackingStartLabel = liveBatchSessionCoverage.firstPurchaseAt
    ? formatYmdForDisplay(toLocalYmd(liveBatchSessionCoverage.firstPurchaseAt))
    : 'N/A';
  const recentConductedMeetings = useMemo(() => {
    return [...liveBatchSessionCoverage.coveredConductedMeetings]
      .slice(-8)
      .reverse()
      .map((meeting) => {
        const matchedSession = sortedSessions.find((session) =>
          session.type === 'meeting' &&
          session.date === meeting.date &&
          (session.meetingTime || '') === (meeting.meetingTime || '')
        );
        return {
          meeting,
          session: matchedSession || null,
        };
      });
  }, [liveBatchSessionCoverage.coveredConductedMeetings, sortedSessions]);
  const conductedMeetingsInBatch = useMemo(() => {
    const nowTime = Date.now();
    return sortedSessions
      .filter((session) => session.type === 'meeting')
      .map((session) => parseYmdHmToLocalDateTime(session.date, session.meetingTime))
      .filter((dateTime): dateTime is Date => !!dateTime && dateTime.getTime() <= nowTime).length;
  }, [sortedSessions]);
  const batchRemainingSessions = totalSessionsInBatch > 0
    ? Math.max(0, totalSessionsInBatch - conductedMeetingsInBatch)
    : 0;
  const maxPurchasableSessions = totalSessionsInBatch > 0 ? batchRemainingSessions : 0;
  const isEnrolledForAccess = Boolean(hasEnrolledNow || enrollmentRecord);
  const hasClassroomAccessForViewer = Boolean(
    isTeacher
    || (batch?.accessLevel === 'free' && isEnrolledForAccess)
    || (batch?.accessLevel === 'paid' && isEnrolledForAccess && remainingPaidSessions > 0)
  );

  useEffect(() => {
    setRequestedSessionsForPurchase((current) => {
      const cappedMax = maxPurchasableSessions > 0 ? maxPurchasableSessions : 1;
      return Math.max(1, Math.min(current, cappedMax));
    });
  }, [maxPurchasableSessions]);

  const invalidRequestedSessionMessage = useMemo(() => {
    if (totalSessionsInBatch <= 0) {
      return 'This live batch does not have total sessions configured yet. Please contact the teacher.';
    }
    if (maxPurchasableSessions <= 0) {
      return 'No sessions are left in this batch to purchase.';
    }
    if (normalizedRequestedSessions > maxPurchasableSessions) {
      return `Invalid input: you requested ${normalizedRequestedSessions} sessions, but only ${maxPurchasableSessions} sessions are left in this batch.`;
    }
    return '';
  }, [maxPurchasableSessions, normalizedRequestedSessions, totalSessionsInBatch]);
  const payableAmountForSelection = Number((normalizedRequestedSessions * perSessionFee).toFixed(2));

  const getMeetingSubjectLabel = (session: SessionItem) => {
    if (session.subjectName) return session.subjectName;
    if (session.subjectId && subjectNameById[session.subjectId]) return subjectNameById[session.subjectId];
    return 'All Subjects';
  };

  const previousSessionUploads = useMemo(
    () =>
      sortedSessions
        .filter((session) => session.type === 'previous_session')
        .sort((a, b) => `${b.date || ''} ${b.meetingTime || ''}`.localeCompare(`${a.date || ''} ${a.meetingTime || ''}`)),
    [sortedSessions]
  );
  const previousSessionTimeline = useMemo(
    () =>
      sortedSessions
        .filter((session) => session.type === 'previous_session' && Boolean(session.date))
        .sort((a, b) => `${b.date || ''} ${b.meetingTime || ''}`.localeCompare(`${a.date || ''} ${a.meetingTime || ''}`))
        .slice(0, 20),
    [sortedSessions]
  );
  const canAccessPreviousSessionByCoverage = (session: SessionItem) => {
    if (isTeacher || !isPaidBatch || !isEnrolled) return true;
    if (!session?.date) return false;
    if (liveBatchSessionCoverage.purchases.length === 0) return false;

    const meetingTimeMinutes = toMinutes(session.meetingTime);
    if (meetingTimeMinutes !== null) {
      const coveredSameSlot = liveBatchSessionCoverage.coveredConductedMeetings.some((meeting) =>
        meeting.date === session.date && toMinutes(meeting.meetingTime) === meetingTimeMinutes
      );
      if (coveredSameSlot) return true;
    }

    return liveBatchSessionCoverage.coveredMeetingDateKeys.has(session.date);
  };

  const getTestAccessEndAt = (test: ResolvedScheduledBatchTest) => {
    const explicitEndAt = asDate(test.accessWindowEndAt);
    if (explicitEndAt) return explicitEndAt;
    const fallbackTime = test.accessEndTime || test.resolvedTime;
    return parseYmdHmToLocalDateTime(test.resolvedDate, fallbackTime);
  };

  const classroomLeaderboardRankGroups = useMemo(() => {
    const grouped = new Map<number, ClassroomLeaderboardRankGroup>();
    latestTestLeaderboardRows.forEach((row) => {
      const existing = grouped.get(row.rank);
      if (existing) {
        existing.entries.push(row);
        return;
      }
      grouped.set(row.rank, {
        rank: row.rank,
        score: row.bestScore,
        entries: [row],
      });
    });
    return Array.from(grouped.values()).sort((a, b) => a.rank - b.rank);
  }, [latestTestLeaderboardRows]);

  useEffect(() => {
    let cancelled = false;
    const loadLatestTestLeaderboard = async () => {
      if (!firestore || !classroomOnly || !hasClassroomAccessForViewer || !latestCompletedBatchTest?.id) {
        if (!cancelled) {
          setLatestTestLeaderboardRows([]);
          setIsLoadingLatestTestLeaderboard(false);
        }
        return;
      }

      setIsLoadingLatestTestLeaderboard(true);
      try {
        const analyticsSnap = await getDoc(doc(firestore, 'test_analytics', latestCompletedBatchTest.id));
        const analytics = analyticsSnap.exists() ? (analyticsSnap.data() as TestAnalyticsDoc) : null;
        const source = Array.isArray(analytics?.attemptHistory) ? analytics.attemptHistory : [];
        const byStudent = new Map<
          string,
          Omit<ClassroomLeaderboardRow, 'rank'> & {
            bestAttemptAtMs: number;
          }
        >();

        source.forEach((item) => {
          const studentKey = String(item.studentId || item.studentName || 'student');
          const studentName = item.studentName || 'Student';
          const score = Number(item.score || 0);
          const timeTaken = Number(item.timeTaken || 0);
          const attemptAt = asDate(item.submittedAt as any) || null;
          const attemptAtMs = attemptAt ? attemptAt.getTime() : 0;
          const existing = byStudent.get(studentKey);
          if (!existing) {
            byStudent.set(studentKey, {
              studentId: item.studentId || '',
              studentName,
              bestScore: score,
              bestTime: timeTaken,
              attempts: 1,
              lastAttemptAt: attemptAt,
              bestAttemptAtMs: attemptAtMs,
            });
            return;
          }

          const betterScore = score > existing.bestScore;
          const sameScoreBetterTime = score === existing.bestScore && timeTaken < existing.bestTime;
          const betterAttemptForTie = score === existing.bestScore && timeTaken === existing.bestTime && attemptAtMs > existing.bestAttemptAtMs;

          byStudent.set(studentKey, {
            studentId: existing.studentId || item.studentId || '',
            studentName: existing.studentName || studentName,
            bestScore: betterScore ? score : existing.bestScore,
            bestTime: betterScore || sameScoreBetterTime ? timeTaken : existing.bestTime,
            attempts: existing.attempts + 1,
            lastAttemptAt:
              attemptAt && (!existing.lastAttemptAt || attemptAt.getTime() > existing.lastAttemptAt.getTime())
                ? attemptAt
                : existing.lastAttemptAt,
            bestAttemptAtMs:
              betterScore || sameScoreBetterTime || betterAttemptForTie
                ? attemptAtMs
                : existing.bestAttemptAtMs,
          });
        });

        const sortedRows = Array.from(byStudent.values())
          .sort((a, b) => {
            if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
            if (a.bestTime !== b.bestTime) return a.bestTime - b.bestTime;
            return b.bestAttemptAtMs - a.bestAttemptAtMs;
          })
          .slice(0, 30);

        let rankCounter = 0;
        let previousScore: number | null = null;
        const withRank: ClassroomLeaderboardRow[] = sortedRows.map((row, index) => {
          if (previousScore === null || row.bestScore !== previousScore) {
            rankCounter = index + 1;
            previousScore = row.bestScore;
          }
          return {
            studentId: row.studentId,
            studentName: row.studentName,
            bestScore: row.bestScore,
            bestTime: row.bestTime,
            attempts: row.attempts,
            lastAttemptAt: row.lastAttemptAt,
            rank: rankCounter,
          };
        });

        if (!cancelled) {
          setLatestTestLeaderboardRows(withRank);
        }
      } catch {
        if (!cancelled) {
          setLatestTestLeaderboardRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLatestTestLeaderboard(false);
        }
      }
    };

    loadLatestTestLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [classroomOnly, firestore, hasClassroomAccessForViewer, latestCompletedBatchTest?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadTestResults = async () => {
      if (!firestore || !isOwnerTeacher || !showTeacherActivity) {
        if (!cancelled) {
          setTestResultsById({});
          setIsLoadingTestResults(false);
        }
        return;
      }

      const testIds = scheduledBatchTests.map((test) => test.id).filter(Boolean);
      if (testIds.length === 0) {
        if (!cancelled) {
          setTestResultsById({});
          setIsLoadingTestResults(false);
        }
        return;
      }

      setIsLoadingTestResults(true);
      try {
        const entries = await Promise.all(
          testIds.map(async (testId) => {
            try {
              const analyticsSnap = await getDoc(doc(firestore, 'test_analytics', testId));
              const analytics = analyticsSnap.exists() ? (analyticsSnap.data() as TestAnalyticsDoc) : null;
              const history = Array.isArray(analytics?.attemptHistory) ? analytics?.attemptHistory || [] : [];
              const studentIdSet = new Set<string>();
              let bestScore: number | null = null;
              let lastAttemptAt: Date | null = null;

              history.forEach((entry) => {
                if (entry?.studentId) studentIdSet.add(entry.studentId);
                const parsedScore = Number(entry?.score);
                if (Number.isFinite(parsedScore)) {
                  bestScore = bestScore === null ? parsedScore : Math.max(bestScore, parsedScore);
                }
                const submittedAt = asDate(entry?.submittedAt as any);
                if (submittedAt && (!lastAttemptAt || submittedAt.getTime() > lastAttemptAt.getTime())) {
                  lastAttemptAt = submittedAt;
                }
              });

              return [
                testId,
                {
                  attempts: history.length,
                  uniqueStudents: studentIdSet.size,
                  bestScore,
                  lastAttemptAt,
                } as TestResultSummary,
              ] as const;
            } catch {
              return [
                testId,
                {
                  attempts: 0,
                  uniqueStudents: 0,
                  bestScore: null,
                  lastAttemptAt: null,
                } as TestResultSummary,
              ] as const;
            }
          })
        );

        if (!cancelled) {
          setTestResultsById(Object.fromEntries(entries));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTestResults(false);
        }
      }
    };

    loadTestResults();
    return () => {
      cancelled = true;
    };
  }, [firestore, isOwnerTeacher, scheduledBatchTests, showTeacherActivity]);

  const handleEnroll = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!firestore || !batchId || !batch) return;

    setIsEnrolling(true);
    try {
      await setDocumentNonBlocking(
        doc(firestore, 'users', user.uid, 'enrolled_live_batches', batchId),
        {
          batchId,
          title: batch.title || 'Live Batch',
          teacherId: batch.teacherId || '',
          teacherName: batch.teacherName || '',
          accessLevel: batch.accessLevel || 'free',
          enrolledAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setHasEnrolledNow(true);
      toast({ title: 'Enrolled successfully', description: 'You can now enter the classroom and track sessions.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Enroll failed', description: error?.message || 'Could not enroll right now.' });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handlePaidCheckout = () => {
    if (!batchId) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!linkedLiveBatchPlan?.id) {
      toast({
        variant: 'destructive',
        title: 'Plan not available',
        description: 'No subscription plan is attached to this batch yet. Please try again later.',
      });
      return;
    }
    if (perSessionFee <= 0) {
      toast({
        variant: 'destructive',
        title: 'Fee not configured',
        description: 'Per-session fee is not configured for this batch yet.',
      });
      return;
    }
    if (invalidRequestedSessionMessage) {
      toast({
        variant: 'destructive',
        title: 'Invalid session count',
        description: invalidRequestedSessionMessage,
      });
      return;
    }

    router.push(`/checkout/${linkedLiveBatchPlan.id}?sessions=${normalizedRequestedSessions}`);
  };

  const openClassroomHubPage = () => {
    const paidAccessBlocked = batch?.accessLevel === 'paid' && !isTeacher && remainingPaidSessions <= 0;
    if (!batchId || paidAccessBlocked) return;
    router.push(`/live-batches/${batchId}/classroom`);
  };

  const openTeacherActivityPanel = () => {
    setShowTeacherActivity(true);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById('teacher-activity-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  if (batchLoading) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Classroom Details" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Skeleton className="h-72 w-full" />
        </main>
      </div>
    );
  }

  if (!batch || batch.publicationStatus === 'draft' || batch.publicationStatus === 'deleted') {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Classroom Details" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Card>
            <CardContent className="p-6 text-muted-foreground">Classroom not found or not published.</CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isFree = batch.accessLevel === 'free';
  const isPaidBatch = batch.accessLevel === 'paid';
  const isEnrolled = isEnrolledForAccess;
  const canAccessClassroomHub = hasClassroomAccessForViewer;
  const isPaidSessionLocked = Boolean(!isTeacher && isPaidBatch && isEnrolled && remainingPaidSessions <= 0);
  const subjectNames = (batch.subjectIds || []).map((id) => subjectNameById[id]).filter(Boolean);
  const explanationEmbedUrl = getYoutubeEmbedUrl(batch.explanationVideoUrl);
  const startDate = asDate(batch.batchStartDate);
  const classroomLoading = sessionsLoading || testsLoading || (isPaidBatch && linkedPlanLoading);
  const heroPrimaryButtonClass = 'h-11 rounded-full border border-cyan-200/40 bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 px-6 font-semibold text-slate-950 shadow-[0_14px_32px_-18px_rgba(56,189,248,0.95)] transition-all duration-300 hover:-translate-y-0.5 hover:from-cyan-200 hover:via-sky-200 hover:to-blue-200 hover:shadow-[0_18px_38px_-18px_rgba(56,189,248,1)] focus-visible:ring-cyan-300/70';
  const heroSecondaryButtonClass = 'h-11 rounded-full border border-slate-500/45 bg-slate-900/55 px-6 font-semibold text-slate-100 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300/60 hover:bg-slate-800/80 hover:text-white';
  const heroPayButtonClass = 'h-11 rounded-full border border-emerald-200/45 bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 px-6 font-semibold text-slate-950 shadow-[0_14px_32px_-18px_rgba(16,185,129,0.95)] transition-all duration-300 hover:-translate-y-0.5 hover:from-emerald-200 hover:via-teal-200 hover:to-cyan-200 hover:shadow-[0_18px_38px_-18px_rgba(16,185,129,1)] focus-visible:ring-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-60';
  const subjectTimingCards = (() => {
    const schedules = batch.subjectSchedules || [];

    return schedules
      .map((schedule, index) => {
        const activeDays = DAY_NAMES.filter((dayName) => (schedule.daysOfWeek || []).includes(dayName));
        const dayRows: SubjectTimingRow[] = [];
        activeDays.forEach((dayName) => {
          const daySpecificTiming = schedule.useDifferentTimingPerDay ? schedule.dayTimings?.[dayName] : undefined;
          const startTime = schedule.useDifferentTimingPerDay ? (daySpecificTiming?.startTime || '') : (schedule.startTime || '');
          const endTime = schedule.useDifferentTimingPerDay ? (daySpecificTiming?.endTime || '') : (schedule.endTime || '');
          if (!startTime) return;
          dayRows.push({
            dayName,
            dayShort: dayName.slice(0, 3),
            startTime,
            endTime,
          });
        });

        const startMinutes = dayRows.map((row) => toMinutes(row.startTime)).filter((value): value is number => value !== null);
        const endMinutes = dayRows
          .map((row) => toMinutes(row.endTime || row.startTime))
          .filter((value): value is number => value !== null);

        const firstStartMinute = startMinutes.length > 0 ? Math.min(...startMinutes) : null;
        const lastEndMinute = endMinutes.length > 0 ? Math.max(...endMinutes) : null;

        return {
          key: `${schedule.subjectId || 'subject'}-${index}`,
          subjectName: subjectNameById[schedule.subjectId] || schedule.subjectId || `Subject ${index + 1}`,
          slotsPerWeek: dayRows.length,
          daysLabel: dayRows.length > 0 ? dayRows.map((row) => row.dayShort).join(' / ') : 'No day selected',
          startsAtLabel: firstStartMinute === null ? 'TBA' : formatMinutesForDisplay(firstStartMinute),
          endsAtLabel: lastEndMinute === null ? 'TBA' : formatMinutesForDisplay(lastEndMinute),
          usesDayWiseTiming: Boolean(schedule.useDifferentTimingPerDay),
          dayRows,
        };
      })
      .filter((card) => card.dayRows.length > 0);
  })();

  const weeklyTimingSummary = (() => {
    const activeDaySet = new Set<string>();
    let totalSlots = 0;

    subjectTimingCards.forEach((card) => {
      totalSlots += card.slotsPerWeek;
      card.dayRows.forEach((row) => activeDaySet.add(row.dayName));
    });

    return {
      subjectCount: subjectTimingCards.length,
      activeDays: activeDaySet.size,
      totalSlots,
    };
  })();

  if (classroomOnly) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Classroom Details" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-slate-950/90 via-blue-950/45 to-slate-900/90">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  Next Upcoming Session or Test
                </CardTitle>
                <CardDescription>
                  Stay focused with your nearest schedule item and follow the latest classroom activity.
                </CardDescription>
              </CardHeader>
            <CardContent className="pt-4">
              {!canAccessClassroomHub ? (
                isPaidBatch ? (
                  <div className="rounded-xl border border-dashed border-cyan-300/30 bg-cyan-500/5 p-5 space-y-3">
                    <p className="text-sm font-medium">
                      {isEnrolled
                        ? 'Your paid sessions are exhausted. Buy more sessions to unlock classroom access.'
                        : 'Select sessions to unlock classroom timeline.'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      One session means one live meeting. Tests are not counted in session usage.
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Per Session Fee</p>
                        <p className="text-sm font-semibold">INR {perSessionFee.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sessions Left in Batch</p>
                        <p className="text-sm font-semibold">{totalSessionsInBatch > 0 ? batchRemainingSessions : 'Not set'}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="classroom-session-count" className="text-sm font-medium">Number of Sessions</label>
                      <Input
                        id="classroom-session-count"
                        type="number"
                        min={1}
                        max={Math.max(maxPurchasableSessions, 1)}
                        step={1}
                        value={normalizedRequestedSessions}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (!Number.isFinite(parsed)) {
                            setRequestedSessionsForPurchase(1);
                            return;
                          }
                          const cappedMax = maxPurchasableSessions > 0 ? maxPurchasableSessions : 1;
                          setRequestedSessionsForPurchase(Math.max(1, Math.min(Math.floor(parsed), cappedMax)));
                        }}
                      />
                      {!linkedLiveBatchPlan?.id ? (
                        <p className="text-xs text-amber-300">
                          Subscription plan is not attached yet. Please ask the teacher to attach a plan for this batch.
                        </p>
                      ) : invalidRequestedSessionMessage ? (
                        <p className="text-xs text-destructive">{invalidRequestedSessionMessage}</p>
                      ) : (
                        <p className="text-xs text-emerald-400">
                          Payable amount = {normalizedRequestedSessions} x INR {perSessionFee.toLocaleString()} = INR {payableAmountForSelection.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handlePaidCheckout}
                      disabled={!linkedLiveBatchPlan?.id || perSessionFee <= 0 || !!invalidRequestedSessionMessage}
                      className={heroPayButtonClass}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      {isEnrolled ? 'Pay for More Sessions' : 'Pay and Unlock Classroom'}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-cyan-300/30 bg-cyan-500/5 p-5">
                    <p className="text-sm font-medium">Enroll to unlock classroom timeline.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Once enrolled, you can view the next class or test scheduled for this batch.
                    </p>
                    <Button onClick={handleEnroll} disabled={isEnrolling} className="mt-3 rounded-full">
                      {isEnrolling ? 'Enrolling...' : 'Enroll in Class'}
                    </Button>
                  </div>
                )
              ) : classroomLoading ? (
                <div className="grid grid-cols-1 gap-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !nextClassroomSession ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No upcoming meeting or test is scheduled yet.
                </div>
              ) : nextClassroomSession.kind === 'meeting' ? (
                <div className="flex flex-col gap-3 rounded-xl border border-cyan-300/25 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-cyan-200">Meeting</p>
                    <p className="text-sm font-semibold">{nextClassroomSession.classItem.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatYmdForDisplay(nextClassroomSession.classItem.date)} - {formatTimeForDisplay(nextClassroomSession.classItem.time)}
                    </p>
                    <p className="text-xs text-cyan-100">Subject: {nextClassroomSession.classItem.subjectLabel}</p>
                  </div>
                  {nextClassroomSession.classItem.zoomLink ? (
                    <Button asChild size="sm" className="rounded-full">
                      <Link href={nextClassroomSession.classItem.zoomLink} target="_blank">
                        <Video className="mr-1.5 h-3.5 w-3.5" />
                        Join Class
                      </Link>
                    </Button>
                  ) : (
                    <Badge variant="outline" className="w-fit border-border/70 bg-muted/20 text-muted-foreground">
                      Link will be shared soon
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-300/25 bg-emerald-500/5 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-200">Test</p>
                    <p className="text-sm font-semibold">{nextClassroomSession.test.title || 'Live Batch Test'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatYmdForDisplay(nextClassroomSession.test.resolvedDate)} - {formatTimeForDisplay(nextClassroomSession.test.resolvedTime)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {nextClassroomSession.test.publicationStatus === 'draft' ? (
                      <Badge className="border-amber-300/35 bg-amber-500/20 text-amber-100">Draft</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-300/35 bg-emerald-500/10 text-emerald-100">Scheduled</Badge>
                    )}
                    <Button asChild size="sm" variant="outline" className="rounded-full">
                      <Link href={`/mock-tests/${nextClassroomSession.test.id}`}>
                        <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                        Open Test
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {canAccessClassroomHub ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card className="border-border/70 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-blue-950/50">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="inline-flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4 text-amber-300" />
                    Leaderboard (Latest Test)
                  </CardTitle>
                  <CardDescription>
                    Ranked by latest completed batch test result. Same score shares the same rank.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {latestCompletedBatchTest ? (
                    <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{latestCompletedBatchTest.title || 'Live Batch Test'}</p>
                      <p className="mt-1">
                        {formatYmdForDisplay(latestCompletedBatchTest.resolvedDate)} - {formatTimeForDisplay(latestCompletedBatchTest.resolvedTime)}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
                      Leaderboard will appear after the first completed test.
                    </div>
                  )}
                  {isLoadingLatestTestLeaderboard || classroomLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : latestCompletedBatchTest && classroomLeaderboardRankGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attempts submitted yet for the latest test.</p>
                  ) : (
                    <div className="space-y-2">
                      {classroomLeaderboardRankGroups.map((group) => (
                        <div key={`rank-${group.rank}`} className="rounded-lg border border-border/60 bg-background/40 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="outline" className="border-cyan-300/35 bg-cyan-500/10 text-cyan-100">
                              Rank #{group.rank}
                            </Badge>
                            <p className="text-xs text-muted-foreground">Score: {group.score}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.entries.map((entry, entryIndex) => (
                              <div key={`${group.rank}-${entry.studentId || entry.studentName}-${entryIndex}`} className="min-w-[170px] rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                                <p className="text-sm font-medium">{entry.studentName || 'Student'}</p>
                                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                                  <p>Score: <span className="font-semibold text-foreground">{entry.bestScore}</span></p>
                                  <p className="inline-flex items-center gap-1">
                                    <Clock3 className="h-3 w-3" />
                                    Time: {entry.bestTime > 0 ? `${entry.bestTime}s` : 'N/A'}
                                  </p>
                                  <p>Attempts: {entry.attempts}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-indigo-950/50">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="inline-flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-indigo-200" />
                    Previous Sessions by Date
                  </CardTitle>
                  <CardDescription>
                    Uploaded previous sessions are indexed by date of occurrence.
                  </CardDescription>
                  {!isTeacher && isPaidBatch ? (
                    <p className="text-xs text-amber-200/90">
                      Only the dates covered by your active paid-session history are unlocked.
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-4">
                  {classroomLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </div>
                  ) : previousSessionTimeline.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
                      No previous session upload available yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {previousSessionTimeline.map((session, index) => {
                        const canOpenSession = canAccessPreviousSessionByCoverage(session);
                        return (
                          <div key={`previous-${session.id}`} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                #{index + 1} {session.sessionLabel || 'Previous Session'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatYmdForDisplay(session.date)}{session.meetingTime ? ` - ${formatTimeForDisplay(session.meetingTime)}` : ''}
                              </p>
                            </div>
                            {session.previousSessionUrl ? (
                              canOpenSession ? (
                                <Button asChild size="sm" variant="outline" className="rounded-full">
                                  <Link href={session.previousSessionUrl} target="_blank">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    Open Session
                                  </Link>
                                </Button>
                              ) : (
                                <Badge variant="outline" className="w-fit border-rose-300/40 bg-rose-500/10 text-rose-100">
                                  <Lock className="mr-1 h-3.5 w-3.5" />
                                  Locked (No active session pass on this date)
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="w-fit border-border/70 bg-muted/20 text-muted-foreground">
                                Link not added
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
          {!isTeacher && isPaidBatch && isEnrolled ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Session Usage and Coverage</CardTitle>
                <CardDescription>
                  Meeting sessions are counted only when your paid coverage was active. Tests are excluded.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Purchased</p>
                  <p className="text-lg font-semibold">{purchasedSessions}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Consumed by Conducted Meetings</p>
                  <p className="text-lg font-semibold">{consumedPaidSessions}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-lg font-semibold">{remainingPaidSessions}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Batch Sessions Left</p>
                  <p className="text-lg font-semibold">{totalSessionsInBatch > 0 ? batchRemainingSessions : 'N/A'}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Classroom Details" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        {!classroomOnly ? (
          <>
            <Card className="overflow-hidden border-border/70 bg-gradient-to-r from-slate-900/80 via-blue-950/60 to-slate-900/80">
              <CardContent className="p-0">
                {batch.thumbnailUrl ? (
                  <div className="h-52 w-full">
                    <img src={batch.thumbnailUrl} alt={batch.title || 'Classroom'} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-2xl font-semibold">{batch.title || 'Live Classroom'}</h2>
                    <Badge className={isFree ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100' : 'border-red-400/60 bg-red-500/20 text-red-100'}>
                      {isFree ? 'Free Batch' : 'Paid Batch'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <p className="inline-flex items-center gap-2"><User2 className="h-4 w-4" />Teacher: {batch.teacherName || 'N/A'}</p>
                    <p className="inline-flex items-center gap-2"><GraduationCap className="h-4 w-4" />{examNameById[batch.examTypeId || ''] || 'Exam'} - {classNameById[batch.classId || ''] || 'Curriculum'}</p>
                    {startDate ? (
                      <p className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />Batch starts on: {startDate.toLocaleDateString()}</p>
                    ) : null}
                    <p className="inline-flex items-center gap-2">
                      <ListChecks className="h-4 w-4" />
                      Batch sessions left: {totalSessionsInBatch > 0 ? `${batchRemainingSessions} / ${totalSessionsInBatch}` : 'Not set'}
                    </p>
                    <p className="inline-flex items-center gap-2 md:col-span-2"><BookOpenCheck className="h-4 w-4" />Subjects Taught: {subjectNames.join(', ') || 'N/A'}</p>
                  </div>
                  {!isTeacher ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {isEnrolled ? (
                          <>
                            <Button onClick={openClassroomHubPage} disabled={isPaidSessionLocked} className={heroPrimaryButtonClass}>
                              {isPaidSessionLocked ? 'Enter Classroom (Locked)' : 'Enter Classroom'}
                            </Button>
                            {!isFree && !enrollmentRecord ? (
                              <Button asChild variant="outline" className={heroSecondaryButtonClass}>
                                <Link href="/my-batch">View in My Batch</Link>
                              </Button>
                            ) : null}
                          </>
                        ) : isFree ? (
                          <Button
                            onClick={handleEnroll}
                            disabled={isEnrolling || (!!user && enrollmentLoading)}
                            className={heroPrimaryButtonClass}
                          >
                            {isEnrolling ? 'Enrolling...' : (!!user && enrollmentLoading) ? 'Checking enrollment...' : 'Enroll in Class'}
                          </Button>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Select sessions below to pay and unlock classroom access.
                          </p>
                        )}
                      </div>
                      {isPaidSessionLocked ? (
                        <p className="text-xs text-amber-300">
                          Your paid sessions are exhausted. Buy more sessions to unlock classroom access and scheduled tests.
                        </p>
                      ) : null}

                      {!isFree && (!isEnrolled || isPaidSessionLocked) ? (
                        <div className="rounded-lg border border-border/60 bg-black/20 p-3 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <p>Per session fee: <span className="font-semibold">INR {perSessionFee.toLocaleString()}</span></p>
                            <p>Sessions left in batch: <span className="font-semibold">{totalSessionsInBatch > 0 ? batchRemainingSessions : 'Not set'}</span></p>
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="hero-session-count" className="text-xs text-muted-foreground">Select sessions you want to buy</label>
                            <Input
                              id="hero-session-count"
                              type="number"
                              min={1}
                              max={Math.max(maxPurchasableSessions, 1)}
                              step={1}
                              value={normalizedRequestedSessions}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (!Number.isFinite(parsed)) {
                                  setRequestedSessionsForPurchase(1);
                                  return;
                                }
                                const cappedMax = maxPurchasableSessions > 0 ? maxPurchasableSessions : 1;
                                setRequestedSessionsForPurchase(Math.max(1, Math.min(Math.floor(parsed), cappedMax)));
                              }}
                              className="max-w-xs"
                            />
                          </div>
                          {!linkedLiveBatchPlan?.id ? (
                            <p className="text-xs text-amber-300">
                              Subscription plan is not attached yet. Please ask the teacher to attach a plan for this batch.
                            </p>
                          ) : invalidRequestedSessionMessage ? (
                            <p className="text-xs text-destructive">{invalidRequestedSessionMessage}</p>
                          ) : (
                            <p className="text-xs text-emerald-300">
                              Payable amount = {normalizedRequestedSessions} x INR {perSessionFee.toLocaleString()} = INR {payableAmountForSelection.toLocaleString()}
                            </p>
                          )}
                          <Button
                            onClick={handlePaidCheckout}
                            disabled={!linkedLiveBatchPlan?.id || perSessionFee <= 0 || !!invalidRequestedSessionMessage}
                            className={`${heroPayButtonClass} h-10 px-5`}
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            {isEnrolled ? 'Pay for More Sessions' : 'Pay and Unlock Classroom'}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            One session means one live meeting. Mock tests do not reduce your session count.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {isOwnerTeacher ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={openTeacherActivityPanel} className={heroPrimaryButtonClass}>
                        <Activity className="mr-2 h-4 w-4" />
                        See Activity
                      </Button>
                      <Button asChild variant="outline" className={heroSecondaryButtonClass}>
                        <Link href={`/live-batches/${batchId}/students`}>
                          <Users className="mr-2 h-4 w-4" />
                          Manage Students
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className={heroSecondaryButtonClass}>
                        <Link href={`/live-batches/schedule/${batchId}`}>
                          <ListChecks className="mr-2 h-4 w-4" />
                          Manage Schedule
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {!isTeacher && isPaidBatch && isEnrolled ? (
            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Your Paid Session Tracker</CardTitle>
                <CardDescription>
                  Meeting sessions are counted only on dates/times covered by your paid purchases. Mock tests are excluded.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Purchased Sessions</p>
                      <p className="text-lg font-semibold">{purchasedSessions}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Covered Meetings Since {sessionTrackingStartLabel}</p>
                    <p className="text-lg font-semibold">{consumedPaidSessions}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Remaining Sessions</p>
                    <p className="text-lg font-semibold">{remainingPaidSessions}</p>
                  </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Batch Sessions Left</p>
                      <p className="text-lg font-semibold">{totalSessionsInBatch > 0 ? batchRemainingSessions : 'N/A'}</p>
                    </div>
                  </div>
                  {recentConductedMeetings.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Recent Conducted Meetings</p>
                      <div className="space-y-2">
                        {recentConductedMeetings.map((item) => (
                          <div key={`covered-${item.meeting.id}`} className="rounded-md border border-border/60 bg-muted/10 p-2 text-sm">
                            <p className="font-medium">{item.session?.meetingTitle || 'Live Session'}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatYmdForDisplay(item.meeting.date)} - {formatTimeForDisplay(item.meeting.meetingTime)} - {item.session ? getMeetingSubjectLabel(item.session) : 'Subject'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No covered meeting has been consumed yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {isOwnerTeacher && showTeacherActivity ? (
              <Card id="teacher-activity-panel" className="border-border/70 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-blue-950/50 shadow-xl">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="inline-flex items-center gap-2">
                        <Activity className="h-4 w-4 text-cyan-300" />
                        Classroom Activity
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Upcoming meetings, uploaded session links, scheduled tests, and result insights for your batch.
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowTeacherActivity(false)}>
                      Hide Activity
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/70 bg-background/30 p-4 space-y-3">
                      <p className="text-sm font-semibold">Upcoming Meetings</p>
                      {upcomingMeetings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
                      ) : (
                        <div className="space-y-2">
                          {upcomingMeetings.slice(0, 10).map((meeting) => (
                            <div key={meeting.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                              <p className="text-sm font-medium">{meeting.meetingTitle || 'Live Session'}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatYmdForDisplay(meeting.date)} - {formatTimeForDisplay(meeting.meetingTime)} - {getMeetingSubjectLabel(meeting)}
                              </p>
                              {meeting.zoomLink ? (
                                <Button asChild size="sm" variant="outline" className="mt-2 rounded-full">
                                  <Link href={meeting.zoomLink} target="_blank">
                                    <Video className="mr-1.5 h-3.5 w-3.5" />
                                    Open Meeting Link
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4 space-y-3">
                      <p className="text-sm font-semibold">Previous Session Uploads</p>
                      {previousSessionUploads.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No previous-session links uploaded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {previousSessionUploads.slice(0, 10).map((session) => (
                            <div key={session.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                              <p className="text-sm font-medium">{session.sessionLabel || 'Previous Session'}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatYmdForDisplay(session.date)}
                              </p>
                              {session.previousSessionUrl ? (
                                <Button asChild size="sm" variant="outline" className="mt-2 rounded-full">
                                  <Link href={session.previousSessionUrl} target="_blank">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    Open Uploaded Link
                                  </Link>
                                </Button>
                              ) : (
                                <p className="text-xs text-muted-foreground mt-2">No URL attached.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4 space-y-3">
                      <p className="text-sm font-semibold">Scheduled Tests</p>
                      {scheduledBatchTests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No live-batch tests scheduled yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {scheduledBatchTests.slice(0, 12).map((test) => (
                            <div key={test.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{test.title || 'Live Batch Test'}</p>
                                {test.publicationStatus === 'draft' ? (
                                  <Badge className="border-amber-300/35 bg-amber-500/20 text-amber-100">Draft</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-emerald-300/35 bg-emerald-500/10 text-emerald-100">Published</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatYmdForDisplay(test.resolvedDate)} - {formatTimeForDisplay(test.resolvedTime)}
                              </p>
                              <Button asChild size="sm" variant="outline" className="mt-2 rounded-full">
                                <Link href={`/mock-tests/${test.id}`}>
                                  <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                                  Open Test
                                </Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4 space-y-3">
                      <p className="text-sm font-semibold">Test Results</p>
                      {isLoadingTestResults ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : scheduledBatchTests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No test results yet because no tests are scheduled.</p>
                      ) : (
                        <div className="space-y-2">
                          {scheduledBatchTests.slice(0, 12).map((test) => {
                            const result = testResultsById[test.id];
                            const resultAvailableAt = getTestAccessEndAt(test);
                            const reportLocked = !!resultAvailableAt && resultAvailableAt.getTime() > Date.now();
                            return (
                              <div key={`result-${test.id}`} className="rounded-lg border border-border/60 bg-background/40 p-3">
                                <p className="text-sm font-medium">{test.title || 'Live Batch Test'}</p>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                  <p>Attempts: <span className="font-semibold text-foreground">{result?.attempts ?? 0}</span></p>
                                  <p>Students: <span className="font-semibold text-foreground">{result?.uniqueStudents ?? 0}</span></p>
                                  <p>Best Score: <span className="font-semibold text-foreground">{result?.bestScore ?? 'N/A'}</span></p>
                                  <p>
                                    Last Attempt:{' '}
                                    <span className="font-semibold text-foreground">
                                      {result?.lastAttemptAt ? result.lastAttemptAt.toLocaleString() : 'N/A'}
                                    </span>
                                  </p>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {reportLocked ? (
                                    <Badge variant="outline" className="border-amber-300/35 bg-amber-500/10 text-amber-100">
                                      Report unlocks after {resultAvailableAt?.toLocaleString()}
                                    </Badge>
                                  ) : null}
                                  {reportLocked ? (
                                    <Button size="sm" variant="outline" className="rounded-full" disabled>
                                      <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                                      View Results
                                    </Button>
                                  ) : (
                                    <Button asChild size="sm" variant="outline" className="rounded-full">
                                      <Link href={`/mock-tests/${test.id}/attempt-history`}>
                                        <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                                        View Results
                                      </Link>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 border-border/70">
                <CardHeader>
                  <CardTitle>Batch Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{batch.description || 'No description provided.'}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Outcomes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{batch.outcomes || 'No outcomes provided.'}</p>
                </CardContent>
              </Card>
            </div>

            {batch.explanationVideoUrl ? (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Explanation Video</CardTitle>
                </CardHeader>
                <CardContent>
                  {explanationEmbedUrl ? (
                    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border/70">
                      <iframe
                        src={explanationEmbedUrl}
                        title="Batch explanation video"
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <Link href={batch.explanationVideoUrl} target="_blank" className="text-sm text-primary hover:underline">
                      Open Explanation Video
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-slate-950/95 via-blue-950/40 to-slate-900/90">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-cyan-300" />
                  Batch Timings by Subject
                </CardTitle>
                <CardDescription className="mt-1">
                  A clean weekly timetable view grouped by subject.
                </CardDescription>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-200">Subjects</p>
                  <p className="text-lg font-semibold">{weeklyTimingSummary.subjectCount}</p>
                </div>
                <div className="rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-blue-200">Active Days</p>
                  <p className="text-lg font-semibold">{weeklyTimingSummary.activeDays}</p>
                </div>
                <div className="rounded-lg border border-indigo-300/20 bg-indigo-500/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-indigo-200">Weekly Slots</p>
                  <p className="text-lg font-semibold">{weeklyTimingSummary.totalSlots}</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {subjectTimingCards.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                Subject timings are not configured for this batch yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {subjectTimingCards.map((timingCard) => (
                  <div key={timingCard.key} className="rounded-xl border border-border/70 bg-slate-900/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold">{timingCard.subjectName}</p>
                        <p className="text-xs text-muted-foreground">{timingCard.daysLabel}</p>
                      </div>
                      <Badge variant="outline" className="border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                        {timingCard.slotsPerWeek} {timingCard.slotsPerWeek === 1 ? 'slot' : 'slots'} / week
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-border/70 bg-background/30 text-xs text-muted-foreground">
                        Starts {timingCard.startsAtLabel}
                      </Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/30 text-xs text-muted-foreground">
                        Ends {timingCard.endsAtLabel}
                      </Badge>
                      {timingCard.usesDayWiseTiming ? (
                        <Badge className="border-amber-300/35 bg-amber-500/20 text-amber-100">Day-wise timing</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {timingCard.dayRows.map((row) => (
                        <div key={`${timingCard.key}-${row.dayName}`} className="rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                          <p className="text-xs font-medium">{row.dayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeForDisplay(row.startTime)}{row.endTime ? ` - ${formatTimeForDisplay(row.endTime)}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">All timings are shown in your device local time format.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
