'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { add } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function CompletionContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const [message, setMessage] = useState<string | null>(null);
    const [status, setStatus] = useState<'success' | 'error' | 'processing'>('processing');

    useEffect(() => {
        if (!stripePromise) {
            setStatus('error');
            setMessage('Stripe is not configured.');
            return;
        }

        const clientSecret = searchParams.get('payment_intent_client_secret');
        const planId = searchParams.get('planId');

        if (!clientSecret) {
            setStatus('error');
            setMessage('Payment information is missing.');
            return;
        }

        stripePromise.then(stripe => {
            if (!stripe) {
                 setStatus('error');
                 setMessage('Stripe failed to initialize.');
                 return;
            }
            stripe.retrievePaymentIntent(clientSecret).then(async ({ paymentIntent }) => {
                switch (paymentIntent?.status) {
                    case 'succeeded':
                        setMessage('Payment successful! Updating your subscription...');
                        
                        if (user && firestore) {
                            try {
                                if (!planId) {
                                    throw new Error("Subscription plan ID is missing from the return URL.");
                                }

                                const userRef = doc(firestore, 'users', user.uid);
                                const planRef = doc(firestore, 'subscription_plans', planId);

                                const planDoc = await getDoc(planRef);
                                if (!planDoc.exists()) throw new Error("Subscribed plan not found in database.");
                                const plan = planDoc.data();
                                
                                const userSubscriptionRef = doc(firestore, 'users', user.uid, 'subscriptions', 'main');
                                const now = new Date();
                                const endDate = plan.billingInterval === 'monthly' ? add(now, { months: 1 }) : add(now, { years: 1 });
                                
                                await updateDocumentNonBlocking(userRef, { 
                                    subscriptionStatus: 'active',
                                    subscriptionPlanId: planId,
                                });

                                await setDocumentNonBlocking(userSubscriptionRef, {
                                    id: 'main',
                                    planId: planId,
                                    status: 'active',
                                    currentPeriodStart: now.toISOString(),
                                    currentPeriodEnd: endDate.toISOString(),
                                }, { merge: true });

                                toast({ title: 'Subscription Activated!', description: 'You now have full access.' });
                                setStatus('success');
                                setMessage('Your subscription has been activated! You will be redirected shortly.');
                                setTimeout(() => router.push('/dashboard'), 3000);

                            } catch(error: any) {
                                setStatus('error');
                                setMessage(`Payment was successful, but we failed to update your subscription. Please contact support. Error: ${error.message}`);
                            }
                        } else {
                            setStatus('error');
                            setMessage('Payment was successful, but we could not find your user account to update the subscription. Please contact support.');
                        }
                        
                        break;
                    case 'processing':
                        setStatus('processing');
                        setMessage("Payment processing. We'll update you when payment is received.");
                        break;
                    case 'requires_payment_method':
                        setStatus('error');
                        setMessage('Payment failed. Please try another payment method.');
                        break;
                    default:
                        setStatus('error');
                        setMessage('Something went wrong.');
                        break;
                }
            });
        });

    }, [stripePromise, searchParams, toast, user, firestore, router]);

    const renderStatus = () => {
        switch (status) {
            case 'processing':
                return <LoaderCircle className="h-16 w-16 text-muted-foreground animate-spin" />;
            case 'success':
                return <CheckCircle className="h-16 w-16 text-green-500" />;
            case 'error':
                return <XCircle className="h-16 w-16 text-destructive" />;
        }
    };
    
    const cardTitle = {
        processing: 'Processing Payment...',
        success: 'Payment Successful!',
        error: 'Payment Failed'
    }

    return (
        <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
                <div className="mx-auto mb-4">{renderStatus()}</div>
                <CardTitle>{cardTitle[status]}</CardTitle>
                <CardDescription>{message || 'Please wait...'}</CardDescription>
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
