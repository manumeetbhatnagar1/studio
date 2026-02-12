import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ai } from '@/ai/genkit';

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

type ExamNoticeSection = {
  id: string;
  examName: string;
  officialInfoUrl: string;
  officialApplyUrl: string;
  feedQuery: string;
  updates: NoticeItem[];
};

type OfficialVerification = {
  isOpen: boolean;
  lastDate?: string;
  startDate?: string;
  evidence: string[];
  textSample?: string;
};

const REVALIDATE_SECONDS = 1800;
const GOOGLE_NEWS_RSS_BASE = 'https://news.google.com/rss/search';

const EXAM_SECTIONS: Omit<ExamNoticeSection, 'updates'>[] = [
  {
    id: 'jee-main',
    examName: 'JEE Main',
    officialInfoUrl: 'https://jeemain.nta.nic.in/',
    officialApplyUrl: 'https://examinationservices.nic.in/jeemain',
    feedQuery: 'JEE Main application form last date apply now',
  },
  {
    id: 'jee-advanced',
    examName: 'JEE Advanced',
    officialInfoUrl: 'https://jeeadv.ac.in/',
    officialApplyUrl: 'https://jeeadv.ac.in/',
    feedQuery: 'JEE Advanced application form registration last date',
  },
  {
    id: 'neet-ug',
    examName: 'NEET UG',
    officialInfoUrl: 'https://neet.nta.nic.in/',
    officialApplyUrl: 'https://examinationservices.nic.in/neet',
    feedQuery: 'NEET UG application form last date apply now',
  },
  {
    id: 'cuet-ug',
    examName: 'CUET UG',
    officialInfoUrl: 'https://cuet.nta.nic.in/',
    officialApplyUrl: 'https://examinationservices.nic.in/cuet',
    feedQuery: 'CUET UG application form last date apply now',
  },
  {
    id: 'viteee',
    examName: 'VITEEE',
    officialInfoUrl: 'https://viteee.vit.ac.in/',
    officialApplyUrl: 'https://viteee.vit.ac.in/',
    feedQuery: 'VITEEE application form last date apply now',
  },
  {
    id: 'bitsat',
    examName: 'BITSAT',
    officialInfoUrl: 'https://www.bitsadmission.com/',
    officialApplyUrl: 'https://www.bitsadmission.com/',
    feedQuery: 'BITSAT application form last date apply now',
  },
  {
    id: 'wbjee',
    examName: 'WBJEE',
    officialInfoUrl: 'https://wbjeeb.nic.in/',
    officialApplyUrl: 'https://wbjeeb.nic.in/',
    feedQuery: 'WBJEE application form last date apply now',
  },
  {
    id: 'comedk-uget',
    examName: 'COMEDK UGET',
    officialInfoUrl: 'https://www.comedk.org/',
    officialApplyUrl: 'https://www.comedk.org/',
    feedQuery: 'COMEDK UGET application form last date apply now',
  },
  {
    id: 'srmjeee',
    examName: 'SRMJEEE',
    officialInfoUrl: 'https://applications.srmist.edu.in/',
    officialApplyUrl: 'https://applications.srmist.edu.in/',
    feedQuery: 'SRMJEEE application form last date apply now',
  },
  {
    id: 'met-manipal',
    examName: 'MET (Manipal)',
    officialInfoUrl: 'https://manipal.edu/mu/admission.html',
    officialApplyUrl: 'https://apply.manipal.edu/',
    feedQuery: 'Manipal MET application form last date apply now',
  },
  {
    id: 'upsc-cse',
    examName: 'UPSC CSE',
    officialInfoUrl: 'https://www.upsc.gov.in/',
    officialApplyUrl: 'https://upsconline.nic.in/',
    feedQuery: 'UPSC CSE application form last date apply now',
  },
  {
    id: 'ssc-cgl',
    examName: 'SSC CGL',
    officialInfoUrl: 'https://ssc.gov.in/',
    officialApplyUrl: 'https://ssc.gov.in/',
    feedQuery: 'SSC CGL application form last date apply now',
  },
  {
    id: 'ibps-po',
    examName: 'IBPS PO',
    officialInfoUrl: 'https://www.ibps.in/',
    officialApplyUrl: 'https://www.ibps.in/',
    feedQuery: 'IBPS PO application form last date apply now',
  },
  {
    id: 'nda',
    examName: 'NDA',
    officialInfoUrl: 'https://www.upsc.gov.in/',
    officialApplyUrl: 'https://upsconline.nic.in/',
    feedQuery: 'NDA application form last date apply now',
  },
];

function buildFeedUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
  });
  return `${GOOGLE_NEWS_RSS_BASE}?${params.toString()}`;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTagValue(itemXml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = itemXml.match(regex);
  return stripHtml(decodeEntities(match?.[1] || ''));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function detectDates(text: string): string[] {
  const compact = text.replace(/\s+/g, ' ');

  const numeric = compact.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || [];
  const longMonth =
    compact.match(
      /\b\d{1,2}\s+(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{4}\b/gi
    ) || [];
  const monthFirst =
    compact.match(
      /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2},\s+\d{4}\b/gi
    ) || [];

  return unique([...numeric, ...longMonth, ...monthFirst]);
}

function inferDateByContext(text: string, keywords: RegExp): string | undefined {
  const normalized = text.replace(/\s+/g, ' ');
  const contextRegex = new RegExp(
    `${keywords.source}[^.\\n]{0,110}?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\\s+\\d{4}|(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\\s+\\d{1,2},\\s+\\d{4})`,
    'i'
  );
  const match = normalized.match(contextRegex);
  return match?.[1];
}

function tryParseDate(input: string): Date | null {
  if (!input) return null;
  const normalized = input.trim().replace(/\s+/g, ' ');
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct;

  const slash = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
    const parsed = new Date(year, month, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function looksWithinDeadline(formCloseDate?: string): boolean {
  if (!formCloseDate) return false;
  const parsed = tryParseDate(formCloseDate);
  if (!parsed) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime() >= today.getTime();
}

function isLikelyOpenApplication(text: string): boolean {
  const normalized = text.toLowerCase();

  const openSignals = [
    'application open',
    'applications open',
    'registration open',
    'registration started',
    'application started',
    'apply now',
    'online application',
    'form filling started',
    'forms available',
    'registration live',
    'application live',
    'extended till',
    'extended to',
    'application window open',
  ];

  const closedSignals = [
    'registration closed',
    'application closed',
    'window closed',
    'last date over',
    'deadline passed',
    'admit card',
    'answer key',
    'result declared',
    'results declared',
    'counselling',
    'counseling',
    'exam city intimation',
    'seat allotment',
    'answer-key',
  ];

  const hasOpenSignal = openSignals.some((signal) => normalized.includes(signal));
  const hasClosedSignal = closedSignals.some((signal) => normalized.includes(signal));
  return hasOpenSignal && !hasClosedSignal;
}

function parseRss(xml: string, maxItems: number): NoticeItem[] {
  const items: NoticeItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null = itemRegex.exec(xml);

  while (match && items.length < maxItems) {
    const itemXml = match[1];
    const title = getTagValue(itemXml, 'title');
    const link = getTagValue(itemXml, 'link');
    const description = getTagValue(itemXml, 'description');
    const pubDate = getTagValue(itemXml, 'pubDate');
    const source = getTagValue(itemXml, 'source');
    const combined = `${title}. ${description}`;
    const detectedDates = detectDates(combined);
    const formStartDate = inferDateByContext(
      combined,
      /(registration\s+start|registration\s+open|application\s+start|application\s+open|form\s+start|from)\b/i
    );
    const formCloseDate = inferDateByContext(
      combined,
      /(last\s+date|closing\s+date|deadline|form\s+close|till|extended\s+to|apply\s+till)\b/i
    );

    if (title && link && isLikelyOpenApplication(combined) && formCloseDate && looksWithinDeadline(formCloseDate)) {
      items.push({
        title,
        link,
        source,
        publishedAt: pubDate,
        summary: description || undefined,
        detectedDates,
        formStartDate,
        formCloseDate,
      });
    }

    match = itemRegex.exec(xml);
  }

  return items;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: {
      'user-agent': 'DCAM-NoticeBoard/1.1',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.text();
}

function verifyFromOfficialPage(html: string): OfficialVerification {
  const cleanText = stripHtml(decodeEntities(html));
  const open = isLikelyOpenApplication(cleanText);
  const lastDate = inferDateByContext(
    cleanText,
    /(last\s+date|closing\s+date|deadline|apply\s+till|registration\s+ends|extended\s+to)\b/i
  );
  const startDate = inferDateByContext(
    cleanText,
    /(application\s+start|registration\s+start|from|registration\s+open\s+from)\b/i
  );

  const evidence: string[] = [];
  if (open) evidence.push('Official page indicates application/registration is open.');
  if (lastDate) evidence.push(`Official page deadline: ${lastDate}`);

  return {
    isOpen: open && !!lastDate && looksWithinDeadline(lastDate),
    lastDate: lastDate || undefined,
    startDate: startDate || undefined,
    evidence,
    textSample: cleanText.slice(0, 4500),
  };
}

function buildOfficialNotice(section: Omit<ExamNoticeSection, 'updates'>, verification: OfficialVerification): NoticeItem {
  return {
    title: `${section.examName} applications are open`,
    link: section.officialApplyUrl,
    source: 'Official Website',
    publishedAt: new Date().toUTCString(),
    summary: verification.evidence.join(' '),
    detectedDates: [verification.startDate, verification.lastDate].filter(Boolean) as string[],
    formStartDate: verification.startDate,
    formCloseDate: verification.lastDate,
  };
}

function dedupeByLink(items: NoticeItem[]): NoticeItem[] {
  const seen = new Set<string>();
  const result: NoticeItem[] = [];
  for (const item of items) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    result.push(item);
  }
  return result;
}

const NoticeAiDecisionSchema = z.object({
  include: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  normalizedLastDate: z.string().optional(),
});

type NoticeAiDecision = z.infer<typeof NoticeAiDecisionSchema>;

async function aiValidateOpenWindow(input: {
  examName: string;
  officialVerification: OfficialVerification;
  officialInfoUrl: string;
  officialApplyUrl: string;
  feedCandidates: NoticeItem[];
}): Promise<NoticeAiDecision> {
  const prompt = `You are validating whether an exam application form is CURRENTLY OPEN.

Exam: ${input.examName}
Official Info URL: ${input.officialInfoUrl}
Official Apply URL: ${input.officialApplyUrl}

Official extracted evidence:
${input.officialVerification.evidence.join('\n') || 'No explicit evidence extracted.'}

Official text sample:
${input.officialVerification.textSample || 'No text sample available.'}

Feed candidates:
${input.feedCandidates
  .slice(0, 4)
  .map(
    (u, idx) =>
      `${idx + 1}. ${u.title}\n   summary=${u.summary || 'n/a'}\n   lastDate=${u.formCloseDate || 'n/a'}`
  )
  .join('\n')}

Rules:
1) include=true ONLY if you are confident the application window is open right now.
2) If last date appears expired or missing, include=false.
3) Prefer official evidence over media feed text.
4) Return normalizedLastDate only if confidently detected.
`;

  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-pro',
      prompt,
      output: { schema: NoticeAiDecisionSchema },
    });
    return output || { include: false, confidence: 0, reasoning: 'AI returned no output.' };
  } catch {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      prompt,
      output: { schema: NoticeAiDecisionSchema },
    });
    return output || { include: false, confidence: 0, reasoning: 'AI returned no output.' };
  }
}

export async function GET() {
  try {
    const sectionResults = await Promise.all(
      EXAM_SECTIONS.map(async (section) => {
        try {
          const [officialInfoHtml, officialApplyHtml, feedXml] = await Promise.all([
            fetchText(section.officialInfoUrl),
            fetchText(section.officialApplyUrl),
            fetchText(buildFeedUrl(section.feedQuery)),
          ]);

          const infoVerification = verifyFromOfficialPage(officialInfoHtml);
          const applyVerification = verifyFromOfficialPage(officialApplyHtml);
          const officialVerification = applyVerification.isOpen ? applyVerification : infoVerification;

          if (!officialVerification.isOpen) {
            return { ...section, updates: [] } as ExamNoticeSection;
          }

          const feedUpdates = parseRss(feedXml, 6);
          const officialNotice = buildOfficialNotice(section, officialVerification);
          const candidateUpdates = dedupeByLink([officialNotice, ...feedUpdates]).sort((a, b) => {
            const aDate = tryParseDate(a.formCloseDate || '')?.getTime() || Number.MAX_SAFE_INTEGER;
            const bDate = tryParseDate(b.formCloseDate || '')?.getTime() || Number.MAX_SAFE_INTEGER;
            return aDate - bDate;
          });

          let aiDecision: NoticeAiDecision | null = null;
          if (process.env.GOOGLE_API_KEY) {
            try {
              aiDecision = await aiValidateOpenWindow({
                examName: section.examName,
                officialVerification,
                officialInfoUrl: section.officialInfoUrl,
                officialApplyUrl: section.officialApplyUrl,
                feedCandidates: candidateUpdates,
              });
            } catch {
              aiDecision = null;
            }
          }

          if (aiDecision) {
            const aiLastDate = aiDecision.normalizedLastDate || officialVerification.lastDate;
            if (!aiDecision.include || aiDecision.confidence < 0.7 || !looksWithinDeadline(aiLastDate)) {
              return { ...section, updates: [] } as ExamNoticeSection;
            }
          }

          const updates = candidateUpdates.map((u, idx) => {
            if (idx !== 0) return u;
            return {
              ...u,
              formCloseDate: (aiDecision?.normalizedLastDate || u.formCloseDate || officialVerification.lastDate) ?? undefined,
              summary: aiDecision ? `${u.summary || ''} ${aiDecision.reasoning}`.trim() : u.summary,
            };
          });

          return {
            ...section,
            updates,
          } as ExamNoticeSection;
        } catch {
          return { ...section, updates: [] } as ExamNoticeSection;
        }
      })
    );

    const sections = sectionResults.filter((section) => section.updates.length > 0);

    return NextResponse.json(
      {
        automated: true,
        fetchedAt: new Date().toISOString(),
        revalidateSeconds: REVALIDATE_SECONDS,
        sections,
      },
      {
        headers: {
          'cache-control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300`,
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        automated: true,
        fetchedAt: new Date().toISOString(),
        sections: [],
        error: error?.message || 'Failed to fetch notice feeds.',
      },
      { status: 200 }
    );
  }
}
