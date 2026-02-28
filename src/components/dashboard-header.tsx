'use client';

import { useCallback, useMemo, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, BellRing, CalendarClock, CheckCircle2, LogOut, User, XCircle } from 'lucide-react';
import { useAuth, useUser, useFirestore, useCollection, useDoc, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { Skeleton } from './ui/skeleton';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { cn } from '@/lib/utils';

type DashboardHeaderProps = {
  title: string;
};

type NotificationDoc = {
  id: string;
  title?: string;
  message?: string;
  href?: string;
  recipientId?: string;
  audience?: 'students' | 'teachers' | 'admins' | 'all' | string;
  batchId?: string;
  notificationType?: string;
  eventDate?: string;
  eventEndDate?: string;
  eventTime?: string;
  eventEndTime?: string;
  createdAt?: { toDate?: () => Date } | Date | string | null;
};

type EnrolledLiveBatch = {
  id: string;
  batchId?: string;
  enrolledAt?: string;
};

type LiveBatch = {
  id: string;
  title?: string;
  teacherId?: string;
  subjectSchedules?: Array<{
    subjectId: string;
    daysOfWeek: string[];
    startTime: string;
    endTime: string;
    useDifferentTimingPerDay?: boolean;
    dayTimings?: Record<string, { startTime: string; endTime: string }>;
  }>;
};

type LiveBatchSession = {
  id: string;
  batchId?: string;
  teacherId?: string;
  type?: 'meeting' | 'previous_session' | 'holiday' | 'cancelled' | string;
  date?: string;
  meetingTime?: string;
};

type VisibleNotification = {
  id: string;
  title: string;
  message: string;
  href: string;
  createdAt: Date;
  rawId?: string;
  canDelete?: boolean;
  kind?: 'success' | 'danger' | 'warning' | 'info';
};

type UserProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const THREE_HOURS_IN_MS = 3 * 60 * 60 * 1000;
const SEEN_NOTIFICATIONS_STORAGE_KEY = 'dcam_seen_notifications_v1';

const toLocalYmd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseYmdToLocalDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toMinutes = (value?: string) => {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const parseYmdHmToLocalDateTime = (dateValue?: string, timeValue?: string) => {
  const date = parseYmdToLocalDate(dateValue);
  const minutes = toMinutes(timeValue);
  if (!date || minutes === null) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const asDate = (value?: { toDate?: () => Date } | Date | string | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const ensureDate = (value: Date | null): Date => value || new Date();

const readSeenNotificationIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEEN_NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const getNotificationKind = (
  type?: string,
  title?: string
): VisibleNotification['kind'] => {
  if (type === 'live_batch_cancelled') return 'danger';
  if (type === 'live_batch_holiday') return 'warning';
  if (type === 'live_batch_upcoming') return 'info';
  if (type === 'live_batch_test_scheduled') return 'info';
  if (type === 'live_batch_buy_sessions') return 'warning';
  if (type === 'curriculum_request_status') {
    if (/approved/i.test(title || '')) return 'success';
    if (/rejected/i.test(title || '')) return 'danger';
  }
  if (/approved/i.test(title || '')) return 'success';
  if (/rejected|cancelled|failed/i.test(title || '')) return 'danger';
  return 'info';
};

function NotificationsDropdown() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const isTeacherOnly = isTeacher && !isAdmin;
  const isStudent = !isTeacher && !isAdmin;
  const todayYmd = toLocalYmd(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [seenNotificationDocIds, setSeenNotificationDocIds] = useState<Set<string>>(
    () => new Set(readSeenNotificationIds())
  );
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Record<string, true>>({});

  const notificationsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'notifications'), orderBy('createdAt', 'desc'), limit(80)) : null),
    [firestore]
  );

  const enrolledBatchesQuery = useMemoFirebase(
    () => (firestore && user?.uid && isStudent ? query(collection(firestore, 'users', user.uid, 'enrolled_live_batches')) : null),
    [firestore, user?.uid, isStudent]
  );

  const teacherBatchesQuery = useMemoFirebase(
    () => (firestore && user?.uid && isTeacherOnly ? query(collection(firestore, 'live_batches'), where('teacherId', '==', user.uid)) : null),
    [firestore, user?.uid, isTeacherOnly]
  );

  const teacherSessionsQuery = useMemoFirebase(
    () => (firestore && user?.uid && isTeacherOnly ? query(collection(firestore, 'live_batch_sessions'), where('teacherId', '==', user.uid)) : null),
    [firestore, user?.uid, isTeacherOnly]
  );

  const { data: notifications, isLoading: notificationsLoading } = useCollection<NotificationDoc>(notificationsQuery);
  const { data: enrolledBatches, isLoading: enrolledBatchesLoading } = useCollection<EnrolledLiveBatch>(enrolledBatchesQuery);
  const { data: teacherBatches, isLoading: teacherBatchesLoading } = useCollection<LiveBatch>(teacherBatchesQuery);
  const { data: teacherSessions, isLoading: teacherSessionsLoading } = useCollection<LiveBatchSession>(teacherSessionsQuery);

  const teacherCurriculumNotifications = useMemo<VisibleNotification[]>(() => {
    if (!user?.uid || !isTeacherOnly) return [];
    return (notifications || [])
      .filter((item) => {
        if (item.recipientId !== user.uid) return false;
        if (item.notificationType === 'curriculum_request_status') return true;
        return /curriculum request/i.test(item.title || '');
      })
      .map((item) => ({
        id: `doc-${item.id}`,
        title: item.title || 'Curriculum Update',
        message: item.message || 'Admin reviewed your curriculum request.',
        href: item.href || '/curriculum',
        createdAt: ensureDate(asDate(item.createdAt)),
        rawId: item.id,
        canDelete: item.recipientId === user.uid,
        kind: getNotificationKind(item.notificationType, item.title),
      }));
  }, [notifications, isTeacherOnly, user?.uid]);

  const teacherScheduleGapNotifications = useMemo<VisibleNotification[]>(() => {
    if (!isTeacherOnly || !teacherBatches || !teacherSessions) return [];
    const now = new Date();
    const todayName = DAY_NAMES[now.getDay()];

    return teacherBatches
      .flatMap((batch) => {
        const upcomingStartTimes = (batch.subjectSchedules || [])
          .filter((schedule) => (schedule.daysOfWeek || []).includes(todayName))
          .map<string | null>((schedule) => {
            if (schedule.useDifferentTimingPerDay) {
              return schedule.dayTimings?.[todayName]?.startTime || null;
            }
            return schedule.startTime || null;
          })
          .filter((time): time is string => Boolean(time))
          .filter((time) => {
            const candidateDate = parseYmdHmToLocalDateTime(todayYmd, time);
            return Boolean(candidateDate && candidateDate.getTime() > now.getTime());
          })
          .sort((a, b) => (toMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (toMinutes(b) ?? Number.MAX_SAFE_INTEGER));

        if (upcomingStartTimes.length === 0) return [];
        const nearestUpcomingTime = upcomingStartTimes[0];

        const startDateTime = parseYmdHmToLocalDateTime(todayYmd, nearestUpcomingTime);
        if (!startDateTime) return [];

        const diffMs = startDateTime.getTime() - now.getTime();
        const withinThreeHourWindow = diffMs > 0 && diffMs <= THREE_HOURS_IN_MS;
        if (!withinThreeHourWindow) return [];

        const hasNoticeOrMeeting = teacherSessions.some((session) =>
          session.batchId === batch.id &&
          session.date === todayYmd &&
          ['meeting', 'holiday', 'cancelled'].includes(session.type || '')
        );
        if (hasNoticeOrMeeting) return [];

        const minutesLeft = Math.max(1, Math.floor(diffMs / 60000));
        const hours = Math.floor(minutesLeft / 60);
        const minutes = minutesLeft % 60;
        const timeLeftLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        const batchTitle = batch.title || 'Live Batch';

        return [{
          id: `teacher-gap-${batch.id}-${todayYmd}`,
          title: 'Class Not Scheduled Yet',
          message: `${batchTitle}: No meeting/holiday/cancel notice for today. Start time is within ${timeLeftLabel}.`,
          href: '/live-batches',
          createdAt: now,
          canDelete: false,
          kind: 'warning',
        }];
      });
  }, [isTeacherOnly, teacherBatches, teacherSessions, todayYmd]);

  const studentLiveBatchNotifications = useMemo<VisibleNotification[]>(() => {
    if (!isStudent || !user?.uid) return [];
    const enrolledBatchIds = new Set((enrolledBatches || []).map((item) => item.batchId || item.id).filter(Boolean));
    if (enrolledBatchIds.size === 0) return [];

    const now = new Date();

    return (notifications || [])
      .filter((item) => {
        const type = item.notificationType || '';
        const isSupportedType =
          type === 'live_batch_upcoming' ||
          type === 'live_batch_holiday' ||
          type === 'live_batch_cancelled' ||
          type === 'live_batch_test_scheduled' ||
          type === 'live_batch_buy_sessions';
        if (!isSupportedType) return false;

        const isDirectStudentAlert = item.recipientId === user.uid;
        const isBatchAudienceMatch =
          !!item.batchId &&
          enrolledBatchIds.has(item.batchId) &&
          (!item.audience || item.audience === 'students' || item.audience === 'all');
        if (!isBatchAudienceMatch && !isDirectStudentAlert) return false;

        if (type === 'live_batch_upcoming') {
          const eventDateTime = parseYmdHmToLocalDateTime(item.eventDate, item.eventTime);
          if (!eventDateTime) return false;
          if (eventDateTime.getTime() < now.getTime()) return false;
        }

        if (type === 'live_batch_cancelled') {
          if (!item.eventDate || item.eventDate < todayYmd) return false;
        }

        if (type === 'live_batch_holiday') {
          if (!item.eventDate) return false;
          const endDate = item.eventEndDate || item.eventDate;
          if (endDate && endDate < todayYmd) return false;
        }

        if (type === 'live_batch_test_scheduled') {
          const startAt = parseYmdHmToLocalDateTime(item.eventDate, item.eventTime);
          const endAt = parseYmdHmToLocalDateTime(item.eventDate, item.eventEndTime);
          if (!startAt || !endAt) {
            if (!item.eventDate || item.eventDate < todayYmd) return false;
          } else if (endAt.getTime() < now.getTime()) {
            return false;
          }
        }

        return true;
      })
      .map((item) => {
        const eventDate =
          parseYmdHmToLocalDateTime(item.eventDate, item.eventTime) ||
          parseYmdToLocalDate(item.eventDate) ||
          asDate(item.createdAt);
        return {
          id: `doc-${item.id}`,
          title: item.title || 'Live Batch Update',
          message: item.message || 'You have a new live batch update.',
          href: item.href || '/my-batch',
          createdAt: ensureDate(eventDate),
          rawId: item.id,
          canDelete: item.recipientId === user.uid,
          kind: getNotificationKind(item.notificationType, item.title),
        };
      });
  }, [enrolledBatches, isStudent, notifications, todayYmd, user?.uid]);

  const adminFallbackNotifications = useMemo<VisibleNotification[]>(() => {
    if (!user?.uid || isTeacherOnly || isStudent) return [];
    return (notifications || [])
      .filter((item) => !item.recipientId || item.recipientId === user.uid)
      .map((item) => ({
        id: `doc-${item.id}`,
        title: item.title || 'Notification',
        message: item.message || '',
        href: item.href || '/dashboard',
        createdAt: ensureDate(asDate(item.createdAt)),
        rawId: item.id,
        canDelete: item.recipientId === user.uid,
        kind: getNotificationKind(item.notificationType, item.title),
      }));
  }, [notifications, isStudent, isTeacherOnly, user?.uid]);

  const visibleNotifications = useMemo(() => {
    let source: VisibleNotification[] = [];

    if (isTeacherOnly) {
      source = [...teacherScheduleGapNotifications, ...teacherCurriculumNotifications];
    } else if (isStudent) {
      source = studentLiveBatchNotifications;
    } else {
      source = adminFallbackNotifications;
    }

    const deduped = new Map<string, VisibleNotification>();
    source.forEach((item) => {
      if (!deduped.has(item.id)) deduped.set(item.id, item);
    });

    const list = Array.from(deduped.values());
    if (isStudent) {
      return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, 6);
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  }, [
    adminFallbackNotifications,
    isStudent,
    isTeacherOnly,
    studentLiveBatchNotifications,
    teacherCurriculumNotifications,
    teacherScheduleGapNotifications,
  ]);

  const isLoading =
    isAdminLoading ||
    isTeacherLoading ||
    notificationsLoading ||
    (isStudent && enrolledBatchesLoading) ||
    (isTeacherOnly && (teacherBatchesLoading || teacherSessionsLoading));

  const visibleUnreadNotifications = useMemo(
    () =>
      visibleNotifications.filter((item) => {
        if (dismissedNotificationIds[item.id]) return false;
        if (item.rawId && seenNotificationDocIds.has(item.rawId)) return false;
        return true;
      }),
    [dismissedNotificationIds, seenNotificationDocIds, visibleNotifications]
  );

  const persistSeenNotificationIds = useCallback((ids: Set<string>) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SEEN_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {
      // no-op
    }
  }, []);

  const markNotificationsAsSeen = useCallback((
    items: VisibleNotification[],
    options?: { deleteFromFirestore?: boolean }
  ) => {
    if (items.length === 0) return;
    const shouldDeleteFromFirestore = options?.deleteFromFirestore === true;

    setDismissedNotificationIds((prev) => {
      let hasChanged = false;
      const next = { ...prev };
      items.forEach((item) => {
        if (!next[item.id]) {
          next[item.id] = true;
          hasChanged = true;
        }
      });
      return hasChanged ? next : prev;
    });

    const rawDocIds = items
      .map((item) => item.rawId)
      .filter((value): value is string => Boolean(value));

    if (rawDocIds.length > 0) {
      setSeenNotificationDocIds((prev) => {
        let hasChanged = false;
        const next = new Set(prev);
        rawDocIds.forEach((docId) => {
          if (!next.has(docId)) {
            next.add(docId);
            hasChanged = true;
          }
        });
        if (!hasChanged) return prev;
        persistSeenNotificationIds(next);
        return next;
      });
    }

    if (shouldDeleteFromFirestore && firestore) {
      items.forEach((item) => {
        if (!item.canDelete || !item.rawId) return;
        deleteDocumentNonBlocking(doc(firestore, 'notifications', item.rawId));
      });
    }
  }, [firestore, persistSeenNotificationIds]);

  const handleDropdownOpenChange = useCallback((open: boolean) => {
    setIsOpen((prevOpen) => {
      if (prevOpen === open) return prevOpen;
      if (!open && prevOpen && !isLoading && visibleUnreadNotifications.length > 0) {
        markNotificationsAsSeen(visibleUnreadNotifications);
      }
      return open;
    });
  }, [isLoading, markNotificationsAsSeen, visibleUnreadNotifications]);

  const getNotificationVisual = (kind?: VisibleNotification['kind']) => {
    if (kind === 'success') {
      return {
        Icon: CheckCircle2,
        cardClass: 'border-emerald-400/35 bg-emerald-500/10 hover:bg-emerald-500/15',
        iconClass: 'bg-emerald-500/20 text-emerald-300',
      };
    }
    if (kind === 'danger') {
      return {
        Icon: XCircle,
        cardClass: 'border-rose-400/35 bg-rose-500/10 hover:bg-rose-500/15',
        iconClass: 'bg-rose-500/20 text-rose-300',
      };
    }
    if (kind === 'warning') {
      return {
        Icon: AlertTriangle,
        cardClass: 'border-amber-400/35 bg-amber-500/10 hover:bg-amber-500/15',
        iconClass: 'bg-amber-500/20 text-amber-300',
      };
    }
    return {
      Icon: CalendarClock,
      cardClass: 'border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/15',
      iconClass: 'bg-cyan-500/20 text-cyan-300',
    };
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleDropdownOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/60">
          <BellRing className="h-5 w-5" />
          {!isLoading && visibleUnreadNotifications.length > 0 ? (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          ) : null}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[24rem] overflow-hidden border border-sidebar-border/60 bg-gradient-to-br from-background via-background to-sidebar-accent/20 p-0 md:w-[26rem]">
        <div className="flex items-center justify-between border-b border-sidebar-border/60 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-base font-semibold">Notifications</DropdownMenuLabel>
          {visibleUnreadNotifications.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                markNotificationsAsSeen(visibleUnreadNotifications, { deleteFromFirestore: true });
              }}
            >
              Clear All
            </Button>
          ) : null}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : visibleUnreadNotifications.length > 0 ? (
          <div className="max-h-[26rem] space-y-2 overflow-y-auto p-3">
            {visibleUnreadNotifications.map((item) => {
              const visual = getNotificationVisual(item.kind);
              const Icon = visual.Icon;
              return (
                <DropdownMenuItem key={item.id} asChild className="cursor-pointer p-0 focus:bg-transparent">
                  <Link href={item.href} className={cn('block w-full rounded-xl border p-3 transition-colors', visual.cardClass)}>
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg', visual.iconClass)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="line-clamp-1 text-[15px] font-semibold">{item.title}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{item.message}</p>
                        <p className="text-xs text-muted-foreground/90">
                          {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Bell className="h-5 w-5 text-muted-foreground/70" />
            <p className="text-sm font-medium">No new notifications</p>
            <p className="text-xs text-muted-foreground">You are all caught up.</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardHeader({ title }: DashboardHeaderProps) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const handleLogout = () => {
    signOut(auth);
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '';
    return name.split(' ').map((n) => n[0]).join('');
  };

  const profileImageUrl = userProfile?.photoURL || user?.photoURL || undefined;
  const profileDisplayName =
    `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || user?.displayName || 'User';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-sidebar-border/60 bg-gradient-to-r from-background/95 via-background/90 to-background/85 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="flex items-center gap-3">
        <div className="hidden h-10 w-1 rounded-full bg-gradient-to-b from-cyan-400 via-blue-500 to-indigo-500 md:block" />
        <div className="leading-tight">
          <h1 className="font-headline text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="hidden text-xs text-muted-foreground md:block">Focused workspace</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <NotificationsDropdown />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/60">
              {isUserLoading ? (
                <Skeleton className="h-10 w-10 rounded-full" />
              ) : user ? (
                <Avatar className="h-10 w-10">
                  {profileImageUrl ? <AvatarImage src={profileImageUrl} alt={profileDisplayName} /> : null}
                  <AvatarFallback>{getInitials(profileDisplayName)}</AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-10 w-10">
                  <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user ? (
              <>
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profileDisplayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem asChild>
                <Link href="/login">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log in</span>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
