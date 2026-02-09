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
import Script from 'next/script';
import { createRazorpayOrder, verifyRazorpayPayment } from '@/app/actions';

// --- Types ---
type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
};

declare global {
  interface Window {
    Razorpay: any;
  }
}

// --- Main Page Component ---
export default function CheckoutPage() {
    const { planId } = useParams() as { planId: string };
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    
    const planDocRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return doc(firestore, 'subscription_plans', planId);
    }, [firestore, planId]);

    const { data: plan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);

    const initializePayment = async () => {
        if (!plan || !user) {
            toast({ variant: 'destructive', title: 'Error', description: 'Plan or user not found.' });
            return;
        }

        setIsProcessing(true);

        // 1. Create Order on the server
        const orderResult = await createRazorpayOrder(plan.price);
        if (orderResult.error || !orderResult.orderId) {
            toast({ variant: 'destructive', title: 'Payment Error', description: orderResult.error || "Could not create a payment order." });
            setIsProcessing(false);
            return;
        }

        // 2. Open Razorpay Checkout
        const options = {
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            amount: plan.price * 100,
            currency: "INR",
            name: "DCAM Classes",
            description: `Subscription: ${plan.name}`,
            order_id: orderResult.orderId,
            handler: async function (response: any) {
                // 3. Verify Payment on the server
                const verificationResult = await verifyRazorpayPayment(
                    response.razorpay_order_id,
                    response.razorpay_payment_id,
                    response.razorpay_signature
                );

                if (verificationResult.verified) {
                    // 4. Update Database on successful verification
                    try {
                        const userRef = doc(firestore, 'users', user.uid);
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

                        router.push(`/checkout/completion?status=success&plan=${plan.name}`);

                    } catch (dbError: any) {
                         toast({ variant: 'destructive', title: 'Database Update Failed', description: `Payment was successful, but we failed to update your subscription. Please contact support. Error: ${dbError.message}` });
                         router.push(`/checkout/completion?status=error`);
                    }

                } else {
                     toast({ variant: 'destructive', title: 'Payment Verification Failed', description: verificationResult.error || 'Could not verify payment. Please contact support.' });
                     router.push(`/checkout/completion?status=error`);
                }
            },
            prefill: {
                name: user.displayName || "DCAM User",
                email: user.email || "",
                contact: user.phoneNumber || "",
            },
            notes: {
                planId: plan.id,
                userId: user.uid,
            },
            theme: {
                color: "#4338ca"
            }
        };
        
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response: any){
            toast({ variant: 'destructive', title: 'Payment Failed', description: response.error.description });
            setIsProcessing(false);
        });
        
        rzp.open();
        // Set processing to false after opening, as Razorpay handles the UI from here.
        // If it fails, the on.('payment.failed') will fire.
        setIsProcessing(false);
    };
    
    const renderContent = () => {
        if (isPlanLoading) {
            return (
                <div className="w-full max-w-2xl space-y-6">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            );
        }

        if (!plan) {
            return (
                <Card className="w-full max-w-2xl"><CardHeader><CardTitle>Plan Not Found</CardTitle><CardDescription>The subscription plan you selected could not be found.</CardDescription></CardHeader></Card>
            );
        }
        
        if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
             return (
                <Card className="w-full max-w-2xl"><CardHeader><CardTitle className="text-destructive">Razorpay Not Configured</CardTitle><CardDescription>The application is missing the Razorpay Key ID. Please add it to your .env file.</CardDescription></CardHeader></Card>
            );
        }

        return (
            <div className="w-full max-w-2xl grid gap-8">
                <Card>
                    <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
                    <CardContent className="flex justify-between items-center">
                        <div><p className="font-semibold text-lg">{plan.name}</p><p className="text-muted-foreground">{plan.billingInterval === 'monthly' ? 'Billed Monthly' : 'Billed Yearly'}</p></div>
                        <p className="text-2xl font-bold flex items-center"><IndianRupee className="h-6 w-6"/>{plan.price.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Button onClick={initializePayment} size="lg" className="w-full" disabled={isProcessing}>
                    {isProcessing ? <LoaderCircle className="mr-2 animate-spin" /> : <CreditCard className="mr-2" />}
                    Pay ₹{plan.price.toLocaleString()} Securely
                </Button>
            </div>
        );
    }
    
    return (
        <>
            <Script
                id="razorpay-checkout-js"
                src="https://checkout.razorpay.com/v1/checkout.js"
                onLoad={() => {
                    if (!window.Razorpay) {
                        toast({ variant: 'destructive', title: 'Network Error', description: 'Could not load payment gateway. Please check your connection and try again.'});
                    }
                }}
            />
            <div className="flex flex-col h-full">
                <DashboardHeader title="Checkout" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex justify-center">
                    {renderContent()}
                </main>
            </div>
        </>
    )
}