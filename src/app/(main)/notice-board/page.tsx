'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ExternalLink, BellRing, CalendarDays, Link as LinkIcon } from 'lucide-react';

type NoticeItem = {
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  detectedDates: string[];
  formStartDate?: string;
  formCloseDate?: string;
};

type ExamSection = {
  id: string;
  examName: string;
  officialInfoUrl: string;
  officialApplyUrl: string;
  updates: NoticeItem[];
};

type NoticeBoardResponse = {
  automated: boolean;
  fetchedAt: string;
  revalidateSeconds: number;
  sections: ExamSection[];
  error?: string;
};

function formatDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function UpdateCard({ item }: { item: NoticeItem }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base leading-relaxed">{item.title}</CardTitle>
        <CardDescription className="text-xs flex flex-wrap items-center gap-2">
          {item.source ? <span>{item.source}</span> : null}
          {item.publishedAt ? <span>{item.publishedAt}</span> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.formStartDate || item.formCloseDate ? (
          <div className="flex flex-wrap gap-2">
            {item.formStartDate ? (
              <Badge variant="secondary" className="gap-1">
                <CalendarDays className="h-3 w-3" /> Start: {item.formStartDate}
              </Badge>
            ) : null}
            {item.formCloseDate ? (
              <Badge variant="destructive" className="gap-1">
                <CalendarDays className="h-3 w-3" /> Last Date: {item.formCloseDate}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {!item.formStartDate && !item.formCloseDate && item.detectedDates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {item.detectedDates.slice(0, 3).map((dateText) => (
              <Badge key={dateText} variant="outline">
                {dateText}
              </Badge>
            ))}
          </div>
        ) : null}

        {item.summary ? <p className="text-sm text-muted-foreground line-clamp-3">{item.summary}</p> : null}
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            Open Update <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function NoticeBoardPage() {
  const [data, setData] = useState<NoticeBoardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/notice-board', { cache: 'no-store' });
        const json = (await response.json()) as NoticeBoardResponse;
        if (!active) return;
        setData(json);
        if (json.error) {
          setError(json.error);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Could not load notice board.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const totalUpdates = useMemo(() => {
    if (!data?.sections) return 0;
    return data.sections.reduce((acc, section) => acc + section.updates.length, 0);
  }, [data]);

  const openSections = useMemo(() => {
    return (data?.sections || []).filter((section) => section.updates.length > 0);
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Notice Board" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <BellRing className="h-6 w-6" />
                Competitive Exam Automated Notice Board
              </CardTitle>
              <CardDescription>
                Fully automated list of exams with currently open application forms and detectable last-date deadlines. No manual input required.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Total updates fetched: {isLoading ? '...' : totalUpdates}</p>
              <p>Last refresh: {formatDate(data?.fetchedAt) || 'Not available'}</p>
              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : openSections.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No exam application windows are currently detected as open.
                </p>
              </CardContent>
            </Card>
          ) : (
            openSections.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="text-xl">{section.examName}</CardTitle>
                  <CardDescription className="flex flex-wrap gap-2 pt-1">
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={section.officialInfoUrl} target="_blank" rel="noopener noreferrer">
                        Official Info <LinkIcon className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={section.officialApplyUrl} target="_blank" rel="noopener noreferrer">
                        Official Apply Link <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {section.updates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No updates available right now.</p>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {section.updates.map((item) => (
                        <UpdateCard key={`${section.id}-${item.link}`} item={item} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
