'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useUser, useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, query, where, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Timer, User, LoaderCircle, ArrowLeft, Check, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons';

enum QuestionStatus {
  NotAnswered,
  Answered,
  MarkedForReview,
  AnsweredAndMarkedForReview,
  NotVisited,
}

type PracticeQuestion = {
  id: string;
  subjectId: string;
  topicId: string;
  questionText: string;
  questionType: 'MCQ' | 'Numerical';
  options?: string[];
  correctAnswer?: string;
  numericalAnswer?: number;
  subject: string; // Added from join
  imageUrl?: string;
  explanationImageUrl?: string;
};

type Answer = {
  value: string | number;
  status: QuestionStatus;
};

const QuestionExplanation: React.FC<{ question: PracticeQuestion; userAnswer: Answer | undefined }> = ({ question, userAnswer }) => {
    const isAttempted = userAnswer && userAnswer.value !== '';
    
    if (!isAttempted) {
        return null;
    }

    const isCorrect = 
        (question.questionType === 'MCQ' && question.correctAnswer === userAnswer.value) || 
        (question.questionType === 'Numerical' && Number(question.numericalAnswer) === Number(userAnswer.value));

    return (
        <Card className="mt-4 bg-muted/30 border-dashed">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    {isCorrect ? <Check className="h-5 w-5 text-green-500" /> : <XIcon className="h-5 w-5 text-red-500" />}
                    Feedback
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm font-semibold">
                    Your answer: <span className={cn("font-bold", isCorrect ? "text-green-600" : "text-red-600")}>{userAnswer.value}</span>
                </p>
                {!isCorrect && (
                    <p className="text-sm font-semibold">
                        Correct answer: <span className="font-bold text-green-600">{question.correctAnswer || question.numericalAnswer}</span>
                    </p>
                )}
                {question.explanationImageUrl && (
                    <div>
                        <p className="text-sm font-semibold text-muted-foreground">Explanation:</p>
                        <div className="mt-1 p-2 border rounded-md bg-muted/50">
                            <Image src={question.explanationImageUrl} alt="Explanation image" width={600} height={450} className="rounded-md object-contain mx-auto" />
                        </div>
                    </div>
                )}
                {isCorrect && !question.explanationImageUrl && (
                    <p className="text-green-600 font-medium">Excellent! Your answer is correct.</p>
                )}
                 {!isCorrect && !question.explanationImageUrl && (
                    <p className="text-red-600 font-medium">That's not quite right. Review the correct answer above.</p>
                )}
            </CardContent>
        </Card>
    );
};

const fetchPracticeQuestions = async (firestore: any, params: URLSearchParams): Promise<PracticeQuestion[]> => {
    const allFetchedQuestions: (Omit<PracticeQuestion, 'subject'>)[] = [];

    const topicsParam = params.get('topics'); // e.g., 'topicId1:5,topicId2:10'
    const topicIdParam = params.get('topicId');
    
    // Other filters
    const difficultyLevel = params.get('difficultyLevel');
    const accessLevel = params.get('accessLevel');
    const examTypeId = params.get('examTypeId');
    
    let topicsConfig: {topicId: string, count: number}[] = [];

    if (topicsParam) {
        topicsConfig = topicsParam.split(',').map(part => {
            const [topicId, countStr] = part.split(':');
            return { topicId, count: parseInt(countStr, 10) };
        });
    } else if (topicIdParam) {
        const count = params.get('count') ? parseInt(params.get('count')!, 10) : 10; // Default to 10 for single topic practice
        topicsConfig = [{ topicId: topicIdParam, count }];
    } else {
        return [];
    }

    for (const config of topicsConfig) {
        if (!config.topicId || isNaN(config.count) || config.count <= 0) continue;

        let q = query(
            collection(firestore, 'practice_questions'), 
            where('topicId', '==', config.topicId)
        );
        if (difficultyLevel) q = query(q, where('difficultyLevel', '==', difficultyLevel));
        if (accessLevel) q = query(q, where('accessLevel', '==', accessLevel));
        if (examTypeId) q = query(q, where('examTypeId', '==', examTypeId));
        
        const querySnapshot = await getDocs(q);
        const topicQuestions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Omit<PracticeQuestion, 'subject'>));

        const shuffled = [...topicQuestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, config.count);
        
        allFetchedQuestions.push(...selected);
    }
    
    const subjectsMap = new Map<string, string>();
    const subjectsSnapshot = await getDocs(collection(firestore, 'subjects'));
    subjectsSnapshot.forEach(doc => subjectsMap.set(doc.id, doc.data().name));

    const questionsWithSubjects = allFetchedQuestions.map(q => ({
        ...q,
        subject: subjectsMap.get(q.subjectId) || 'Unknown Subject',
    }));

    return [...questionsWithSubjects].sort(() => 0.5 - Math.random());
};


function PracticeSession() {
    const { user } = useUser();
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFinished, setIsFinished] = useState(false);
    const [score, setScore] = useState(0);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Map<string | number, Answer>>(new Map());
    const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

    useEffect(() => {
        const loadTest = async () => {
            if (!firestore || !user) return;
            setIsLoading(true);
            const fetchedQuestions = await fetchPracticeQuestions(firestore, searchParams);
            setQuestions(fetchedQuestions);
            setIsLoading(false);
        };
        loadTest();
    }, [searchParams, user, firestore]);

    const sections = useMemo(() => {
        if (!questions.length) return [];
        const sectionMap: Record<string, PracticeQuestion[]> = {};
        questions.forEach(q => {
            if (!sectionMap[q.subject]) sectionMap[q.subject] = [];
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
    
    const isAnswered = useMemo(() => {
        if (!currentQuestion) return false;
        const answer = answers.get(currentQuestion.id);
        // A question is considered answered if there is a non-empty value for it.
        return !!answer && answer.value !== '';
    }, [answers, currentQuestion]);

    const handleSelectQuestion = (index: number) => {
        if (isFinished) return;
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
        let correctAnswers = 0;
        answers.forEach((answer, qId) => {
            const question = questions.find(q => q.id === qId);
            if (!question) return;
            if (question.questionType === 'MCQ' && question.correctAnswer === answer.value) {
                correctAnswers++;
            } else if (question.questionType === 'Numerical' && Number(question.numericalAnswer) === Number(answer.value)) {
                correctAnswers++;
            }
        });
        setScore(correctAnswers);
        setIsFinished(true);

        if (user && firestore) {
            const practiceResultsRef = collection(firestore, 'users', user.uid, 'practice_results');
            const topicIds = Array.from(new Set(questions.map(q => q.topicId)));
            addDocumentNonBlocking(practiceResultsRef, {
                topics: topicIds,
                questionsAttempted: answers.size,
                questionsCorrect: correctAnswers,
                totalQuestions: questions.length,
                submittedAt: serverTimestamp(),
            });
        }
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
              <p className="ml-4 text-lg">Setting up your practice session...</p>
            </div>
        );
    }
    
    if (!currentQuestion) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Practice Session</h1>
                <p className="text-lg text-destructive">Could not load any questions.</p>
                <p className="text-muted-foreground mt-2">There may be no questions available for your selected filters.</p>
                <Button onClick={() => router.back()} className="mt-4"><ArrowLeft className='mr-2'/>Go Back</Button>
              </div>
            </div>
        );
    }

    if(isFinished) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen py-8">
                <Card className="w-full max-w-2xl text-center shadow-2xl">
                    <CardHeader>
                        <CardTitle className="font-headline text-3xl">Practice Session Finished!</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-lg text-muted-foreground">Here's how you did:</p>
                        <div className="text-6xl font-bold text-primary">{score} / {questions.length}</div>
                        <p className="font-semibold text-2xl">
                            {questions.length > 0 ? ((score / questions.length) * 100).toFixed(2) : '0.00'}%
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-4 max-h-96 overflow-y-auto">
                            {questions.map((q, i) => {
                                const ans = answers.get(q.id);
                                const isCorrect = (q.questionType === 'MCQ' && q.correctAnswer === ans?.value) || (q.questionType === 'Numerical' && Number(q.numericalAnswer) === Number(ans?.value));
                                return (
                                    <div key={q.id} className="flex items-start gap-2 p-2 border-b">
                                        {isCorrect ? <Check className="h-5 w-5 text-green-500 mt-1" /> : <XIcon className="h-5 w-5 text-red-500 mt-1" />}
                                        <div className="flex-1">
                                            <p className="font-medium">Q{i+1}: {q.questionText}</p>
                                            {q.imageUrl && (
                                                <div className="my-2 p-2 border rounded-md bg-muted/50">
                                                    <Image src={q.imageUrl} alt={`Question ${i + 1} image`} width={450} height={300} className="rounded-md object-contain mx-auto" />
                                                </div>
                                            )}
                                            <p className="text-sm">Your answer: <span className="font-semibold">{ans?.value || 'Not Answered'}</span></p>
                                            {!isCorrect && <p className="text-sm">Correct answer: <span className="font-semibold text-green-600">{q.correctAnswer || q.numericalAnswer}</span></p>}
                                            {q.explanationImageUrl && (
                                                <div className="my-2">
                                                    <p className="text-sm font-semibold text-muted-foreground">Explanation:</p>
                                                    <div className="mt-1 p-2 border rounded-md bg-muted/50">
                                                        <Image src={q.explanationImageUrl} alt={`Explanation for question ${i + 1}`} width={450} height={300} className="rounded-md object-contain mx-auto" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
                <Button onClick={() => router.push('/practice')} className="mt-8">Practice Again</Button>
            </div>
        )
    }

    return (
        <>
            <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
                <div className="flex items-center gap-2"><Logo className="w-8 h-8 text-primary" /><span className="font-headline text-2xl font-semibold text-primary">DCAM Classes</span></div>
                <div><h1 className="font-headline text-xl font-semibold text-center">Practice Session</h1></div>
                <div className="w-48"></div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4">
                {/* Left Panel: Question Area */}
                <div className="flex flex-col gap-4">
                    <Card>
                      <CardHeader className="flex flex-row justify-between items-center"><CardTitle>Question No. {currentQuestionIndex + 1}</CardTitle></CardHeader>
                      <CardContent className="prose max-w-none">
                          <p>{currentQuestion.questionText}</p>
                          {currentQuestion.imageUrl && (
                              <div className="my-4 p-2 border rounded-md bg-muted/50">
                                  <Image src={currentQuestion.imageUrl} alt={`Question image`} width={600} height={450} className="rounded-md object-contain mx-auto" />
                              </div>
                          )}
                      </CardContent>
                    </Card>
                    <Card className="flex-grow">
                        <CardContent className="p-6">
                            {currentQuestion.questionType === 'MCQ' ? (
                                <RadioGroup value={answers.get(currentQuestion.id)?.value as string || ''} onValueChange={handleAnswerChange} disabled={isFinished || isAnswered}>
                                    {currentQuestion.options?.map((option, index) => (
                                        <div key={index} className="flex items-center space-x-2 p-3 rounded-md hover:bg-muted"><RadioGroupItem value={option} id={`option-${index}`} /><Label htmlFor={`option-${index}`} className="flex-1 text-base">{option}</Label></div>
                                    ))}
                                </RadioGroup>
                            ) : (<><Label htmlFor="numerical-answer" className="text-lg">Your Answer</Label><Input id="numerical-answer" type="number" className="mt-2 text-base" placeholder="Enter your numerical answer" value={answers.get(currentQuestion.id)?.value || ''} onChange={(e) => handleAnswerChange(e.target.value)} disabled={isFinished || isAnswered} /></>)}
                        </CardContent>
                    </Card>

                    <QuestionExplanation question={currentQuestion} userAnswer={answers.get(currentQuestion.id)} />

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSaveAndNext} disabled={isFinished}>Save & Next</Button>
                        <Button variant="secondary" onClick={handleMarkForReview} disabled={isFinished || isAnswered}>Mark for Review & Next</Button>
                        <Button variant="outline" onClick={handleClearResponse} disabled={isFinished || isAnswered}>Clear Response</Button>
                    </div>
                </div>
                {/* Right Panel: Info and Navigation */}
                <div className="flex flex-col gap-4">
                    <Card><CardContent className="p-4 flex items-center gap-4"><Avatar className="h-12 w-12"><AvatarImage src={user?.photoURL || undefined} /><AvatarFallback><User /></AvatarFallback></Avatar><div><p className="font-semibold">{user?.displayName}</p><p className="text-sm text-muted-foreground">JEE Main Aspirant</p></div></CardContent></Card>
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
                    <Button size="lg" className="w-full" onClick={() => setIsSubmitDialogOpen(true)} disabled={isFinished}>Submit Test</Button>
                </div>
                <AlertDialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You will not be able to change your answers after submitting. Here is a summary:
                            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                                <div><span className="font-semibold">Answered:</span> {summary.answered + summary.answeredAndMarked}</div>
                                <div><span className="font-semibold">Not Answered:</span> {summary.notAnswered}</div>
                                <div><span className="font-semibold">Marked for Review:</span> {summary.markedForReview + summary.answeredAndMarked}</div>
                                <div><span className="font-semibold">Not Visited:</span> {summary.notVisited}</div>
                            </div>
                        </AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleSubmitTest}>Submit</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}


export default function PracticeSessionPage() {
    return (
      <Suspense fallback={
          <div className="flex h-screen w-screen items-center justify-center">
              <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Setting up your practice session...</p>
          </div>
      }>
        <PracticeSession />
      </Suspense>
    );
  }
