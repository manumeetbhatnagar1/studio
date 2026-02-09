'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, IndianRupee, LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { add } from 'date-fns';
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// --- Types ---
type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
};

const paymentSchema = z.object({
    nameOnCard: z.string().min(1, 'Name on card is required'),
});

// --- Stripe Initialization ---
// It's crucial to load Stripe outside of a component's render to avoid recreating the Stripe object on every render.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

// --- CheckoutForm Component ---
// This component contains the actual form logic and interacts with Stripe.
const CheckoutForm = ({ plan }: { plan: SubscriptionPlan }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const form = useForm<z.infer<typeof paymentSchema>>({
        resolver: zodResolver(paymentSchema),
        defaultValues: { nameOnCard: user?.displayName || '' }
    });
     useEffect(() => {
        if (user?.displayName) {
            form.setValue('nameOnCard', user.displayName);
        }
    }, [user, form]);


    const handleSubmit = async (values: z.infer<typeof paymentSchema>) => {
        if (!stripe || !elements || !user || !plan) {
            toast({ variant: 'destructive', title: 'Error', description: 'Checkout is not ready. Please try again.' });
            return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
             toast({ variant: 'destructive', title: 'Error', description: 'Card details not found. Please try again.' });
            return;
        }

        setIsProcessing(true);

        // In a real application, this is where you would call your backend to create a PaymentIntent.
        // For this demo, we simulate a successful payment.

        console.log("Simulating payment processing for:", values);
        
        try {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // This is the logic that should run *after* a successful paymentIntent confirmation.
            const userRef = doc(firestore, 'users', user.uid);
            updateDocumentNonBlocking(userRef, {
                subscriptionPlanId: plan.id,
                subscriptionStatus: 'active',
            });
            
            const userSubscriptionRef = doc(firestore, 'users', user.uid, 'subscriptions', 'main');
            const now = new Date();
            const endDate = plan.billingInterval === 'monthly' ? add(now, { months: 1 }) : add(now, { years: 1 });
            
            setDocumentNonBlocking(userSubscriptionRef, {
                id: 'main',
                planId: plan.id,
                status: 'active',
                currentPeriodStart: now.toISOString(),
                currentPeriodEnd: endDate.toISOString(),
            }, { merge: true });

            toast({ title: 'Payment Successful!', description: `You have successfully subscribed to the ${plan.name}.` });
            router.push('/dashboard');
        } catch (error: any) {
             // This catch block is for synchronous errors or errors from the awaited promise (setTimeout).
             // Firestore errors are handled globally by the errorEmitter.
             toast({ variant: 'destructive', title: 'Operation Failed', description: error.message || 'An unexpected error occurred during the final steps of your subscription.' });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const cardElementOptions = {
        style: {
            base: {
                color: '#32325d',
                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                fontSmoothing: 'antialiased',
                fontSize: '16px',
                '::placeholder': {
                    color: '#aab7c4'
                }
            },
            invalid: {
                color: '#fa755a',
                iconColor: '#fa755a'
            }
        }
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
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <FormField control={form.control} name="nameOnCard" render={({ field }) => (
                            <FormItem><FormLabel>Name on Card</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormItem>
                           <FormLabel>Card Details</FormLabel>
                           <div className="p-3 border rounded-md">
                             <CardElement options={cardElementOptions}/>
                           </div>
                        </FormItem>
                        <Button type="submit" size="lg" className="w-full" disabled={isProcessing || !stripe}>
                            {isProcessing ? <LoaderCircle className="mr-2 animate-spin" /> : <IndianRupee className="mr-2" />}
                            Pay ₹{plan.price.toLocaleString()}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
};

// --- Main Page Component ---
export default function CheckoutPage() {
    const { planId } = useParams() as { planId: string };
    const firestore = useFirestore();
    
    const planDocRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return doc(firestore, 'subscription_plans', planId);
    }, [firestore, planId]);

    const { data: plan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);
    
    const renderContent = () => {
        if (isPlanLoading) {
            return (
                <div className="w-full max-w-2xl space-y-6">
                    <Skeleton className="h-48 w-full" />
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
                <Elements stripe={stripePromise}>
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
