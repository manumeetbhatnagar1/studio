'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, IndianRupee, LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { add } from 'date-fns';
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createPaymentIntent } from '@/app/actions';

// --- Types ---
type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
};

// --- Stripe Initialization ---
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// --- CheckoutForm Component ---
const CheckoutForm = ({ plan }: { plan: SubscriptionPlan }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { user } = useUser();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!stripe || !elements || !user || !plan) {
            toast({ variant: 'destructive', title: 'Error', description: 'Checkout is not ready. Please try again.' });
            return;
        }

        setIsProcessing(true);
        setErrorMessage(null);

        const { error: submitError } = await elements.submit();
        if (submitError) {
          setErrorMessage(submitError.message || "An unexpected error occurred.");
          setIsProcessing(false);
          return;
        }

        // The payment intent is already created on page load.
        // Now we just confirm it.
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/checkout/completion?planId=${plan.id}`,
                receipt_email: user.email || undefined,
            },
            // The redirect will happen automatically if payment is successful
            // or requires another step. We handle the db update on the completion page.
        });

        // This point will only be reached if there is an immediate error during confirmation.
        // Otherwise, the user is redirected to the `return_url`.
        if (error) {
            if (error.type === "card_error" || error.type === "validation_error") {
                setErrorMessage(error.message || "An unexpected error occurred.");
            } else {
                setErrorMessage("An unexpected error occurred.");
            }
        }
        
        setIsProcessing(false);
    };

    return (
         <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard /> Payment Details
                </CardTitle>
                <CardDescription>Enter your payment information to complete the subscription.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <PaymentElement />
                    {errorMessage && <div className="text-destructive text-sm font-medium">{errorMessage}</div>}
                    <Button type="submit" size="lg" className="w-full" disabled={isProcessing || !stripe || !elements}>
                        {isProcessing ? <LoaderCircle className="mr-2 animate-spin" /> : <IndianRupee className="mr-2" />}
                        Pay ₹{plan.price.toLocaleString()}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

// --- Main Page Component ---
export default function CheckoutPage() {
    const { planId } = useParams() as { planId: string };
    const firestore = useFirestore();
    const { toast } = useToast();
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    
    const planDocRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return doc(firestore, 'subscription_plans', planId);
    }, [firestore, planId]);

    const { data: plan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);
    
    useEffect(() => {
        if (plan?.price) {
            createPaymentIntent(plan.price)
                .then(data => {
                    if (data.error) {
                        toast({ variant: 'destructive', title: 'Payment Error', description: data.error });
                        setClientSecret(null);
                    } else {
                        setClientSecret(data.clientSecret);
                    }
                });
        }
    }, [plan, toast]);
    
    const renderContent = () => {
        if (isPlanLoading) {
            return (
                <div className="w-full max-w-2xl space-y-6">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            );
        }

        if (!plan) {
            return (
                <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle>Plan Not Found</CardTitle>
                        <CardDescription>The subscription plan you selected could not be found.</CardDescription>
                    </CardHeader>
                </Card>
            );
        }
        
        if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
             return (
                <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-destructive">Stripe Not Configured</CardTitle>
                        <CardDescription>The application is missing the Stripe publishable key. Please add it to your .env file.</CardDescription>
                    </CardHeader>
                </Card>
            );
        }

        if (!clientSecret) {
             return (
                <div className="w-full max-w-2xl space-y-6">
                    <Card><CardHeader><CardTitle>Order Summary</CardTitle></CardHeader><CardContent className="flex justify-between items-center"><div><p className="font-semibold text-lg">{plan.name}</p><p className="text-muted-foreground">{plan.billingInterval === 'monthly' ? 'Billed Monthly' : 'Billed Yearly'}</p></div><p className="text-2xl font-bold flex items-center"><IndianRupee className="h-6 w-6"/>{plan.price.toLocaleString()}</p></CardContent></Card>
                    <div className='flex items-center justify-center gap-2 p-8'><LoaderCircle className='animate-spin' /> Preparing payment form...</div>
                </div>
            );
        }

        return (
            <div className="w-full max-w-2xl grid gap-8">
                <Card>
                    <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
                    <CardContent className="flex justify-between items-center">
                        <div>
                            <p className="font-semibold text-lg">{plan.name}</p>
                            <p className="text-muted-foreground">{plan.billingInterval === 'monthly' ? 'Billed Monthly' : 'Billed Yearly'}</p>
                        </div>
                        <p className="text-2xl font-bold flex items-center"><IndianRupee className="h-6 w-6"/>{plan.price.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                    <CheckoutForm plan={plan} />
                </Elements>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Checkout" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex justify-center">
                {renderContent()}
            </main>
        </div>
    )
}
