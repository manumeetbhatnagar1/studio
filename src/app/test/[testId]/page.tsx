'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, queryEqual } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Timer, User, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons';

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
  id: string | number;
  subject: SubjectName;
  questionText: string;
  type: QuestionType;
  options?: string[];
};

type Answer = {
  value: string | number;
  status: QuestionStatus;
};

type CustomTestConfig = {
    id: string;
    title: string;
    config: {
        subjects: {
            subjectId: string;
            subjectName: string;
            numQuestions: number;
            duration: number;
        }[];
    };
}

type OfficialTestConfig = {
    id: string;
    title: string;
    startTime: { toDate: () => Date };
    examCategory: 'JEE Main' | 'JEE Advanced' | 'Both';
    accessLevel: 'free' | 'paid';
    config: {
        subjects: {
            subjectId: string;
            subjectName: string;
            numQuestions: number;
            duration: number;
        }[];
    };
}

const shuffleArray = <T>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

export default function MockTestPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { testId } = useParams() as { testId: string };
    const searchParams = useSearchParams();
    const testType = searchParams.get('type');

    const [testTitle, setTestTitle] = useState('Loading Test...');
    const [questions, setQuestions] = useState<MockQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Map<string | number, Answer>>(new Map());
    const [timeLeft, setTimeLeft] = useState(180 * 60);
    const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

    useEffect(() => {
        const loadTest = async () => {
            if (!firestore || !user) return;
            setIsLoading(true);
            
            let testConfigSnap;
            let testConfig: CustomTestConfig | OfficialTestConfig;

            if (testType === 'custom') {
                const testConfigRef = doc(firestore, 'users', user.uid, 'custom_tests', testId);
                testConfigSnap = await getDoc(testConfigRef);
                testConfig = testConfigSnap.data() as CustomTestConfig;
            } else {
                const testConfigRef = doc(firestore, 'mock_tests', testId);
                testConfigSnap = await getDoc(testConfigRef);
                testConfig = testConfigSnap.data() as OfficialTestConfig;
            }
    
            if (testConfigSnap.exists()) {
                setTestTitle(testConfig.title);
                
                let allQuestions: MockQuestion[] = [];
                let totalDuration = 0;
    
                for (const subjectConfig of testConfig.config.subjects) {
                    totalDuration += subjectConfig.duration;

                    const queryConstraints = [
                        where('subjectId', '==', subjectConfig.subjectId)
                    ];

                    // For official tests, filter by access level. Custom tests can use any question.
                    if (testType !== 'custom') {
                        queryConstraints.push(where('accessLevel', '==', (testConfig as OfficialTestConfig).accessLevel));
                    }

                    const q = query(collection(firestore, 'practice_questions'), ...queryConstraints);

                    const qSnapshot = await getDocs(q);
                    const subjectQuestions = qSnapshot.docs.map(d => ({ ...(d.data() as any), id: d.id, subject: subjectConfig.subjectName })) as MockQuestion[];
                    
                    allQuestions.push(...shuffleArray(subjectQuestions).slice(0, subjectConfig.numQuestions));
                }
    
                setQuestions(allQuestions);
                setTimeLeft(totalDuration * 60);
            } else {
                setTestTitle("Test Not Found");
                setQuestions([]);
            }
            
            setIsLoading(false);
        };
        loadTest();
    }, [testId, testType, user, firestore]);

    // Timer effect
    useEffect(() => {
        if (isLoading || timeLeft <= 0) return;
        const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, isLoading]);

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

    const handleSubmitTest = () => {
        setIsSubmitDialogOpen(false);
        console.log('Test submitted!', { answers: Object.fromEntries(answers) });
        // Implement submission logic here
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
                <p className="text-muted-foreground mt-2">There may be no questions available for the subjects in this test.</p>
              </div>
            </div>
        );
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
                        <CardContent className="prose max-w-none"><p>{currentQuestion.questionText}</p></CardContent>
                    </Card>
                    <Card className="flex-grow">
                        <CardContent className="p-6">
                            {currentQuestion.type === 'MCQ' ? (
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
                        <AlertDialogHeader><AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                        <AlertDialogDescription>You will not be able to change your answers after submitting. Here is a summary:
                            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                                <p><span className="font-semibold">Answered:</span> {summary.answered + summary.answeredAndMarked}</p>
                                <p><span className="font-semibold">Not Answered:</span> {summary.notAnswered}</p>
                                <p><span className="font-semibold">Marked for Review:</span> {summary.markedForReview + summary.answeredAndMarked}</p>
                                <p><span className="font-semibold">Not Visited:</span> {summary.notVisited}</p>
                            </div>
                        </AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleSubmitTest}>Submit</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}
