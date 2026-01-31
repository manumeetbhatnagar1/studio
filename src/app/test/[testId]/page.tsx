'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Timer, CheckCircle, XCircle, Eye, HelpCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';


type QuestionType = 'MCQ' | 'Numerical';
type Subject = 'Physics' | 'Chemistry' | 'Mathematics';
enum QuestionStatus {
  NotAnswered,
  Answered,
  MarkedForReview,
  AnsweredAndMarkedForReview,
  NotVisited,
}

type MockQuestion = {
  id: number;
  subject: Subject;
  question: string;
  type: QuestionType;
  options?: string[];
};

type Answer = {
  value: string | number;
  status: QuestionStatus;
};

// Hardcoded sample questions for JEE Main pattern
const sampleQuestions: MockQuestion[] = Array.from({ length: 90 }, (_, i) => {
    const id = i + 1;
    let subject: Subject;
    if (id <= 30) subject = 'Physics';
    else if (id <= 60) subject = 'Chemistry';
    else subject = 'Mathematics';

    const isMcq = (id % 30 <= 20 && id % 30 !== 0) || (id % 30 === 0 && 20 === 30);
    
    return {
        id,
        subject,
        question: `This is question number ${id}. It is a ${isMcq ? 'Multiple Choice' : 'Numerical'} question from the subject of ${subject}. What is the correct answer?`,
        type: isMcq ? 'MCQ' : 'Numerical',
        ...(isMcq && { options: ['Option A', 'Option B', 'Option C', 'Option D'] }),
    };
});

const sections = [
    { name: 'Physics', questions: sampleQuestions.slice(0, 30) },
    { name: 'Chemistry', questions: sampleQuestions.slice(30, 60) },
    { name: 'Mathematics', questions: sampleQuestions.slice(60, 90) },
];


export default function MockTestPage() {
    const { user } = useUser();
    const { testId } = useParams();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Map<number, Answer>>(new Map());
    const [timeLeft, setTimeLeft] = useState(180 * 60); // 180 minutes in seconds
    const [activeSection, setActiveSection] = useState<Subject>('Physics');
    const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

    // Timer effect
    useEffect(() => {
        if (timeLeft <= 0) {
            // Auto-submit logic
            return;
        }
        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const getQuestionStatus = useCallback((questionId: number) => {
        const answer = answers.get(questionId);
        if (!answer) return QuestionStatus.NotVisited;
        return answer.status;
    }, [answers]);


    const currentQuestion = sampleQuestions[currentQuestionIndex];

    const handleSelectQuestion = (index: number) => {
        const currentStatus = getQuestionStatus(currentQuestion.id);
        if (currentStatus === QuestionStatus.NotVisited) {
            const newAnswers = new Map(answers);
            newAnswers.set(currentQuestion.id, { value: '', status: QuestionStatus.NotAnswered });
            setAnswers(newAnswers);
        }
        setCurrentQuestionIndex(index);
        setActiveSection(sampleQuestions[index].subject);
    };
    
    const handleSaveAndNext = () => {
        // This function assumes an answer has been made and moves to the next question
        if (currentQuestionIndex < sampleQuestions.length - 1) {
            handleSelectQuestion(currentQuestionIndex + 1);
        }
    };
    
    const handleMarkForReview = () => {
        const currentAnswer = answers.get(currentQuestion.id);
        const newAnswers = new Map(answers);
        const newStatus = currentAnswer?.value ? QuestionStatus.AnsweredAndMarkedForReview : QuestionStatus.MarkedForReview;
        newAnswers.set(currentQuestion.id, { value: currentAnswer?.value || '', status: newStatus });
        setAnswers(newAnswers);

        if (currentQuestionIndex < sampleQuestions.length - 1) {
            handleSelectQuestion(currentQuestionIndex + 1);
        }
    };
    
    const handleClearResponse = () => {
        const newAnswers = new Map(answers);
        newAnswers.set(currentQuestion.id, { value: '', status: QuestionStatus.NotAnswered });
        setAnswers(newAnswers);
    };

    const handleAnswerChange = (value: string | number) => {
        const newAnswers = new Map(answers);
        const currentStatus = getQuestionStatus(currentQuestion.id);
        const newStatus = currentStatus === QuestionStatus.MarkedForReview || currentStatus === QuestionStatus.AnsweredAndMarkedForReview
            ? QuestionStatus.AnsweredAndMarkedForReview
            : QuestionStatus.Answered;
        newAnswers.set(currentQuestion.id, { value, status: newStatus });
        setAnswers(newAnswers);
    };

    const handleSubmitTest = () => {
        setIsSubmitDialogOpen(false);
        // Implement submission logic here
        console.log('Test submitted!', { answers: Object.fromEntries(answers) });
    };

    const getStatusClasses = (status: QuestionStatus) => {
        switch (status) {
            case QuestionStatus.Answered: return 'bg-green-500 text-white';
            case QuestionStatus.NotAnswered: return 'bg-red-500 text-white';
            case QuestionStatus.MarkedForReview: return 'bg-purple-500 text-white';
            case QuestionStatus.AnsweredAndMarkedForReview: return 'bg-purple-500 text-white relative after:content-[\'✔\'] after:absolute after:bottom-0 after:right-0 after:text-xs';
            case QuestionStatus.NotVisited: return 'bg-gray-200 text-gray-800';
            default: return 'bg-gray-200 text-gray-800';
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };
    
    const summary = useMemo(() => {
        let answered = 0, notAnswered = 0, notVisited = 0, markedForReview = 0;
        for (let i = 0; i < sampleQuestions.length; i++) {
            const status = getQuestionStatus(sampleQuestions[i].id);
            switch (status) {
                case QuestionStatus.Answered:
                case QuestionStatus.AnsweredAndMarkedForReview:
                    answered++;
                    break;
                case QuestionStatus.NotAnswered:
                    notAnswered++;
                    break;
                case QuestionStatus.MarkedForReview:
                    markedForReview++;
                    break;
                case QuestionStatus.NotVisited:
                    notVisited++;
                    break;
            }
        }
         // current question is "not answered" until interacted with
        if (getQuestionStatus(currentQuestion.id) === QuestionStatus.NotVisited) {
            notVisited--;
            notAnswered++;
        }
        return { answered, notAnswered, notVisited, markedForReview: markedForReview + Array.from(answers.values()).filter(a => a.status === QuestionStatus.AnsweredAndMarkedForReview).length };
    }, [answers, currentQuestion, getQuestionStatus]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4 h-full">
            {/* Left Panel: Question Area */}
            <div className="flex flex-col gap-4">
                <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle>Question No. {currentQuestionIndex + 1}</CardTitle>
                        <div className='flex gap-4 text-sm'>
                            <Badge variant="secondary">Marks: +4</Badge>
                            <Badge variant="destructive">Negative Marks: -1</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="prose max-w-none">
                        <p>{currentQuestion.question}</p>
                    </CardContent>
                </Card>

                <Card className="flex-grow">
                    <CardContent className="p-6">
                        {currentQuestion.type === 'MCQ' ? (
                            <RadioGroup value={answers.get(currentQuestion.id)?.value as string || ''} onValueChange={handleAnswerChange}>
                                {currentQuestion.options?.map((option, index) => (
                                    <div key={index} className="flex items-center space-x-2 p-3 rounded-md hover:bg-muted">
                                        <RadioGroupItem value={option} id={`option-${index}`} />
                                        <Label htmlFor={`option-${index}`} className="flex-1 text-base">{option}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        ) : (
                            <div>
                                <Label htmlFor="numerical-answer" className="text-lg">Your Answer</Label>
                                <Input
                                    id="numerical-answer"
                                    type="number"
                                    className="mt-2 text-base"
                                    placeholder="Enter your numerical answer"
                                    value={answers.get(currentQuestion.id)?.value || ''}
                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                />
                            </div>
                        )}
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
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <Avatar className="h-12 w-12"><AvatarImage src={user?.photoURL || undefined} /><AvatarFallback><User /></AvatarFallback></Avatar>
                        <div>
                            <p className="font-semibold">{user?.displayName}</p>
                            <p className="text-sm text-muted-foreground">JEE Main Aspirant</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="text-center">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2"><Timer />Time Left</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-mono text-4xl font-bold">{formatTime(timeLeft)}</p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle>Question Palette</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-green-500"/><span>Answered ({summary.answered})</span></div>
                            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-red-500"/><span>Not Answered ({summary.notAnswered})</span></div>
                            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-gray-200"/><span>Not Visited ({summary.notVisited})</span></div>
                            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-purple-500"/><span>Marked for Review ({summary.markedForReview})</span></div>
                        </div>

                        {sections.map(section => (
                            <div key={section.name} className="mb-4">
                                <h4 className="font-semibold mb-2">{section.name}</h4>
                                <div className="grid grid-cols-5 gap-2">
                                    {section.questions.map(q => (
                                        <Button
                                            key={q.id}
                                            variant="outline"
                                            size="icon"
                                            className={cn('h-9 w-9', getStatusClasses(getQuestionStatus(q.id)), currentQuestion.id === q.id && 'ring-2 ring-primary ring-offset-2')}
                                            onClick={() => handleSelectQuestion(q.id - 1)}
                                        >
                                            {q.id}
                                        </Button>
                                    ))}
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
                        You will not be able to change your answers after submitting. Here is a summary of your attempt:
                        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                            <p><span className="font-semibold">Answered:</span> {summary.answered}</p>
                             <p><span className="font-semibold">Not Answered:</span> {summary.notAnswered}</p>
                            <p><span className="font-semibold">Marked for Review:</span> {summary.markedForReview}</p>
                            <p><span className="font-semibold">Not Visited:</span> {summary.notVisited}</p>
                        </div>
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmitTest}>Submit</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
