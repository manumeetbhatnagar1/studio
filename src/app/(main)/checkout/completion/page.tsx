'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function CompletionContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const status = searchParams.get('status');
    const planName = searchParams.get('plan');

    useEffect(() => {
        if (status === 'success') {
            toast({ title: 'Subscription Activated!', description: `You now have full access to the ${planName || 'plan'}.` });
            setTimeout(() => router.push('/dashboard'), 3000);
        } else if (status === 'error') {
            // Error toasts are handled on the checkout page. This is a fallback.
             toast({ variant: 'destructive', title: 'An Error Occurred', description: 'Something went wrong with your payment. Please try again or contact support.' });
        }
    }, [status, planName, router, toast]);

    const renderStatus = () => {
        switch (status) {
            case 'success':
                return {
                    icon: <CheckCircle className="h-16 w-16 text-green-500" />,
                    title: 'Payment Successful!',
                    message: 'Your subscription is now active. You will be redirected to the dashboard shortly.'
                };
            case 'error':
                 return {
                    icon: <XCircle className="h-16 w-16 text-destructive" />,
                    title: 'Payment Failed',
                    message: 'There was an issue with your payment. Please try again or contact support if the problem persists.'
                };
            default:
                return {
                    icon: <LoaderCircle className="h-16 w-16 text-muted-foreground animate-spin" />,
                    title: 'Processing...',
                    message: 'Please wait while we confirm your payment status.'
                }
        }
    };

    const { icon, title, message } = renderStatus();
    
    return (
        <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
                <div className="mx-auto mb-4">{icon}</div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{message}</CardDescription>
            </CardHeader>
            {status !== 'processing' && (
                 <CardContent className="flex justify-center">
                    <Button asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
                 </CardContent>
            )}
        </Card>
    );
}


export default function CheckoutCompletionPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Suspense fallback={<LoaderCircle className="h-16 w-16 animate-spin" />}>
                <CompletionContent />
            </Suspense>
        </div>
    )
}
