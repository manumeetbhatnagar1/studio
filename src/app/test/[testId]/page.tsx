'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, documentId, serverTimestamp, runTransaction } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Timer, User, LoaderCircle, ArrowLeft, Check, XIcon, Trophy, Users, BarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type QuestionType = 'MCQ' | 'Numerical';
type SubjectName = 'Physics' | 'Chemistry' | 'Mathematics' | string;
enum QuestionStatus {
  NotAnswered,
  Answered,
  MarkedForReview,
  AnsweredAndMarkedForReview,
  NotVisited,
}

type MockQuestion = {
  id: string;
  subjectId: string;
  questionText: string;
  questionType: 'MCQ' | 'Numerical';
  options?: string[];
  correctAnswer?: string;
  numericalAnswer?: number;
  subject: SubjectName;
  imageUrl?: string;
  imageUrls?: string[];
  explanationImageUrl?: string;
  explanationImageUrls?: string[];
};

type Answer = {
  value: string | number;
  status: QuestionStatus;
};

type CustomTestConfig = {
    id: string;
    title: string;
    accessLevel: 'free' | 'paid';
    config: {
        questionIds: string[];
        duration: number;
        marksPerQuestion?: number;
        negativeMarksPerQuestion?: number;
    };
}

type OfficialTestConfig = {
    id: string;
    title: string;
    startTime: { toDate: () => Date };
    examCategory: 'JEE Main' | 'JEE Advanced' | 'Both';
    accessLevel: 'free' | 'paid';
    config: {
        questionIds: string[];
        duration: number;
    };
}

type TestAnalytics = {
  averageScore: number;
  topperScore: number;
  averageTimeTaken: number;
  numberOfAttempts: number;
};

const fetchQuestionsByIds = async (firestore: any, questionIds: string[]): Promise<MockQuestion[]> => {
    if (!questionIds || questionIds.length === 0) {
        return [];
    }

    const allQuestions: MockQuestion[] = [];
    const subjectsMap = new Map<string, string>();
    const subjectsSnapshot = await getDocs(collection(firestore, 'subjects'));
    subjectsSnapshot.forEach(doc => subjectsMap.set(doc.id, doc.data().name));

    // Firestore 'in' queries are limited to 30 items.
    const CHUNK_SIZE = 30;
    for (let i = 0; i < questionIds.length; i += CHUNK_SIZE) {
        const chunk = questionIds.slice(i, i + CHUNK_SIZE);
        const q = query(collection(firestore, 'practice_questions'), where(documentId(), 'in', chunk));
        const qSnapshot = await getDocs(q);
        const questionsChunk = qSnapshot.docs.map(d => {
            const data = d.data();
            return { 
                ...(data as any), 
                id: d.id,
                subject: subjectsMap.get(data.subjectId) || 'Unknown Subject'
            } as MockQuestion;
        });
        allQuestions.push(...questionsChunk);
    }
    
    // Preserve the order from the config
    return allQuestions.sort((a, b) => questionIds.indexOf(a.id) - questionIds.indexOf(b.id));
};

const AnalyticsDashboard: React.FC<{
  userScore: number;
  userTime: number;
  analytics: TestAnalytics | null;
  isLoading: boolean;
}> = ({ userScore, userTime, analytics, isLoading }) => {
    if(isLoading) {
        return <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
    }

    if (!analytics) return null;

    return (
        <div className="mt-8">
             <h3 className="font-headline text-2xl mb-4 text-center">Performance Analysis</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><User className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Your Score</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold text-primary">{userScore}</p></CardContent>
                </Card>
                 <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><Trophy className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Topper's Score</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold">{analytics.topperScore.toFixed(0)}</p></CardContent>
                </Card>
                 <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><Users className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Average Score</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold">{analytics.averageScore.toFixed(0)}</p></CardContent>
                </Card>
                <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><Timer className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Your Time</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold">{userTime} <span className='text-base font-normal'>mins</span></p></CardContent>
                </Card>
                <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><Timer className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Average Time</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold">{analytics.averageTimeTaken.toFixed(0)} <span className='text-base font-normal'>mins</span></p></CardContent>
                </Card>
                 <Card className="text-center">
                    <CardHeader className="flex flex-row items-center justify-center gap-2 pb-2"><BarChart className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-lg">Total Attempts</CardTitle></CardHeader>
                    <CardContent><p className="text-4xl font-bold">{analytics.numberOfAttempts}</p></CardContent>
                </Card>
             </div>
        </div>
    );
}

export default function MockTestPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { testId } = useParams() as { testId: string };
    const searchParams = useSearchParams();
    const router = useRouter();
    const testType = searchParams.get('type');
    const { toast } = useToast();
    const resultsRef = useRef<HTMLDivElement>(null);

    const [testTitle, setTestTitle] = useState('Loading Test...');
    const [questions, setQuestions] = useState<MockQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [testConfig, setTestConfig] = useState<CustomTestConfig | OfficialTestConfig | null>(null);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Map<string | number, Answer>>(new Map());
    const [duration, setDuration] = useState(180);
    const [timeLeft, setTimeLeft] = useState(180 * 60);
    const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [score, setScore] = useState(0);
    const [analytics, setAnalytics] = useState<TestAnalytics | null>(null);
    const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

    const handleDownloadPdf = () => {
        const input = resultsRef.current;
        if (input) {
            toast({
                title: 'Generating PDF...',
                description: 'Your test analysis is being prepared for download.',
            });
            html2canvas(input, {
                scale: 2,
                useCORS: true
            }).then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                
                const ratio = pdfWidth / imgWidth;
                const finalImgHeight = imgHeight * ratio;
                
                let heightLeft = finalImgHeight;
                let position = 0;

                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, finalImgHeight);
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position -= pdfHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, finalImgHeight);
                    heightLeft -= pdfHeight;
                }
                
                pdf.save(`test-analysis-${testId}.pdf`);
            });
        }
    };

    const handleSubmitTest = useCallback(async () => {
        setIsSubmitDialogOpen(false);
        
        let finalScore = 0;
        const marksPerQuestion = (testType === 'custom' && (testConfig as CustomTestConfig)?.config.marksPerQuestion) ?? 4;
        const negativeMarksPerQuestion = (testType === 'custom' && (testConfig as CustomTestConfig)?.config.negativeMarksPerQuestion) ?? 1;

        questions.forEach((question) => {
            const answer = answers.get(question.id);
            if (answer && (answer.value !== '' && answer.value !== undefined)) {
                let isCorrect = false;
                if (question.questionType === 'MCQ' && question.correctAnswer === answer.value) {
                    isCorrect = true;
                } else if (question.questionType === 'Numerical' && Number(question.numericalAnswer) === Number(answer.value)) {
                    isCorrect = true;
                }

                if(isCorrect) {
                    finalScore += marksPerQuestion;
                } else {
                    finalScore -= negativeMarksPerQuestion;
                }
            }
        });
        
        setScore(finalScore);
        setIsFinished(true);

        if (user && firestore && (testType !== 'custom')) {
            const timeTaken = duration - Math.floor(timeLeft / 60);
            const userTime = timeTaken > 0 ? timeTaken : 0;

            try {
                await runTransaction(firestore, async (transaction) => {
                    const analyticsRef = doc(firestore, 'test_analytics', testId);
                    const userResultRef = doc(collection(firestore, 'users', user.uid, 'test_results'));

                    const analyticsDoc = await transaction.get(analyticsRef);

                    const answersToSave: Record<string, any> = {};
                    answers.forEach((ans, qId) => { answersToSave[String(qId)] = ans.value; });

                    const userResultData = {
                        testId: testId,
                        score: finalScore,
                        timeTaken: userTime,
                        answers: answersToSave,
                        submittedAt: serverTimestamp(),
                    };

                    if (!analyticsDoc.exists()) {
                        transaction.set(analyticsRef, {
                            id: testId,
                            totalScore: finalScore,
                            totalTimeTaken: userTime,
                            numberOfAttempts: 1,
                            averageScore: finalScore,
                            averageTimeTaken: userTime,
                            topperScore: finalScore,
                            topperStudentName: user.displayName || 'Anonymous',
                        });
                    } else {
                        const oldAnalytics = analyticsDoc.data();
                        const newNumberOfAttempts = oldAnalytics.numberOfAttempts + 1;
                        const newTotalScore = oldAnalytics.totalScore + finalScore;
                        const newTotalTimeTaken = oldAnalytics.totalTimeTaken + userTime;
                        
                        let newTopperScore = oldAnalytics.topperScore;
                        let newTopperStudentName = oldAnalytics.topperStudentName;
                        if (finalScore > oldAnalytics.topperScore) {
                            newTopperScore = finalScore;
                            newTopperStudentName = user.displayName || 'Anonymous';
                        }
                        
                        transaction.update(analyticsRef, {
                            numberOfAttempts: newNumberOfAttempts,
                            totalScore: newTotalScore,
                            totalTimeTaken: newTotalTimeTaken,
                            averageScore: newTotalScore / newNumberOfAttempts,
                            averageTimeTaken: newTotalTimeTaken / newNumberOfAttempts,
                            topperScore: newTopperScore,
                            topperStudentName: newTopperStudentName,
                        });
                    }
                    
                    transaction.set(userResultRef, userResultData);
                });
            } catch (error) {
                console.error("Test submission transaction failed: ", error);
            }
        }
    }, [answers, duration, firestore, questions, testId, testType, timeLeft, user, testConfig]);


    useEffect(() => {
        const loadTest = async () => {
            if (!firestore || !user) return;
            setIsLoading(true);
            
            let testConfigSnap;
            let loadedTestConfig: CustomTestConfig | OfficialTestConfig;

            if (testType === 'custom') {
                const testConfigRef = doc(firestore, 'users', user.uid, 'custom_tests', testId);
                testConfigSnap = await getDoc(testConfigRef);
                loadedTestConfig = testConfigSnap.data() as CustomTestConfig;
            } else {
                const testConfigRef = doc(firestore, 'mock_tests', testId);
                testConfigSnap = await getDoc(testConfigRef);
                loadedTestConfig = testConfigSnap.data() as OfficialTestConfig;
            }
    
            if (testConfigSnap.exists() && loadedTestConfig.config.questionIds) {
                setTestConfig(loadedTestConfig);
                setTestTitle(loadedTestConfig.title);
                setDuration(loadedTestConfig.config.duration);
                setTimeLeft(loadedTestConfig.config.duration * 60);
                const fetchedQuestions = await fetchQuestionsByIds(firestore, loadedTestConfig.config.questionIds);
                setQuestions(fetchedQuestions);
            } else {
                setTestTitle("Test Not Found or Misconfigured");
                setQuestions([]);
            }
            
            setIsLoading(false);
        };
        loadTest();
    }, [testId, testType, user, firestore]);
    
    useEffect(() => {
        const fetchAnalytics = async () => {
            if (isFinished && firestore && testId && testType !== 'custom') {
                setIsAnalyticsLoading(true);
                try {
                    const analyticsRef = doc(firestore, 'test_analytics', testId);
                    const docSnap = await getDoc(analyticsRef);
                    if (docSnap.exists()) {
                        setAnalytics(docSnap.data() as TestAnalytics);
                    }
                } catch (error) {
                    console.error("Error fetching analytics:", error);
                } finally {
                    setIsAnalyticsLoading(false);
                }
            }
        };
        fetchAnalytics();
    }, [isFinished, firestore, testId, testType]);

    // Timer effect
    useEffect(() => {
        if (isLoading || isFinished || timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    handleSubmitTest();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft, isLoading, isFinished, handleSubmitTest]);

    const sections = useMemo(() => {
        if (!questions.length) return [];
        const sectionMap: Record<string, MockQuestion[]> = {};
        questions.forEach(q => {
            if (!sectionMap[q.subject]) {
                sectionMap[q.subject] = [];
            }
            sectionMap[q.subject].push(q);
        });
        return Object.entries(sectionMap).map(([name, questions]) => ({ name, questions }));
    }, [questions]);

    const getQuestionStatus = useCallback((questionId: string | number) => {
        const answer = answers.get(questionId);
        if (!answer) return QuestionStatus.NotVisited;
        return answer.status;
    }, [answers]);

    const currentQuestion = questions[currentQuestionIndex];

    const questionImages = useMemo(() => {
        if (!currentQuestion) return [];
        if (currentQuestion.imageUrls && Array.isArray(currentQuestion.imageUrls)) {
            return currentQuestion.imageUrls;
        }
        if (currentQuestion.imageUrl && typeof currentQuestion.imageUrl === 'string') {
            return [currentQuestion.imageUrl];
        }
        return [];
    }, [currentQuestion]);

    const handleSelectQuestion = (index: number) => {
        const cq = questions[currentQuestionIndex];
        const currentStatus = getQuestionStatus(cq.id);
        if (currentStatus === QuestionStatus.NotVisited) {
            setAnswers(prev => new Map(prev).set(cq.id, { value: '', status: QuestionStatus.NotAnswered }));
        }
        setCurrentQuestionIndex(index);
    };
    
    const handleSaveAndNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            handleSelectQuestion(currentQuestionIndex + 1);
        }
    };
    
    const handleMarkForReview = () => {
        const currentAnswer = answers.get(currentQuestion.id);
        const newStatus = currentAnswer?.value ? QuestionStatus.AnsweredAndMarkedForReview : QuestionStatus.MarkedForReview;
        setAnswers(prev => new Map(prev).set(currentQuestion.id, { value: currentAnswer?.value || '', status: newStatus }));
        handleSaveAndNext();
    };
    
    const handleClearResponse = () => setAnswers(prev => new Map(prev).set(currentQuestion.id, { value: '', status: QuestionStatus.NotAnswered }));

    const handleAnswerChange = (value: string | number) => {
        const currentStatus = getQuestionStatus(currentQuestion.id);
        const newStatus = currentStatus === QuestionStatus.MarkedForReview || currentStatus === QuestionStatus.AnsweredAndMarkedForReview
            ? QuestionStatus.AnsweredAndMarkedForReview
            : QuestionStatus.Answered;
        setAnswers(prev => new Map(prev).set(currentQuestion.id, { value, status: newStatus }));
    };

    const getStatusClasses = (status: QuestionStatus) => {
        switch (status) {
            case QuestionStatus.Answered: return 'bg-green-500 text-white';
            case QuestionStatus.NotAnswered: return 'bg-red-500 text-white';
            case QuestionStatus.MarkedForReview: return 'bg-purple-500 text-white';
            case QuestionStatus.AnsweredAndMarkedForReview: return 'bg-purple-500 text-white relative after:content-[\'✔\'] after:absolute after:bottom-0 after:right-0 after:text-xs after:text-green-300';
            case QuestionStatus.NotVisited: return 'bg-gray-200 text-gray-800';
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };
    
    const summary = useMemo(() => {
        const summaryData = { answered: 0, notAnswered: 0, notVisited: questions.length, markedForReview: 0, answeredAndMarked: 0 };
        answers.forEach(answer => {
            switch (answer.status) {
                case QuestionStatus.Answered: summaryData.answered++; break;
                case QuestionStatus.NotAnswered: summaryData.notAnswered++; break;
                case QuestionStatus.MarkedForReview: summaryData.markedForReview++; break;
                case QuestionStatus.AnsweredAndMarkedForReview: summaryData.answeredAndMarked++; break;
            }
        });
        summaryData.notVisited = questions.length - (summaryData.answered + summaryData.notAnswered + summaryData.markedForReview + summaryData.answeredAndMarked);
        return summaryData;
    }, [answers, questions]);

    if (isLoading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
              <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Loading your test...</p>
            </div>
        );
    }
    
    if (!currentQuestion) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">{testTitle}</h1>
                <p className="text-lg text-destructive">Could not load test questions.</p>
                <p className="text-muted-foreground mt-2">There may be no questions available for this test configuration.</p>
                <Button onClick={() => router.back()} className="mt-4"><ArrowLeft className='mr-2'/>Go Back</Button>
              </div>
            </div>
        );
    }

    if(isFinished) {
        const timeTaken = duration - Math.floor(timeLeft / 60);
        const marksPerQuestion = (testType === 'custom' && (testConfig as CustomTestConfig)?.config.marksPerQuestion) ?? 4;
        const negativeMarksPerQuestion = (testType === 'custom' && (testConfig as CustomTestConfig)?.config.negativeMarksPerQuestion) ?? 1;

        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30 py-8 px-4">
                <Card ref={resultsRef} className="w-full max-w-4xl text-center shadow-2xl p-6 bg-card">
                    <CardHeader>
                        <CardTitle className="font-headline text-3xl">Test Finished: {testTitle}</CardTitle>
                        <CardDescription>
                            Total Marks: {questions.length * marksPerQuestion} (Scoring: +{marksPerQuestion} correct, -{negativeMarksPerQuestion} incorrect)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        
                        {testType !== 'custom' && (
                            <AnalyticsDashboard 
                                userScore={score} 
                                userTime={timeTaken > 0 ? timeTaken : 0} 
                                analytics={analytics}
                                isLoading={isAnalyticsLoading}
                            />
                        )}

                        {testType === 'custom' && (
                             <Card className="text-center w-fit mx-auto">
                                <CardHeader><CardTitle>Your Score</CardTitle></CardHeader>
                                <CardContent><p className="text-5xl font-bold text-primary">{score}</p></CardContent>
                            </Card>
                        )}
                        
                        <Card className="mt-6 text-left">
                            <CardHeader>
                                <CardTitle>Review Your Answers</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 max-h-80 overflow-y-auto">
                                {questions.map((q, i) => {
                                    const ans = answers.get(q.id);
                                    let isCorrect = false;
                                    if(ans && (ans.value !== '' && ans.value !== undefined)) {
                                        if(q.questionType === 'MCQ') {
                                            isCorrect = q.correctAnswer === ans.value;
                                        } else if(q.questionType === 'Numerical') {
                                            isCorrect = Number(q.numericalAnswer) === Number(ans.value);
                                        }
                                    }
                                    const attempted = ans && (ans.value !== '' && ans.value !== undefined);

                                    const qImages = (q.imageUrls && Array.isArray(q.imageUrls)) ? q.imageUrls : (q.imageUrl ? [q.imageUrl] : []);
                                    const explanationImages = (q.explanationImageUrls && Array.isArray(q.explanationImageUrls)) ? q.explanationImageUrls : (q.explanationImageUrl ? [q.explanationImageUrl] : []);

                                    return (
                                        <div key={q.id} className="flex items-start gap-3 p-3 border-b last:border-b-0">
                                            {attempted ? (isCorrect ? <Check className="h-5 w-5 text-green-500 mt-1 flex-shrink-0" /> : <XIcon className="h-5 w-5 text-red-500 mt-1 flex-shrink-0" />) : <div className="w-5 h-5 mt-1 flex-shrink-0" />}
                                            <div className="flex-1">
                                                <p className="font-medium">Q{i+1}: {q.questionText}</p>
                                                 {qImages.length > 0 && (
                                                    <div className="my-2 space-y-2">
                                                        {qImages.map((url, imgIndex) => (
                                                             <div key={imgIndex} className="p-2 border rounded-md bg-muted/50">
                                                                <Image src={url} alt={`Question ${i + 1} image ${imgIndex + 1}`} width={1000} height={750} className="rounded-md object-contain mx-auto" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className="text-sm">Your answer: <span className="font-semibold">{attempted ? ans.value : 'Not Answered'}</span></p>
                                                {!isCorrect && attempted && <p className="text-sm">Correct answer: <span className="font-semibold text-green-600">{q.correctAnswer || q.numericalAnswer}</span></p>}
                                                {explanationImages.length > 0 && (
                                                    <div className="my-2">
                                                        <p className="text-sm font-semibold text-muted-foreground">Explanation:</p>
                                                        <div className="mt-1 space-y-2">
                                                            {explanationImages.map((url, imgIndex) => (
                                                                <div key={imgIndex} className="p-2 border rounded-md bg-muted/50">
                                                                    <Image src={url} alt={`Explanation for question ${i + 1} image ${imgIndex + 1}`} width={1000} height={750} className="rounded-md object-contain mx-auto" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
                <div className="flex gap-4 mt-8">
                    <Button onClick={() => router.push('/mock-tests')}>Back to Mock Tests</Button>
                    <Button variant="outline" onClick={handleDownloadPdf}>Download Analysis PDF</Button>
                </div>
            </div>
        )
    }

    return (
        <>
            <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
                <div className="flex items-center gap-2"><Logo className="w-8 h-8 text-primary" /><span className="font-headline text-2xl font-semibold text-primary">DCAM Classes</span></div>
                <div><h1 className="font-headline text-xl font-semibold text-center">{testTitle}</h1></div>
                <div className="w-48"></div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4">
                {/* Left Panel: Question Area */}
                <div className="flex flex-col gap-4">
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Question No. {currentQuestionIndex + 1}</CardTitle>
                            <div className='flex gap-4 text-sm'><Badge variant="secondary">Marks: +4</Badge><Badge variant="destructive">Negative Marks: -1</Badge></div>
                        </CardHeader>
                        <CardContent className="prose max-w-none">
                            <p>{currentQuestion.questionText}</p>
                            {questionImages.length > 0 && (
                                <div className="my-4 space-y-2">
                                    {questionImages.map((url, index) => (
                                        <div key={index} className="p-2 border rounded-md bg-muted/50">
                                            <Image src={url} alt={`Question image ${index + 1}`} width={1000} height={750} className="rounded-md object-contain mx-auto" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="flex-grow">
                        <CardContent className="p-6">
                            {currentQuestion.questionType === 'MCQ' ? (
                                <RadioGroup value={answers.get(currentQuestion.id)?.value as string || ''} onValueChange={handleAnswerChange}>
                                    {currentQuestion.options?.map((option, index) => (
                                        <div key={index} className="flex items-center space-x-2 p-3 rounded-md hover:bg-muted"><RadioGroupItem value={option} id={`option-${index}`} /><Label htmlFor={`option-${index}`} className="flex-1 text-base">{option}</Label></div>
                                    ))}
                                </RadioGroup>
                            ) : (<><Label htmlFor="numerical-answer" className="text-lg">Your Answer</Label><Input id="numerical-answer" type="number" className="mt-2 text-base" placeholder="Enter your numerical answer" value={answers.get(currentQuestion.id)?.value || ''} onChange={(e) => handleAnswerChange(e.target.value)} /></>)}
                        </CardContent>
                    </Card>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSaveAndNext}>Save & Next</Button>
                        <Button variant="secondary" onClick={handleMarkForReview}>Mark for Review & Next</Button>
                        <Button variant="outline" onClick={handleClearResponse}>Clear Response</Button>
                    </div>
                </div>
                {/* Right Panel: Info and Navigation */}
                <div className="flex flex-col gap-4">
                    <Card><CardContent className="p-4 flex items-center gap-4"><Avatar className="h-12 w-12"><AvatarImage src={user?.photoURL || undefined} /><AvatarFallback><User /></AvatarFallback></Avatar><div><p className="font-semibold">{user?.displayName}</p><p className="text-sm text-muted-foreground">JEE Main Aspirant</p></div></CardContent></Card>
                    <Card className="text-center"><CardHeader><CardTitle className="flex items-center justify-center gap-2"><Timer />Time Left</CardTitle></CardHeader><CardContent><p className="font-mono text-4xl font-bold">{formatTime(timeLeft)}</p></CardContent></Card>
                    <Card><CardHeader><CardTitle>Question Palette</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-green-500"/><span>Answered ({summary.answered + summary.answeredAndMarked})</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-red-500"/><span>Not Answered ({summary.notAnswered})</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-gray-200"/><span>Not Visited ({summary.notVisited})</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-purple-500"/><span>Marked for Review ({summary.markedForReview + summary.answeredAndMarked})</span></div>
                            </div>
                            {sections.map(section => (
                                <div key={section.name} className="mb-4">
                                    <h4 className="font-semibold mb-2">{section.name}</h4>
                                    <div className="grid grid-cols-5 gap-2">
                                        {questions.filter(q => q.subject === section.name).map(q => {
                                            const originalIndex = questions.findIndex(origQ => origQ.id === q.id);
                                            return (
                                                <Button key={q.id} variant="outline" size="icon" className={cn('h-9 w-9', getStatusClasses(getQuestionStatus(q.id)), currentQuestion.id === q.id && 'ring-2 ring-primary ring-offset-2')} onClick={() => handleSelectQuestion(originalIndex)}>
                                                    {originalIndex + 1}
                                                </Button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <Button size="lg" className="w-full" onClick={() => setIsSubmitDialogOpen(true)}>Submit Test</Button>
                </div>
                <AlertDialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You will not be able to change your answers after submitting. Here is a summary:
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <div><span className="font-semibold text-foreground">Answered:</span> {summary.answered + summary.answeredAndMarked}</div>
                            <div><span className="font-semibold text-foreground">Not Answered:</span> {summary.notAnswered}</div>
                            <div><span className="font-semibold text-foreground">Marked for Review:</span> {summary.markedForReview + summary.answeredAndMarked}</div>
                            <div><span className="font-semibold text-foreground">Not Visited:</span> {summary.notVisited}</div>
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSubmitTest}>Submit</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}
